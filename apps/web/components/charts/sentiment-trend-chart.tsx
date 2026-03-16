"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface DataPoint {
  date: string;
  score: number;
  count: number;
}

interface SentimentTrendChartProps {
  data: DataPoint[];
  height?: number;
}

export function SentimentTrendChart({
  data,
  height = 300,
}: SentimentTrendChartProps) {
  const gradientId = "sentimentGradient";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(160, 60%, 45%)" stopOpacity={0.3} />
            <stop offset="50%" stopColor="hsl(160, 60%, 45%)" stopOpacity={0.05} />
            <stop offset="95%" stopColor="hsl(0, 70%, 50%)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[-1, 1]}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => value.toFixed(1)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "13px",
          }}
          formatter={(value: number, name: string) => {
            if (name === "score") return [value.toFixed(3), "Sentiment"];
            return [value, "Reviews"];
          }}
          labelFormatter={(label: string) => `Date: ${label}`}
        />
        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" opacity={0.5} />
        <Area
          type="monotone"
          dataKey="score"
          stroke="hsl(160, 60%, 45%)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
