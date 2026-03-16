import type { Collector, CollectorConfig, CollectedReview } from "./types";

interface GooglePlacesConfig extends CollectorConfig {
  placeId: string;
  apiKey?: string;
}

interface GoogleReview {
  author_name: string;
  author_url: string;
  profile_photo_url: string;
  rating: number;
  relative_time_description: string;
  text: string;
  time: number;
  language: string;
}

interface PlaceDetailsResponse {
  result: {
    reviews?: GoogleReview[];
    name: string;
  };
  status: string;
  error_message?: string;
}

export class GooglePlacesCollector implements Collector {
  readonly sourceType = "google_places" as const;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_PLACES_API_KEY || "";
  }

  async fetchReviews(
    config: GooglePlacesConfig,
    since?: Date
  ): Promise<CollectedReview[]> {
    const key = config.apiKey || this.apiKey;
    if (!key) {
      throw new Error("Google Places API key is required");
    }

    const url = new URL(
      "https://maps.googleapis.com/maps/api/place/details/json"
    );
    url.searchParams.set("place_id", config.placeId);
    url.searchParams.set("fields", "reviews,name");
    url.searchParams.set("key", key);
    url.searchParams.set("reviews_sort", "newest");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(
        `Google Places API error: ${response.status} ${response.statusText}`
      );
    }

    const data: PlaceDetailsResponse = await response.json();

    if (data.status !== "OK") {
      throw new Error(
        `Google Places API returned status: ${data.status} - ${data.error_message || "Unknown error"}`
      );
    }

    const reviews = data.result.reviews || [];

    return reviews
      .filter((review) => {
        if (!since) return true;
        const reviewDate = new Date(review.time * 1000);
        return reviewDate > since;
      })
      .map((review) => ({
        externalId: `gp_${config.placeId}_${review.time}_${review.author_name.replace(/\s+/g, "_")}`,
        authorName: review.author_name,
        authorAvatarUrl: review.profile_photo_url || null,
        content: review.text,
        rating: review.rating,
        language: review.language || "en",
        publishedAt: new Date(review.time * 1000).toISOString(),
        rawData: review as unknown as Record<string, unknown>,
      }));
  }
}
