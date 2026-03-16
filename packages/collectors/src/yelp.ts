import type { Collector, CollectorConfig, CollectedReview } from "./types";

interface YelpConfig extends CollectorConfig {
  businessId: string;
  apiKey?: string;
}

interface YelpReview {
  id: string;
  url: string;
  text: string;
  rating: number;
  time_created: string;
  user: {
    id: string;
    profile_url: string;
    image_url: string | null;
    name: string;
  };
}

interface YelpReviewsResponse {
  reviews: YelpReview[];
  total: number;
  possible_languages: string[];
}

export class YelpCollector implements Collector {
  readonly sourceType = "yelp" as const;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.YELP_API_KEY || "";
  }

  async fetchReviews(
    config: YelpConfig,
    since?: Date
  ): Promise<CollectedReview[]> {
    const key = config.apiKey || this.apiKey;
    if (!key) {
      throw new Error("Yelp API key is required");
    }

    const allReviews: CollectedReview[] = [];
    let offset = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(
        `https://api.yelp.com/v3/businesses/${config.businessId}/reviews`
      );
      url.searchParams.set("limit", limit.toString());
      url.searchParams.set("offset", offset.toString());
      url.searchParams.set("sort_by", "newest");

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Yelp API error: ${response.status} ${response.statusText}`
        );
      }

      const data: YelpReviewsResponse = await response.json();

      for (const review of data.reviews) {
        const publishedAt = new Date(review.time_created);

        if (since && publishedAt <= since) {
          hasMore = false;
          break;
        }

        allReviews.push({
          externalId: review.id,
          authorName: review.user.name,
          authorAvatarUrl: review.user.image_url,
          content: review.text,
          rating: review.rating,
          language: "en",
          publishedAt: publishedAt.toISOString(),
          rawData: review as unknown as Record<string, unknown>,
        });
      }

      offset += limit;
      if (data.reviews.length < limit || offset >= data.total) {
        hasMore = false;
      }
    }

    return allReviews;
  }
}
