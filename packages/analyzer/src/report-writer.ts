import { claudeText, claudeComplete } from "./claude";
import { createServerClient, type ReportPeriod, type Json } from "@feedbackiq/supabase";

export interface ReportContent {
  executiveSummary: string;
  sentimentOverview: {
    avgScore: number;
    changeFromPrevious: number;
    totalReviews: number;
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
  };
  topThemes: {
    label: string;
    sentiment: number;
    count: number;
    trend: string;
    keyInsight: string;
  }[];
  emergingIssues: {
    issue: string;
    severity: string;
    firstSeen: string;
    affectedReviews: number;
  }[];
  sourceBreakdown: {
    source: string;
    count: number;
    avgSentiment: number;
  }[];
  recommendations: {
    priority: string;
    action: string;
    expectedImpact: string;
  }[];
  highlightReviews: {
    content: string;
    rating: number | null;
    source: string;
    sentiment: number;
    reason: string;
  }[];
}

const REPORT_SYSTEM_PROMPT = `You are an expert business analyst specializing in customer feedback intelligence. Generate a comprehensive insight report from the provided data.

Write in a professional, actionable style. Focus on:
1. What changed and why it matters
2. Patterns that need attention
3. Specific, actionable recommendations

Be data-driven but also interpret what the numbers mean for the business.`;

/**
 * Generate a comprehensive insight report for an organization.
 */
export async function generateReport(
  organizationId: string,
  period: ReportPeriod = "monthly"
): Promise<{ title: string; content: ReportContent; summary: string }> {
  const supabase = createServerClient();

  // Calculate period bounds
  const now = new Date();
  const periodStart = new Date(now);
  const previousPeriodStart = new Date(now);

  switch (period) {
    case "weekly":
      periodStart.setDate(now.getDate() - 7);
      previousPeriodStart.setDate(now.getDate() - 14);
      break;
    case "monthly":
      periodStart.setMonth(now.getMonth() - 1);
      previousPeriodStart.setMonth(now.getMonth() - 2);
      break;
    case "quarterly":
      periodStart.setMonth(now.getMonth() - 3);
      previousPeriodStart.setMonth(now.getMonth() - 6);
      break;
  }

  // Fetch current period data
  const { data: currentReviews } = await supabase
    .from("reviews")
    .select(
      `
      id,
      content,
      rating,
      published_at,
      source_id,
      sources!inner(type, name),
      sentiment_scores(overall_score, label, aspects)
    `
    )
    .eq("organization_id", organizationId)
    .gte("published_at", periodStart.toISOString())
    .lte("published_at", now.toISOString());

  // Fetch previous period for comparison
  const { data: previousReviews } = await supabase
    .from("reviews")
    .select("id, sentiment_scores(overall_score)")
    .eq("organization_id", organizationId)
    .gte("published_at", previousPeriodStart.toISOString())
    .lt("published_at", periodStart.toISOString());

  // Fetch themes
  const { data: themes } = await supabase
    .from("themes")
    .select("*")
    .eq("organization_id", organizationId)
    .gte("last_seen_at", periodStart.toISOString())
    .order("review_count", { ascending: false });

  // Fetch alerts
  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .eq("organization_id", organizationId)
    .gte("created_at", periodStart.toISOString());

  // Get org name
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single();

  // Compute statistics
  const reviews = currentReviews || [];
  const prevReviews = previousReviews || [];

  const sentimentScores = reviews
    .filter((r: Record<string, unknown>) => {
      const scores = r.sentiment_scores as Array<{ overall_score: number }> | null;
      return scores && scores.length > 0;
    })
    .map((r: Record<string, unknown>) => {
      const scores = r.sentiment_scores as Array<{ overall_score: number }>;
      return Number(scores[0].overall_score);
    });

  const avgSentiment =
    sentimentScores.length > 0
      ? sentimentScores.reduce((a: number, b: number) => a + b, 0) / sentimentScores.length
      : 0;

  const prevScores = prevReviews
    .filter((r: Record<string, unknown>) => {
      const scores = r.sentiment_scores as Array<{ overall_score: number }> | null;
      return scores && scores.length > 0;
    })
    .map((r: Record<string, unknown>) => {
      const scores = r.sentiment_scores as Array<{ overall_score: number }>;
      return Number(scores[0].overall_score);
    });

  const prevAvgSentiment =
    prevScores.length > 0
      ? prevScores.reduce((a: number, b: number) => a + b, 0) / prevScores.length
      : 0;

  const positiveCount = sentimentScores.filter((s: number) => s > 0.2).length;
  const negativeCount = sentimentScores.filter((s: number) => s < -0.2).length;
  const neutralCount = sentimentScores.length - positiveCount - negativeCount;

  // Source breakdown
  const sourceMap = new Map<string, { count: number; totalSentiment: number }>();
  for (const review of reviews) {
    const source = (review as Record<string, unknown>).sources as { type: string; name: string } | null;
    const sourceName = source?.type || "unknown";
    const scores = (review as Record<string, unknown>).sentiment_scores as Array<{ overall_score: number }> | null;
    const score = scores?.[0]?.overall_score ?? 0;

    const current = sourceMap.get(sourceName) || { count: 0, totalSentiment: 0 };
    current.count++;
    current.totalSentiment += Number(score);
    sourceMap.set(sourceName, current);
  }

  const sourceBreakdown = Array.from(sourceMap.entries()).map(([source, data]) => ({
    source,
    count: data.count,
    avgSentiment: data.count > 0 ? data.totalSentiment / data.count : 0,
  }));

  // Prepare data for Claude analysis
  const reportData = {
    organization: org?.name || "Organization",
    period: `${periodStart.toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`,
    periodType: period,
    totalReviews: reviews.length,
    previousPeriodReviews: prevReviews.length,
    avgSentiment,
    previousAvgSentiment: prevAvgSentiment,
    positiveCount,
    negativeCount,
    neutralCount,
    themes: (themes || []).slice(0, 10).map((t) => ({
      label: t.label,
      description: t.description,
      sentiment: t.avg_sentiment,
      reviewCount: t.review_count,
      trend: t.trend_direction,
      keywords: t.keywords,
    })),
    alerts: (alerts || []).map((a) => ({
      title: a.title,
      severity: a.severity,
      description: a.description,
    })),
    sourceBreakdown,
    sampleNegativeReviews: reviews
      .filter((r: Record<string, unknown>) => {
        const scores = r.sentiment_scores as Array<{ overall_score: number }> | null;
        return scores?.[0] && Number(scores[0].overall_score) < -0.3;
      })
      .slice(0, 5)
      .map((r) => r.content),
    samplePositiveReviews: reviews
      .filter((r: Record<string, unknown>) => {
        const scores = r.sentiment_scores as Array<{ overall_score: number }> | null;
        return scores?.[0] && Number(scores[0].overall_score) > 0.5;
      })
      .slice(0, 5)
      .map((r) => r.content),
  };

  // Generate report narrative
  const reportNarrative = await claudeText(
    REPORT_SYSTEM_PROMPT,
    `Generate an executive summary and recommendations for this ${period} customer feedback report:\n\n${JSON.stringify(reportData, null, 2)}

Write:
1. Executive Summary (2-3 paragraphs)
2. Top 3-5 Actionable Recommendations with expected impact

Be specific and reference actual data points.`,
    { maxTokens: 2048 }
  );

  // Generate structured recommendations
  const recommendations = await claudeComplete<{
    recommendations: { priority: string; action: string; expected_impact: string }[];
  }>(
    "Extract actionable recommendations from this report analysis. Return JSON with a recommendations array.",
    reportNarrative,
    { maxTokens: 1024 }
  );

  const content: ReportContent = {
    executiveSummary: reportNarrative,
    sentimentOverview: {
      avgScore: avgSentiment,
      changeFromPrevious: avgSentiment - prevAvgSentiment,
      totalReviews: reviews.length,
      positiveCount,
      negativeCount,
      neutralCount,
    },
    topThemes: (themes || []).slice(0, 10).map((t) => ({
      label: t.label,
      sentiment: Number(t.avg_sentiment),
      count: t.review_count,
      trend: t.trend_direction,
      keyInsight: t.description || "",
    })),
    emergingIssues: (alerts || [])
      .filter((a) => a.severity === "high" || a.severity === "critical")
      .map((a) => ({
        issue: a.title,
        severity: a.severity,
        firstSeen: a.created_at,
        affectedReviews: 0,
      })),
    sourceBreakdown,
    recommendations: recommendations.recommendations.map((r) => ({
      priority: r.priority,
      action: r.action,
      expectedImpact: r.expected_impact,
    })),
    highlightReviews: [],
  };

  const title = `${period.charAt(0).toUpperCase() + period.slice(1)} Feedback Report - ${periodStart.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;

  return {
    title,
    content,
    summary: reportNarrative.slice(0, 500),
  };
}

/**
 * Generate and persist a report for an organization.
 */
export async function generateAndSaveReport(
  organizationId: string,
  period: ReportPeriod = "monthly"
): Promise<string> {
  const report = await generateReport(organizationId, period);

  const now = new Date();
  const periodStart = new Date(now);
  switch (period) {
    case "weekly":
      periodStart.setDate(now.getDate() - 7);
      break;
    case "monthly":
      periodStart.setMonth(now.getMonth() - 1);
      break;
    case "quarterly":
      periodStart.setMonth(now.getMonth() - 3);
      break;
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("reports")
    .insert({
      organization_id: organizationId,
      title: report.title,
      period,
      period_start: periodStart.toISOString().split("T")[0],
      period_end: now.toISOString().split("T")[0],
      content: report.content as unknown as Json,
      summary: report.summary,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to save report: ${error.message}`);

  return data!.id;
}
