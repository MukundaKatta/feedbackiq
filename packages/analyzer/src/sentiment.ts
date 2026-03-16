import { claudeComplete } from "./claude";
import { createServerClient, type SentimentLabel, type Json } from "@feedbackiq/supabase";

export interface SentimentResult {
  overallScore: number;      // -1.0 to 1.0
  label: SentimentLabel;
  confidence: number;        // 0.0 to 1.0
  aspects: AspectSentiment[];
}

export interface AspectSentiment {
  aspect: string;
  score: number;
  label: SentimentLabel;
  snippet: string;
}

interface ClaudeSentimentResponse {
  overall_score: number;
  label: SentimentLabel;
  confidence: number;
  aspects: {
    aspect: string;
    score: number;
    label: SentimentLabel;
    snippet: string;
  }[];
}

const SENTIMENT_SYSTEM_PROMPT = `You are a sentiment analysis expert. Analyze the given customer review and return a JSON object with the following structure:

{
  "overall_score": <number between -1.0 (very negative) and 1.0 (very positive)>,
  "label": <"positive" | "negative" | "neutral" | "mixed">,
  "confidence": <number between 0.0 and 1.0>,
  "aspects": [
    {
      "aspect": <string: the aspect being discussed, e.g. "customer support", "pricing", "ui/ux">,
      "score": <number between -1.0 and 1.0>,
      "label": <"positive" | "negative" | "neutral" | "mixed">,
      "snippet": <string: the relevant portion of the review>
    }
  ]
}

Rules:
- Extract ALL distinct aspects mentioned in the review
- Be precise with scores: 0.0 is truly neutral, use the full range
- "mixed" label is for reviews that contain both clearly positive and clearly negative elements
- confidence reflects how certain you are about the overall sentiment
- Return ONLY the JSON object, no additional text`;

export async function analyzeSentiment(
  reviewContent: string
): Promise<SentimentResult> {
  const result = await claudeComplete<ClaudeSentimentResponse>(
    SENTIMENT_SYSTEM_PROMPT,
    `Analyze the sentiment of this review:\n\n${reviewContent}`
  );

  return {
    overallScore: Math.max(-1, Math.min(1, result.overall_score)),
    label: result.label,
    confidence: Math.max(0, Math.min(1, result.confidence)),
    aspects: result.aspects.map((a) => ({
      aspect: a.aspect,
      score: Math.max(-1, Math.min(1, a.score)),
      label: a.label,
      snippet: a.snippet,
    })),
  };
}

/**
 * Analyze sentiment for multiple reviews in batch.
 * Groups reviews to reduce API calls.
 */
export async function analyzeSentimentBatch(
  reviews: { id: string; content: string }[]
): Promise<Map<string, SentimentResult>> {
  const results = new Map<string, SentimentResult>();

  // Process in batches of 5 for efficiency
  const batchSize = 5;
  for (let i = 0; i < reviews.length; i += batchSize) {
    const batch = reviews.slice(i, i + batchSize);

    if (batch.length === 1) {
      const result = await analyzeSentiment(batch[0].content);
      results.set(batch[0].id, result);
      continue;
    }

    const batchPrompt = batch
      .map(
        (r, idx) =>
          `--- REVIEW ${idx + 1} (ID: ${r.id}) ---\n${r.content}\n--- END REVIEW ${idx + 1} ---`
      )
      .join("\n\n");

    const batchResult = await claudeComplete<
      Record<string, ClaudeSentimentResponse>
    >(
      SENTIMENT_SYSTEM_PROMPT +
        `\n\nYou will receive multiple reviews. Return a JSON object where keys are review IDs and values are the sentiment analysis objects.`,
      `Analyze the sentiment of these reviews:\n\n${batchPrompt}`
    );

    for (const review of batch) {
      const sentiment = batchResult[review.id];
      if (sentiment) {
        results.set(review.id, {
          overallScore: Math.max(-1, Math.min(1, sentiment.overall_score)),
          label: sentiment.label,
          confidence: Math.max(0, Math.min(1, sentiment.confidence)),
          aspects: (sentiment.aspects || []).map((a) => ({
            aspect: a.aspect,
            score: Math.max(-1, Math.min(1, a.score)),
            label: a.label,
            snippet: a.snippet,
          })),
        });
      } else {
        // Fallback: analyze individually
        const result = await analyzeSentiment(review.content);
        results.set(review.id, result);
      }
    }
  }

  return results;
}

/**
 * Analyze and persist sentiment scores for unanalyzed reviews in an organization.
 */
export async function analyzeOrganizationReviews(
  organizationId: string,
  limit = 100
): Promise<number> {
  const supabase = createServerClient();

  // Fetch reviews without sentiment scores
  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("id, content")
    .eq("organization_id", organizationId)
    .not(
      "id",
      "in",
      supabase.from("sentiment_scores").select("review_id")
    )
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch reviews: ${error.message}`);
  }

  if (!reviews?.length) return 0;

  const sentimentMap = await analyzeSentimentBatch(reviews);

  // Insert sentiment scores
  const inserts = Array.from(sentimentMap.entries()).map(
    ([reviewId, sentiment]) => ({
      review_id: reviewId,
      overall_score: sentiment.overallScore,
      label: sentiment.label,
      confidence: sentiment.confidence,
      aspects: sentiment.aspects as unknown as Json,
    })
  );

  const { error: insertError } = await supabase
    .from("sentiment_scores")
    .insert(inserts);

  if (insertError) {
    throw new Error(`Failed to insert sentiment scores: ${insertError.message}`);
  }

  return inserts.length;
}
