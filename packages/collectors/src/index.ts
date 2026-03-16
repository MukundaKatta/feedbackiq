export { GooglePlacesCollector } from "./google-places";
export { YelpCollector } from "./yelp";
export { G2Collector } from "./g2";
export { AppStoreCollector } from "./app-store";
export { ZendeskCollector } from "./zendesk";
export { IntercomCollector } from "./intercom";
export { TypeformCollector } from "./typeform";
export type {
  Collector,
  CollectorConfig,
  CollectedReview,
  CollectorResult,
} from "./types";
export type { TypeformWebhookPayload } from "./typeform";

import type { SourceType } from "@feedbackiq/supabase";
import type { Collector } from "./types";
import { GooglePlacesCollector } from "./google-places";
import { YelpCollector } from "./yelp";
import { G2Collector } from "./g2";
import { AppStoreCollector } from "./app-store";
import { ZendeskCollector } from "./zendesk";
import { IntercomCollector } from "./intercom";
import { TypeformCollector } from "./typeform";

const collectorRegistry: Record<SourceType, () => Collector> = {
  google_places: () => new GooglePlacesCollector(),
  yelp: () => new YelpCollector(),
  g2: () => new G2Collector(),
  app_store: () => new AppStoreCollector(),
  zendesk: () => new ZendeskCollector(),
  intercom: () => new IntercomCollector(),
  typeform: () => new TypeformCollector(),
};

export function createCollector(sourceType: SourceType): Collector {
  const factory = collectorRegistry[sourceType];
  if (!factory) {
    throw new Error(`Unknown source type: ${sourceType}`);
  }
  return factory();
}
