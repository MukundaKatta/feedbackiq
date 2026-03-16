import { claudeText } from "./claude";
import { createServerClient } from "@feedbackiq/supabase";

export interface GeneratedResponse {
  responseText: string;
  tone: string;
}

export type ResponseTone =
  | "professional"
  | "empathetic"
  | "friendly"
  | "apologetic"
  | "grateful";

const RESPONSE_SYSTEM_PROMPT = `You are a customer response specialist for a business. Write a thoughtful, genuine response to a customer review.

Guidelines:
- Be authentic, not formulaic. Avoid generic "Thank you for your feedback" openings.
- Address specific points the customer raised.
- For negative reviews: acknowledge the issue, show empathy, offer a concrete resolution or next step.
- For positive reviews: be genuinely grateful, reference specific compliments, invite continued engagement.
- For mixed reviews: address both the positives and the concerns.
- Keep it concise (2-4 sentences for most reviews, up to 5 for complex ones).
- Match the requested tone.
- Never be defensive or dismissive.
- Do not make promises you can't keep.
- Do NOT use markdown formatting. Write plain text only.`;

/**
 * Generate a response to a single review.
 */
export async function generateResponse(
  reviewContent: string,
  rating: number | null,
  tone: ResponseTone = "professional",
  businessName?: string,
  additionalContext?: string
): Promise<GeneratedResponse> {
  const contextParts = [
    `Review rating: ${rating !== null ? `${rating}/5` : "Not rated"}`,
    `Desired tone: ${tone}`,
    businessName ? `Business name: ${businessName}` : "",
    additionalContext ? `Additional context: ${additionalContext}` : "",
  ].filter(Boolean);

  const prompt = `${contextParts.join("\n")}\n\nCustomer review:\n${reviewContent}\n\nWrite a response:`;

  const responseText = await claudeText(RESPONSE_SYSTEM_PROMPT, prompt, {
    temperature: 0.4,
  });

  return {
    responseText: responseText.trim(),
    tone,
  };
}

/**
 * Generate responses for multiple reviews and persist to database.
 */
export async function generateOrganizationResponses(
  organizationId: string,
  options?: {
    tone?: ResponseTone;
    reviewIds?: string[];
    unrespondedOnly?: boolean;
    limit?: number;
  }
): Promise<number> {
  const supabase = createServerClient();
  const tone = options?.tone || "professional";

  // Get organization name
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single();

  // Build query for reviews needing responses
  let query = supabase
    .from("reviews")
    .select(
      `
      id,
      content,
      rating,
      source_id,
      sources!inner(type, name)
    `
    )
    .eq("organization_id", organizationId);

  if (options?.reviewIds?.length) {
    query = query.in("id", options.reviewIds);
  }

  if (options?.unrespondedOnly !== false) {
    // Exclude reviews that already have a suggested response
    query = query.not(
      "id",
      "in",
      supabase.from("suggested_responses").select("review_id")
    );
  }

  query = query
    .order("published_at", { ascending: false })
    .limit(options?.limit || 20);

  const { data: reviews, error } = await query;

  if (error) throw new Error(`Failed to fetch reviews: ${error.message}`);
  if (!reviews?.length) return 0;

  let generated = 0;

  for (const review of reviews) {
    try {
      const response = await generateResponse(
        review.content,
        review.rating,
        tone,
        org?.name,
        `Source: ${(review as Record<string, unknown>).sources ? ((review as Record<string, unknown>).sources as { type: string; name: string }).type : "unknown"}`
      );

      await supabase.from("suggested_responses").insert({
        review_id: review.id,
        organization_id: organizationId,
        response_text: response.responseText,
        tone: response.tone,
      });

      generated++;
    } catch (err) {
      console.error(`Failed to generate response for review ${review.id}:`, err);
    }
  }

  return generated;
}
