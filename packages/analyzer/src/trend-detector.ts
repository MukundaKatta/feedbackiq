import { claudeComplete } from "./claude";
import { createServerClient, type AlertSeverity } from "@feedbackiq/supabase";

export interface DetectedTrend {
  type: "sentiment_drop" | "spike_negative" | "emerging_issue" | "volume_change";
  title: string;
  description: string;
  severity: AlertSeverity;
  affectedThemes: string[];
  dataPoints: TrendDataPoint[];
  recommendation: string;
}

export interface TrendDataPoint {
  date: string;
  value: number;
  label?: string;
}

interface SentimentWindow {
  date: string;
  avgScore: number;
  count: number;
  negativeRatio: number;
}

interface ClaudeTrendResponse {
  trends: {
    type: string;
    title: string;
    description: string;
    severity: AlertSeverity;
    affected_themes: string[];
    recommendation: string;
  }[];
}

const TREND_SYSTEM_PROMPT = `You are a customer feedback trend analysis expert. Given time-series sentiment data and theme information, identify concerning trends that need attention.

Return JSON:
{
  "trends": [
    {
      "type": "<sentiment_drop | spike_negative | emerging_issue | volume_change>",
      "title": "<short alert title>",
      "description": "<what's happening and why it matters>",
      "severity": "<low | medium | high | critical>",
      "affected_themes": ["<theme labels affected>"],
      "recommendation": "<actionable recommendation>"
    }
  ]
}

Severity guidelines:
- critical: >30% sentiment drop in 7 days, or sudden flood of negative reviews
- high: 15-30% sentiment drop, or a new negative theme affecting many reviews
- medium: 10-15% drop, or a slowly growing issue
- low: minor fluctuations worth monitoring

Only flag genuine trends, not normal noise. Return empty trends array if nothing notable.`;

/**
 * Detect trends in sentiment data using statistical analysis + Claude interpretation.
 */
export async function detectTrends(
  organizationId: string,
  daysBack = 30
): Promise<DetectedTrend[]> {
  const supabase = createServerClient();

  // Get daily sentiment aggregates
  const { data: trendData, error: trendError } = await supabase.rpc(
    "get_sentiment_trend",
    { org_id: organizationId, days: daysBack }
  );

  if (trendError) {
    throw new Error(`Failed to fetch sentiment trend: ${trendError.message}`);
  }

  if (!trendData?.length || trendData.length < 3) {
    return []; // Not enough data for trend detection
  }

  // Get current themes
  const { data: themes } = await supabase
    .from("themes")
    .select("label, avg_sentiment, review_count, trend_direction")
    .eq("organization_id", organizationId)
    .order("review_count", { ascending: false })
    .limit(15);

  // Statistical pre-analysis
  const windows = computeSentimentWindows(
    trendData as { date: string; avg_score: number; count: number }[]
  );
  const statisticalAlerts = detectStatisticalAnomalies(windows);

  // If no statistical anomalies, skip Claude analysis
  if (statisticalAlerts.length === 0 && !hasSignificantChange(windows)) {
    return [];
  }

  // Claude analysis for interpretation and recommendations
  const analysisInput = {
    sentiment_trend: trendData,
    themes: themes || [],
    statistical_flags: statisticalAlerts,
    analysis_period: `Last ${daysBack} days`,
  };

  const result = await claudeComplete<ClaudeTrendResponse>(
    TREND_SYSTEM_PROMPT,
    `Analyze these customer feedback trends:\n\n${JSON.stringify(analysisInput, null, 2)}`
  );

  return result.trends.map((trend) => ({
    type: trend.type as DetectedTrend["type"],
    title: trend.title,
    description: trend.description,
    severity: trend.severity,
    affectedThemes: trend.affected_themes,
    dataPoints: (trendData as { date: string; avg_score: number; count: number }[]).map(
      (d) => ({
        date: d.date,
        value: Number(d.avg_score),
      })
    ),
    recommendation: trend.recommendation,
  }));
}

function computeSentimentWindows(
  data: { date: string; avg_score: number; count: number }[]
): SentimentWindow[] {
  return data.map((d) => ({
    date: d.date,
    avgScore: Number(d.avg_score),
    count: Number(d.count),
    negativeRatio: d.avg_score < 0 ? 1 : 0,
  }));
}

interface StatisticalAlert {
  type: string;
  date: string;
  value: number;
  threshold: number;
}

function detectStatisticalAnomalies(
  windows: SentimentWindow[]
): StatisticalAlert[] {
  const alerts: StatisticalAlert[] = [];
  if (windows.length < 7) return alerts;

  // Calculate rolling averages
  const scores = windows.map((w) => w.avgScore);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const stdDev = Math.sqrt(
    scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length
  );

  // Check recent values against historical
  const recentWindow = windows.slice(-7);
  const recentAvg =
    recentWindow.reduce((sum, w) => sum + w.avgScore, 0) / recentWindow.length;
  const olderWindow = windows.slice(0, -7);
  const olderAvg =
    olderWindow.reduce((sum, w) => sum + w.avgScore, 0) /
    Math.max(1, olderWindow.length);

  // Significant drop detection
  const dropPct =
    olderAvg !== 0 ? ((olderAvg - recentAvg) / Math.abs(olderAvg)) * 100 : 0;
  if (dropPct > 10) {
    alerts.push({
      type: "sentiment_drop",
      date: recentWindow[0].date,
      value: dropPct,
      threshold: 10,
    });
  }

  // Z-score anomaly detection
  for (const window of recentWindow) {
    if (stdDev > 0) {
      const zScore = (window.avgScore - mean) / stdDev;
      if (zScore < -2) {
        alerts.push({
          type: "anomaly",
          date: window.date,
          value: zScore,
          threshold: -2,
        });
      }
    }
  }

  // Volume spike detection
  const avgVolume =
    windows.reduce((sum, w) => sum + w.count, 0) / windows.length;
  for (const window of recentWindow) {
    if (window.count > avgVolume * 2.5) {
      alerts.push({
        type: "volume_spike",
        date: window.date,
        value: window.count,
        threshold: avgVolume * 2.5,
      });
    }
  }

  return alerts;
}

function hasSignificantChange(windows: SentimentWindow[]): boolean {
  if (windows.length < 14) return false;
  const recent = windows.slice(-7);
  const previous = windows.slice(-14, -7);

  const recentAvg =
    recent.reduce((s, w) => s + w.avgScore, 0) / recent.length;
  const prevAvg =
    previous.reduce((s, w) => s + w.avgScore, 0) / previous.length;

  return Math.abs(recentAvg - prevAvg) > 0.15;
}

/**
 * Detect trends and create alerts for an organization.
 */
export async function detectAndAlertTrends(
  organizationId: string
): Promise<number> {
  const trends = await detectTrends(organizationId);

  if (trends.length === 0) return 0;

  const supabase = createServerClient();

  const alertInserts = trends.map((trend) => ({
    organization_id: organizationId,
    title: trend.title,
    description: `${trend.description}\n\nRecommendation: ${trend.recommendation}`,
    severity: trend.severity,
    status: "active" as const,
    trigger_data: {
      type: trend.type,
      affected_themes: trend.affectedThemes,
      data_points: trend.dataPoints,
    },
  }));

  const { error } = await supabase.from("alerts").insert(alertInserts);

  if (error) {
    throw new Error(`Failed to create alerts: ${error.message}`);
  }

  // Update theme trend directions
  for (const trend of trends) {
    if (trend.affectedThemes.length > 0) {
      const direction =
        trend.type === "sentiment_drop" || trend.type === "spike_negative"
          ? "falling"
          : "rising";

      for (const themeLabel of trend.affectedThemes) {
        await supabase
          .from("themes")
          .update({ trend_direction: direction })
          .eq("organization_id", organizationId)
          .eq("label", themeLabel);
      }
    }
  }

  return trends.length;
}
