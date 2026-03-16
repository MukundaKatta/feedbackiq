import type { Collector, CollectorConfig, CollectedReview } from "./types";

interface IntercomConfig extends CollectorConfig {
  accessToken?: string;
  surveyId?: string;
  conversationTagId?: string;
}

interface IntercomConversation {
  id: string;
  type: string;
  created_at: number;
  updated_at: number;
  source: {
    type: string;
    body: string;
    author: {
      type: string;
      id: string;
      name: string;
      email: string;
      avatar?: { image_url: string };
    };
  };
  conversation_rating?: {
    rating: number;
    remark: string;
    created_at: number;
    customer: {
      type: string;
      id: string;
      name: string;
    };
  };
  tags: {
    tags: { id: string; name: string }[];
  };
  statistics: {
    time_to_first_response: number;
    first_contact_reply_at: number;
  };
  conversation_parts: {
    conversation_parts: {
      id: string;
      part_type: string;
      body: string;
      author: {
        type: string;
        id: string;
        name: string;
      };
      created_at: number;
    }[];
  };
}

interface IntercomConversationsResponse {
  type: string;
  conversations: IntercomConversation[];
  pages: {
    next?: { starting_after: string };
    per_page: number;
    total_pages: number;
  };
}

interface IntercomSurveyResponse {
  id: string;
  contact: { id: string; type: string; name: string; email: string };
  survey_id: string;
  answers: {
    question_id: string;
    question_text: string;
    value: string | number;
  }[];
  created_at: number;
}

interface IntercomSurveyResponsesResponse {
  type: string;
  data: IntercomSurveyResponse[];
  pages: {
    next?: { starting_after: string };
  };
}

export class IntercomCollector implements Collector {
  readonly sourceType = "intercom" as const;
  private accessToken: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken || process.env.INTERCOM_ACCESS_TOKEN || "";
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Intercom-Version": "2.11",
    };
  }

  async fetchReviews(
    config: IntercomConfig,
    since?: Date
  ): Promise<CollectedReview[]> {
    const token = config.accessToken || this.accessToken;
    if (!token) {
      throw new Error("Intercom access token is required");
    }
    this.accessToken = token;

    const reviews: CollectedReview[] = [];

    // Fetch conversation ratings
    const ratedConversations = await this.fetchRatedConversations(since);
    reviews.push(...ratedConversations);

    // Fetch survey responses if surveyId is provided
    if (config.surveyId) {
      const surveyResponses = await this.fetchSurveyResponses(
        config.surveyId,
        since
      );
      reviews.push(...surveyResponses);
    }

    return reviews;
  }

  private async fetchRatedConversations(
    since?: Date
  ): Promise<CollectedReview[]> {
    const allReviews: CollectedReview[] = [];
    let startingAfter: string | undefined;

    while (true) {
      const url = new URL("https://api.intercom.io/conversations");
      url.searchParams.set("per_page", "50");
      url.searchParams.set(
        "display_as",
        "plaintext"
      );

      if (startingAfter) {
        url.searchParams.set("starting_after", startingAfter);
      }

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          query: {
            field: "conversation_rating.rating",
            operator: ">",
            value: 0,
          },
          sort: { field: "updated_at", order: "desc" },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Intercom API error: ${response.status} ${response.statusText}`
        );
      }

      const data: IntercomConversationsResponse = await response.json();

      for (const conversation of data.conversations) {
        if (!conversation.conversation_rating) continue;

        const createdAt = new Date(
          conversation.conversation_rating.created_at * 1000
        );
        if (since && createdAt <= since) {
          return allReviews;
        }

        const rating = conversation.conversation_rating.rating;
        const normalizedRating = Math.round((rating / 5) * 5);

        const content = [
          conversation.conversation_rating.remark
            ? `Rating comment: ${conversation.conversation_rating.remark}`
            : "",
          conversation.source?.body
            ? `Original message: ${conversation.source.body}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        if (!content.trim()) continue;

        allReviews.push({
          externalId: `ic_conv_${conversation.id}`,
          authorName:
            conversation.conversation_rating.customer?.name ||
            conversation.source?.author?.name ||
            null,
          authorAvatarUrl:
            conversation.source?.author?.avatar?.image_url || null,
          content,
          rating: normalizedRating,
          language: "en",
          publishedAt: createdAt.toISOString(),
          rawData: {
            conversation_id: conversation.id,
            rating: conversation.conversation_rating,
            tags: conversation.tags?.tags?.map((t) => t.name) || [],
          },
        });
      }

      if (!data.pages.next?.starting_after) break;
      startingAfter = data.pages.next.starting_after;
    }

    return allReviews;
  }

  private async fetchSurveyResponses(
    surveyId: string,
    since?: Date
  ): Promise<CollectedReview[]> {
    const allReviews: CollectedReview[] = [];
    let startingAfter: string | undefined;

    while (true) {
      let url = `https://api.intercom.io/surveys/${surveyId}/responses`;
      if (startingAfter) {
        url += `?starting_after=${startingAfter}`;
      }

      const response = await fetch(url, { headers: this.headers });

      if (!response.ok) {
        throw new Error(
          `Intercom Survey API error: ${response.status} ${response.statusText}`
        );
      }

      const data: IntercomSurveyResponsesResponse = await response.json();

      for (const surveyResponse of data.data) {
        const createdAt = new Date(surveyResponse.created_at * 1000);
        if (since && createdAt <= since) {
          return allReviews;
        }

        const answerTexts = surveyResponse.answers.map(
          (a) => `${a.question_text}: ${a.value}`
        );

        const numericAnswer = surveyResponse.answers.find(
          (a) => typeof a.value === "number"
        );
        const rating = numericAnswer
          ? Math.round((Number(numericAnswer.value) / 10) * 5)
          : null;

        allReviews.push({
          externalId: `ic_survey_${surveyResponse.id}`,
          authorName: surveyResponse.contact?.name || null,
          authorAvatarUrl: null,
          content: answerTexts.join("\n"),
          rating,
          language: "en",
          publishedAt: createdAt.toISOString(),
          rawData: surveyResponse as unknown as Record<string, unknown>,
        });
      }

      if (!data.pages.next?.starting_after) break;
      startingAfter = data.pages.next.starting_after;
    }

    return allReviews;
  }
}
