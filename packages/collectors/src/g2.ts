import type { Collector, CollectorConfig, CollectedReview } from "./types";

interface G2Config extends CollectorConfig {
  productId: string;
  apiToken?: string;
}

interface G2Review {
  id: string;
  type: string;
  attributes: {
    title: string;
    star_rating: number;
    comment_answers: {
      love: { value: string };
      hate: { value: string };
      benefits: { value: string };
      recommendations: { value: string };
    };
    submitted_at: string;
    updated_at: string;
    is_public: boolean;
    product_name: string;
    user_name: string | null;
    company_name: string | null;
    industry: string | null;
    company_size: string | null;
  };
}

interface G2ReviewsResponse {
  data: G2Review[];
  meta: {
    current_page: number;
    total_pages: number;
    total_count: number;
  };
}

export class G2Collector implements Collector {
  readonly sourceType = "g2" as const;
  private apiToken: string;

  constructor(apiToken?: string) {
    this.apiToken = apiToken || process.env.G2_API_TOKEN || "";
  }

  async fetchReviews(
    config: G2Config,
    since?: Date
  ): Promise<CollectedReview[]> {
    const token = config.apiToken || this.apiToken;
    if (!token) {
      throw new Error("G2 API token is required");
    }

    const allReviews: CollectedReview[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(
        `https://data.g2.com/api/v1/products/${config.productId}/reviews`
      );
      url.searchParams.set("page[number]", page.toString());
      url.searchParams.set("page[size]", "25");
      url.searchParams.set("sort", "-submitted_at");

      if (since) {
        url.searchParams.set(
          "filter[submitted_at][gte]",
          since.toISOString()
        );
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Token token=${token}`,
          "Content-Type": "application/vnd.api+json",
          Accept: "application/vnd.api+json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `G2 API error: ${response.status} ${response.statusText}`
        );
      }

      const data: G2ReviewsResponse = await response.json();

      for (const review of data.data) {
        const attrs = review.attributes;
        const combinedContent = [
          attrs.comment_answers.love?.value
            ? `What I love: ${attrs.comment_answers.love.value}`
            : "",
          attrs.comment_answers.hate?.value
            ? `What I dislike: ${attrs.comment_answers.hate.value}`
            : "",
          attrs.comment_answers.benefits?.value
            ? `Benefits: ${attrs.comment_answers.benefits.value}`
            : "",
          attrs.comment_answers.recommendations?.value
            ? `Recommendations: ${attrs.comment_answers.recommendations.value}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        allReviews.push({
          externalId: review.id,
          authorName: attrs.user_name || "Anonymous G2 User",
          authorAvatarUrl: null,
          content: combinedContent || attrs.title,
          rating: attrs.star_rating,
          language: "en",
          publishedAt: new Date(attrs.submitted_at).toISOString(),
          rawData: review as unknown as Record<string, unknown>,
        });
      }

      page++;
      if (page > data.meta.total_pages) {
        hasMore = false;
      }
    }

    return allReviews;
  }
}
