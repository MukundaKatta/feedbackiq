"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ThemeBubble {
  label: string;
  sentiment: number;
  count: number;
  trend: string;
}

interface ThemeBubbleChartProps {
  data: ThemeBubble[];
  height?: number;
}

function getColor(sentiment: number): string {
  if (sentiment >= 0.3) return "#10b981";
  if (sentiment >= 0) return "#6ee7b7";
  if (sentiment >= -0.3) return "#fbbf24";
  return "#ef4444";
}

export function ThemeBubbleChart({ data, height = 350 }: ThemeBubbleChartProps) {
  const chartData = data.map((d, i) => ({
    x: i,
    y: d.sentiment,
    z: d.count,
    label: d.label,
    trend: d.trend,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="x"
          type="number"
          tick={false}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          dataKey="y"
          type="number"
          domain={[-1, 1]}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          label={{
            value: "Sentiment",
            angle: -90,
            position: "insideLeft",
            style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
          }}
        />
        <ZAxis dataKey="z" type="number" range={[100, 1000]} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "13px",
          }}
          formatter={(_: unknown, name: string, entry: { payload: { label: string; z: number; y: number; trend: string } }) => {
            if (name === "y") return [entry.payload.y.toFixed(2), "Sentiment"];
            if (name === "z") return [entry.payload.z, "Reviews"];
            return [];
          }}
          labelFormatter={(_: unknown, payload: Array<{ payload: { label: string } }>) => {
            return payload?.[0]?.payload?.label || "";
          }}
        />
        <Scatter data={chartData}>
          {chartData.map((entry, index) => (
            <Cell key={index} fill={getColor(entry.y)} fillOpacity={0.7} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
