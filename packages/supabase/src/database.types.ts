export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type SentimentLabel = "positive" | "negative" | "neutral" | "mixed";
export type SourceType =
  | "google_places"
  | "yelp"
  | "g2"
  | "app_store"
  | "zendesk"
  | "intercom"
  | "typeform";
export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "active" | "acknowledged" | "resolved";
export type ReportPeriod = "weekly" | "monthly" | "quarterly";
export type SubscriptionTier = "free" | "starter" | "pro" | "enterprise";

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          stripe_customer_id: string | null;
          subscription_tier: SubscriptionTier;
          subscription_status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          stripe_customer_id?: string | null;
          subscription_tier?: SubscriptionTier;
          subscription_status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          stripe_customer_id?: string | null;
          subscription_tier?: SubscriptionTier;
          subscription_status?: string | null;
          updated_at?: string;
        };
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          role?: string;
        };
      };
      sources: {
        Row: {
          id: string;
          organization_id: string;
          type: SourceType;
          name: string;
          config: Json;
          is_active: boolean;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          type: SourceType;
          name: string;
          config?: Json;
          is_active?: boolean;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          type?: SourceType;
          name?: string;
          config?: Json;
          is_active?: boolean;
          last_synced_at?: string | null;
          updated_at?: string;
        };
      };
      reviews: {
        Row: {
          id: string;
          organization_id: string;
          source_id: string;
          external_id: string;
          author_name: string | null;
          author_avatar_url: string | null;
          content: string;
          rating: number | null;
          language: string;
          published_at: string;
          raw_data: Json;
          embedding: number[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          source_id: string;
          external_id: string;
          author_name?: string | null;
          author_avatar_url?: string | null;
          content: string;
          rating?: number | null;
          language?: string;
          published_at: string;
          raw_data?: Json;
          embedding?: number[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
          rating?: number | null;
          embedding?: number[] | null;
          updated_at?: string;
        };
      };
      themes: {
        Row: {
          id: string;
          organization_id: string;
          label: string;
          description: string | null;
          keywords: string[];
          review_count: number;
          avg_sentiment: number;
          trend_direction: string;
          first_seen_at: string;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          label: string;
          description?: string | null;
          keywords?: string[];
          review_count?: number;
          avg_sentiment?: number;
          trend_direction?: string;
          first_seen_at?: string;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          label?: string;
          description?: string | null;
          keywords?: string[];
          review_count?: number;
          avg_sentiment?: number;
          trend_direction?: string;
          last_seen_at?: string;
          updated_at?: string;
        };
      };
      review_themes: {
        Row: {
          review_id: string;
          theme_id: string;
          relevance_score: number;
        };
        Insert: {
          review_id: string;
          theme_id: string;
          relevance_score?: number;
        };
        Update: {
          relevance_score?: number;
        };
      };
      sentiment_scores: {
        Row: {
          id: string;
          review_id: string;
          overall_score: number;
          label: SentimentLabel;
          confidence: number;
          aspects: Json;
          analyzed_at: string;
        };
        Insert: {
          id?: string;
          review_id: string;
          overall_score: number;
          label: SentimentLabel;
          confidence: number;
          aspects?: Json;
          analyzed_at?: string;
        };
        Update: {
          overall_score?: number;
          label?: SentimentLabel;
          confidence?: number;
          aspects?: Json;
        };
      };
      alerts: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          description: string;
          severity: AlertSeverity;
          status: AlertStatus;
          trigger_data: Json;
          created_at: string;
          acknowledged_at: string | null;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          title: string;
          description: string;
          severity?: AlertSeverity;
          status?: AlertStatus;
          trigger_data?: Json;
          created_at?: string;
        };
        Update: {
          status?: AlertStatus;
          acknowledged_at?: string | null;
          resolved_at?: string | null;
        };
      };
      reports: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          period: ReportPeriod;
          period_start: string;
          period_end: string;
          content: Json;
          summary: string;
          generated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          title: string;
          period: ReportPeriod;
          period_start: string;
          period_end: string;
          content?: Json;
          summary?: string;
          generated_at?: string;
          created_at?: string;
        };
        Update: {
          title?: string;
          content?: Json;
          summary?: string;
        };
      };
      suggested_responses: {
        Row: {
          id: string;
          review_id: string;
          organization_id: string;
          response_text: string;
          tone: string;
          is_approved: boolean;
          is_sent: boolean;
          approved_by: string | null;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          review_id: string;
          organization_id: string;
          response_text: string;
          tone?: string;
          is_approved?: boolean;
          is_sent?: boolean;
          approved_by?: string | null;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          response_text?: string;
          tone?: string;
          is_approved?: boolean;
          is_sent?: boolean;
          approved_by?: string | null;
          sent_at?: string | null;
          updated_at?: string;
        };
      };
      competitors: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          external_ids: Json;
          avg_sentiment: number;
          review_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          external_ids?: Json;
          avg_sentiment?: number;
          review_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          external_ids?: Json;
          avg_sentiment?: number;
          review_count?: number;
          updated_at?: string;
        };
      };
    };
    Functions: {
      match_reviews: {
        Args: {
          query_embedding: number[];
          match_threshold: number;
          match_count: number;
          org_id: string;
        };
        Returns: {
          id: string;
          content: string;
          similarity: number;
        }[];
      };
      get_sentiment_trend: {
        Args: {
          org_id: string;
          days: number;
        };
        Returns: {
          date: string;
          avg_score: number;
          count: number;
        }[];
      };
    };
  };
}
