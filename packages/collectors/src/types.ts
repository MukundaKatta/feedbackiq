import type { SourceType, Json } from "@feedbackiq/supabase";

export interface CollectedReview {
  externalId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  content: string;
  rating: number | null;
  language: string;
  publishedAt: string;
  rawData: Json;
}

export interface CollectorConfig {
  [key: string]: unknown;
}

export interface Collector {
  readonly sourceType: SourceType;
  fetchReviews(config: CollectorConfig, since?: Date): Promise<CollectedReview[]>;
}

export interface CollectorResult {
  sourceType: SourceType;
  reviews: CollectedReview[];
  errors: Error[];
  fetchedAt: Date;
}
