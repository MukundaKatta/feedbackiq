import type { Collector, CollectorConfig, CollectedReview } from "./types";
import crypto from "crypto";

interface TypeformConfig extends CollectorConfig {
  formId: string;
  webhookSecret?: string;
  personalAccessToken?: string;
  ratingFieldRef?: string;
  feedbackFieldRef?: string;
}

interface TypeformAnswer {
  field: {
    id: string;
    ref: string;
    type: string;
    title: string;
  };
  type: string;
  text?: string;
  number?: number;
  boolean?: boolean;
  choice?: { id: string; label: string; ref: string };
  choices?: { ids: string[]; labels: string[]; refs: string[] };
  date?: string;
  email?: string;
  url?: string;
  file_url?: string;
  phone_number?: string;
}

interface TypeformResponse {
  landing_id: string;
  token: string;
  response_id: string;
  landed_at: string;
  submitted_at: string;
  metadata: {
    user_agent: string;
    platform: string;
    referer: string;
    network_id: string;
    browser: string;
  };
  hidden?: Record<string, string>;
  calculated?: { score: number };
  answers: TypeformAnswer[];
}

interface TypeformResponsesResponse {
  total_items: number;
  page_count: number;
  items: TypeformResponse[];
}

export interface TypeformWebhookPayload {
  event_id: string;
  event_type: "form_response";
  form_response: TypeformResponse & {
    form_id: string;
    definition: {
      id: string;
      title: string;
      fields: { id: string; ref: string; title: string; type: string }[];
    };
  };
}

export class TypeformCollector implements Collector {
  readonly sourceType = "typeform" as const;

  async fetchReviews(
    config: TypeformConfig,
    since?: Date
  ): Promise<CollectedReview[]> {
    const token = config.personalAccessToken;
    if (!token) {
      throw new Error("Typeform personal access token is required for polling");
    }

    const allReviews: CollectedReview[] = [];
    let pageToken: string | undefined;
    const pageSize = 25;

    while (true) {
      const url = new URL(
        `https://api.typeform.com/forms/${config.formId}/responses`
      );
      url.searchParams.set("page_size", pageSize.toString());
      url.searchParams.set("sort", "submitted_at,desc");

      if (since) {
        url.searchParams.set("since", since.toISOString());
      }
      if (pageToken) {
        url.searchParams.set("before", pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Typeform API error: ${response.status} ${response.statusText}`
        );
      }

      const data: TypeformResponsesResponse = await response.json();

      for (const item of data.items) {
        const review = this.transformResponse(item, config);
        if (review) {
          allReviews.push(review);
        }
      }

      if (data.items.length < pageSize) break;
      pageToken =
        data.items[data.items.length - 1]?.token;
      if (!pageToken) break;
    }

    return allReviews;
  }

  /**
   * Process an incoming Typeform webhook payload.
   * Call this from your webhook endpoint after signature verification.
   */
  processWebhook(
    payload: TypeformWebhookPayload,
    config: TypeformConfig
  ): CollectedReview | null {
    if (payload.event_type !== "form_response") return null;
    return this.transformResponse(payload.form_response, config);
  }

  /**
   * Verify the Typeform webhook signature (HMAC SHA-256).
   */
  static verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const hash = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("base64");
    const expectedSignature = `sha256=${hash}`;
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  private transformResponse(
    item: TypeformResponse,
    config: TypeformConfig
  ): CollectedReview | null {
    const answers = item.answers || [];

    // Find rating answer
    let rating: number | null = null;
    if (config.ratingFieldRef) {
      const ratingAnswer = answers.find(
        (a) => a.field.ref === config.ratingFieldRef
      );
      if (ratingAnswer) {
        rating = ratingAnswer.number ?? null;
      }
    } else {
      // Auto-detect: look for OpinionScale or Rating type
      const ratingAnswer = answers.find(
        (a) =>
          a.field.type === "opinion_scale" ||
          a.field.type === "rating" ||
          a.field.type === "nps"
      );
      if (ratingAnswer) {
        const rawRating = ratingAnswer.number ?? 0;
        // Normalize NPS (0-10) to 1-5 scale
        if (ratingAnswer.field.type === "nps") {
          rating = Math.round((rawRating / 10) * 5);
        } else {
          rating = rawRating;
        }
      }
    }

    // Find feedback text answer
    let feedbackText = "";
    if (config.feedbackFieldRef) {
      const feedbackAnswer = answers.find(
        (a) => a.field.ref === config.feedbackFieldRef
      );
      if (feedbackAnswer) {
        feedbackText = feedbackAnswer.text || "";
      }
    } else {
      // Collect all text answers
      const textAnswers = answers
        .filter(
          (a) =>
            a.field.type === "long_text" ||
            a.field.type === "short_text"
        )
        .map((a) => {
          const title = a.field.title;
          const text = a.text || "";
          return `${title}: ${text}`;
        });
      feedbackText = textAnswers.join("\n\n");
    }

    if (!feedbackText.trim() && rating === null) return null;

    // Build content from all answers if no specific text feedback
    if (!feedbackText.trim()) {
      const allAnswerTexts = answers.map((a) => {
        const title = a.field.title;
        const value =
          a.text ||
          a.number?.toString() ||
          a.choice?.label ||
          a.choices?.labels?.join(", ") ||
          a.boolean?.toString() ||
          "";
        return `${title}: ${value}`;
      });
      feedbackText = allAnswerTexts.join("\n");
    }

    const authorName =
      item.hidden?.["name"] ||
      item.hidden?.["customer_name"] ||
      answers.find(
        (a) =>
          a.field.type === "short_text" &&
          a.field.title.toLowerCase().includes("name")
      )?.text ||
      null;

    return {
      externalId: `tf_${item.response_id || item.token}`,
      authorName,
      authorAvatarUrl: null,
      content: feedbackText,
      rating,
      language: "en",
      publishedAt: new Date(item.submitted_at).toISOString(),
      rawData: item as unknown as Record<string, unknown>,
    };
  }
}
