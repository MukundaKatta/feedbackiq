import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let serverClient: SupabaseClient<Database> | null = null;
let browserClient: SupabaseClient<Database> | null = null;

export function createServerClient(): SupabaseClient<Database> {
  if (serverClient) return serverClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  serverClient = createClient<Database>(url, key, {
    auth: { persistSession: false },
  });

  return serverClient;
}

export function createBrowserClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  browserClient = createClient<Database>(url, key);

  return browserClient;
}

export type { Database };
export type Tables = Database["public"]["Tables"];
export type ReviewRow = Tables["reviews"]["Row"];
export type SourceRow = Tables["sources"]["Row"];
export type ThemeRow = Tables["themes"]["Row"];
export type SentimentScoreRow = Tables["sentiment_scores"]["Row"];
export type AlertRow = Tables["alerts"]["Row"];
export type ReportRow = Tables["reports"]["Row"];
export type SuggestedResponseRow = Tables["suggested_responses"]["Row"];
export type OrganizationRow = Tables["organizations"]["Row"];
export type CompetitorRow = Tables["competitors"]["Row"];
