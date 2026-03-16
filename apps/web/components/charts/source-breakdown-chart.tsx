"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface SourceData {
  name: string;
  value: number;
  color: string;
}

interface SourceBreakdownChartProps {
  data: SourceData[];
  height?: number;
}

const DEFAULT_COLORS = [
  "#4285F4", // Google blue
  "#D32323", // Yelp red
  "#FF492C", // G2 orange
  "#0D84FF", // App Store blue
  "#03363D", // Zendesk teal
  "#286EFA", // Intercom blue
  "#262627", // Typeform dark
];

export function SourceBreakdownChart({
  data,
  height = 300,
}: SourceBreakdownChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={3}
          dataKey="value"
          nameKey="name"
        >
          {data.map((entry, index) => (
            <Cell
              key={entry.name}
              fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "13px",
          }}
          formatter={(value: number) => [`${value} reviews`, ""]}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value: string) => (
            <span style={{ color: "hsl(var(--foreground))", fontSize: "12px" }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
