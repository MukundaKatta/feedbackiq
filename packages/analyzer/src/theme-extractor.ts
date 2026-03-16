import { claudeComplete } from "./claude";
import { createServerClient, type Json } from "@feedbackiq/supabase";

export interface ExtractedTheme {
  label: string;
  description: string;
  keywords: string[];
  reviewIds: string[];
  avgSentiment: number;
  relevanceScores: Record<string, number>;
}

interface ClaudeThemeResponse {
  themes: {
    label: string;
    description: string;
    keywords: string[];
    review_ids: string[];
    avg_sentiment: number;
    relevance_scores: Record<string, number>;
  }[];
}

const THEME_SYSTEM_PROMPT = `You are an expert at extracting themes and topics from customer feedback. Given a set of customer reviews, identify the key recurring themes.

Return a JSON object:
{
  "themes": [
    {
      "label": "<concise theme name, e.g. 'Slow Customer Support', 'Intuitive UI', 'Pricing Concerns'>",
      "description": "<1-2 sentence description of the theme>",
      "keywords": ["<keyword1>", "<keyword2>", ...],
      "review_ids": ["<id of review that belongs to this theme>", ...],
      "avg_sentiment": <average sentiment score from -1.0 to 1.0 for reviews in this theme>,
      "relevance_scores": { "<review_id>": <0.0 to 1.0 relevance score>, ... }
    }
  ]
}

Rules:
- A review can belong to multiple themes
- Themes should be specific enough to be actionable (not just "positive feedback")
- Minimum 2 reviews per theme
- Order themes by number of associated reviews (most to least)
- Limit to top 20 themes maximum
- Include relevance_scores for each review in each theme (how relevant that review is to the theme)
- Return ONLY the JSON object`;

/**
 * Extract themes from a batch of reviews.
 */
export async function extractThemes(
  reviews: { id: string; content: string; rating: number | null }[]
): Promise<ExtractedTheme[]> {
  if (reviews.length < 2) return [];

  // For large sets, process in windows and merge
  if (reviews.length > 50) {
    return extractThemesLargeSet(reviews);
  }

  const reviewsText = reviews
    .map(
      (r) =>
        `--- REVIEW (ID: ${r.id}, Rating: ${r.rating ?? "N/A"}) ---\n${r.content}\n--- END ---`
    )
    .join("\n\n");

  const result = await claudeComplete<ClaudeThemeResponse>(
    THEME_SYSTEM_PROMPT,
    `Extract themes from these ${reviews.length} customer reviews:\n\n${reviewsText}`,
    { maxTokens: 8192 }
  );

  return result.themes.map((theme) => ({
    label: theme.label,
    description: theme.description,
    keywords: theme.keywords,
    reviewIds: theme.review_ids,
    avgSentiment: theme.avg_sentiment,
    relevanceScores: theme.relevance_scores,
  }));
}

/**
 * For large review sets, process in overlapping windows and merge themes.
 */
async function extractThemesLargeSet(
  reviews: { id: string; content: string; rating: number | null }[]
): Promise<ExtractedTheme[]> {
  const windowSize = 40;
  const overlap = 10;
  const allThemes: ExtractedTheme[] = [];

  for (let i = 0; i < reviews.length; i += windowSize - overlap) {
    const window = reviews.slice(i, i + windowSize);
    const windowThemes = await extractThemes(window);
    allThemes.push(...windowThemes);
  }

  // Merge similar themes
  return mergeThemes(allThemes);
}

/**
 * Merge themes with similar labels/keywords.
 */
async function mergeThemes(themes: ExtractedTheme[]): Promise<ExtractedTheme[]> {
  if (themes.length <= 20) return themes;

  const themesSummary = themes.map((t, i) => ({
    index: i,
    label: t.label,
    keywords: t.keywords,
    count: t.reviewIds.length,
  }));

  const mergeResult = await claudeComplete<{
    groups: { indices: number[]; label: string; description: string; keywords: string[] }[];
  }>(
    `You are a theme clustering expert. Given a list of themes extracted from different batches of reviews, identify which themes are the same or very similar and should be merged.

Return JSON:
{
  "groups": [
    {
      "indices": [<index of themes to merge>],
      "label": "<unified theme label>",
      "description": "<unified description>",
      "keywords": ["<merged keywords>"]
    }
  ]
}

Every theme index must appear in exactly one group. Themes that are unique should be in a group by themselves.`,
    `Merge these themes:\n${JSON.stringify(themesSummary, null, 2)}`
  );

  return mergeResult.groups.map((group) => {
    const groupThemes = group.indices.map((i) => themes[i]).filter(Boolean);
    const allReviewIds = [...new Set(groupThemes.flatMap((t) => t.reviewIds))];
    const allScores: Record<string, number> = {};

    for (const t of groupThemes) {
      for (const [rid, score] of Object.entries(t.relevanceScores)) {
        allScores[rid] = Math.max(allScores[rid] || 0, score);
      }
    }

    const avgSentiment =
      groupThemes.reduce((sum, t) => sum + t.avgSentiment * t.reviewIds.length, 0) /
      Math.max(1, allReviewIds.length);

    return {
      label: group.label,
      description: group.description,
      keywords: group.keywords,
      reviewIds: allReviewIds,
      avgSentiment,
      relevanceScores: allScores,
    };
  });
}

/**
 * Extract themes for an organization and persist to database.
 */
export async function extractOrganizationThemes(
  organizationId: string,
  daysBack = 30
): Promise<number> {
  const supabase = createServerClient();
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("id, content, rating")
    .eq("organization_id", organizationId)
    .gte("published_at", since.toISOString())
    .order("published_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`Failed to fetch reviews: ${error.message}`);
  if (!reviews?.length) return 0;

  const themes = await extractThemes(reviews);

  for (const theme of themes) {
    // Upsert theme
    const { data: existingThemes } = await supabase
      .from("themes")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("label", theme.label)
      .limit(1);

    let themeId: string;

    if (existingThemes?.length) {
      themeId = existingThemes[0].id;
      await supabase
        .from("themes")
        .update({
          description: theme.description,
          keywords: theme.keywords,
          review_count: theme.reviewIds.length,
          avg_sentiment: theme.avgSentiment,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", themeId);
    } else {
      const { data: newTheme, error: insertError } = await supabase
        .from("themes")
        .insert({
          organization_id: organizationId,
          label: theme.label,
          description: theme.description,
          keywords: theme.keywords,
          review_count: theme.reviewIds.length,
          avg_sentiment: theme.avgSentiment,
        })
        .select("id")
        .single();

      if (insertError || !newTheme) {
        console.error(`Failed to create theme ${theme.label}: ${insertError?.message}`);
        continue;
      }
      themeId = newTheme.id;
    }

    // Link reviews to theme
    const reviewThemeInserts = theme.reviewIds.map((reviewId) => ({
      review_id: reviewId,
      theme_id: themeId,
      relevance_score: theme.relevanceScores[reviewId] ?? 1.0,
    }));

    await supabase
      .from("review_themes")
      .upsert(reviewThemeInserts, { onConflict: "review_id,theme_id" });
  }

  return themes.length;
}
