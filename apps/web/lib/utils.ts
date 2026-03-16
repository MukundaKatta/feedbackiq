import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

export function formatSentiment(score: number): string {
  if (score >= 0.5) return "Very Positive";
  if (score >= 0.2) return "Positive";
  if (score >= -0.2) return "Neutral";
  if (score >= -0.5) return "Negative";
  return "Very Negative";
}

export function sentimentColor(score: number): string {
  if (score >= 0.2) return "text-emerald-600";
  if (score >= -0.2) return "text-gray-600";
  return "text-red-600";
}

export function sentimentBgColor(score: number): string {
  if (score >= 0.2) return "bg-emerald-100 text-emerald-800";
  if (score >= -0.2) return "bg-gray-100 text-gray-800";
  return "bg-red-100 text-red-800";
}

export function sourceLabel(type: string): string {
  const labels: Record<string, string> = {
    google_places: "Google",
    yelp: "Yelp",
    g2: "G2",
    app_store: "App Store",
    zendesk: "Zendesk",
    intercom: "Intercom",
    typeform: "Typeform",
  };
  return labels[type] || type;
}

export function sourceIcon(type: string): string {
  const icons: Record<string, string> = {
    google_places: "G",
    yelp: "Y",
    g2: "G2",
    app_store: "A",
    zendesk: "Z",
    intercom: "I",
    typeform: "T",
  };
  return icons[type] || "?";
}

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
