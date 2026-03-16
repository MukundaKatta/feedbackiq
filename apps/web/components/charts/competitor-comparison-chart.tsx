"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

interface ComparisonData {
  metric: string;
  you: number;
  competitor: number;
}

interface CompetitorComparisonChartProps {
  data: ComparisonData[];
  competitorName: string;
  height?: number;
}

export function CompetitorComparisonChart({
  data,
  competitorName,
  height = 350,
}: CompetitorComparisonChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data}>
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis
          dataKey="metric"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        />
        <PolarRadiusAxis
          angle={30}
          domain={[0, 5]}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
        />
        <Radar
          name="Your Business"
          dataKey="you"
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={0.2}
          strokeWidth={2}
        />
        <Radar
          name={competitorName}
          dataKey="competitor"
          stroke="#f43f5e"
          fill="#f43f5e"
          fillOpacity={0.1}
          strokeWidth={2}
        />
        <Legend
          formatter={(value: string) => (
            <span style={{ color: "hsl(var(--foreground))", fontSize: "12px" }}>{value}</span>
          )}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "13px",
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
