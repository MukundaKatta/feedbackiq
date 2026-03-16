/**
 * Collection runner - fetches reviews from all active sources for an organization
 * and upserts them into the database.
 */
import { createServerClient, type SourceRow, type Json } from "@feedbackiq/supabase";
import { createCollector, type CollectedReview, type CollectorResult } from "./index";

interface RunnerOptions {
  organizationId: string;
  sourceIds?: string[];
  fullSync?: boolean;
}

export async function runCollection(options: RunnerOptions): Promise<CollectorResult[]> {
  const supabase = createServerClient();
  const results: CollectorResult[] = [];

  // Fetch active sources
  let query = supabase
    .from("sources")
    .select("*")
    .eq("organization_id", options.organizationId)
    .eq("is_active", true);

  if (options.sourceIds?.length) {
    query = query.in("id", options.sourceIds);
  }

  const { data: sources, error: sourcesError } = await query;

  if (sourcesError) {
    throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
  }

  if (!sources?.length) {
    console.log("No active sources found");
    return results;
  }

  // Process each source
  for (const source of sources as SourceRow[]) {
    console.log(`Collecting from ${source.type}: ${source.name}...`);

    const result: CollectorResult = {
      sourceType: source.type,
      reviews: [],
      errors: [],
      fetchedAt: new Date(),
    };

    try {
      const collector = createCollector(source.type);
      const since = options.fullSync
        ? undefined
        : source.last_synced_at
          ? new Date(source.last_synced_at)
          : undefined;

      const reviews = await collector.fetchReviews(
        source.config as Record<string, unknown>,
        since
      );

      result.reviews = reviews;
      console.log(`  Fetched ${reviews.length} reviews`);

      // Upsert reviews into database
      if (reviews.length > 0) {
        const reviewInserts = reviews.map((review: CollectedReview) => ({
          organization_id: options.organizationId,
          source_id: source.id,
          external_id: review.externalId,
          author_name: review.authorName,
          author_avatar_url: review.authorAvatarUrl,
          content: review.content,
          rating: review.rating,
          language: review.language,
          published_at: review.publishedAt,
          raw_data: review.rawData as Json,
        }));

        // Batch upsert in chunks of 100
        const chunkSize = 100;
        for (let i = 0; i < reviewInserts.length; i += chunkSize) {
          const chunk = reviewInserts.slice(i, i + chunkSize);
          const { error: insertError } = await supabase
            .from("reviews")
            .upsert(chunk, {
              onConflict: "source_id,external_id",
              ignoreDuplicates: false,
            });

          if (insertError) {
            result.errors.push(new Error(`Insert error: ${insertError.message}`));
            console.error(`  Insert error for chunk ${i}: ${insertError.message}`);
          }
        }
      }

      // Update source's last_synced_at
      await supabase
        .from("sources")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", source.id);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      result.errors.push(error);
      console.error(`  Error collecting from ${source.name}: ${error.message}`);
    }

    results.push(result);
  }

  return results;
}

// CLI entry point
if (require.main === module) {
  const orgId = process.argv[2];
  if (!orgId) {
    console.error("Usage: tsx runner.ts <organization-id> [--full-sync]");
    process.exit(1);
  }

  const fullSync = process.argv.includes("--full-sync");

  runCollection({ organizationId: orgId, fullSync })
    .then((results) => {
      const total = results.reduce((sum, r) => sum + r.reviews.length, 0);
      const errors = results.reduce((sum, r) => sum + r.errors.length, 0);
      console.log(`\nCollection complete: ${total} reviews, ${errors} errors`);
    })
    .catch((err) => {
      console.error("Collection failed:", err);
      process.exit(1);
    });
}
