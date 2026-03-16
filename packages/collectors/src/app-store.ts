import type { Collector, CollectorConfig, CollectedReview } from "./types";
import jwt from "jsonwebtoken";

interface AppStoreConfig extends CollectorConfig {
  appId: string;
  keyId?: string;
  issuerId?: string;
  privateKey?: string;
}

interface AppStoreReview {
  id: string;
  type: string;
  attributes: {
    rating: number;
    title: string;
    body: string;
    reviewerNickname: string;
    createdDate: string;
    territory: string;
  };
}

interface AppStoreResponse {
  data: AppStoreReview[];
  links: {
    self: string;
    next?: string;
  };
}

export class AppStoreCollector implements Collector {
  readonly sourceType = "app_store" as const;
  private keyId: string;
  private issuerId: string;
  private privateKey: string;

  constructor(keyId?: string, issuerId?: string, privateKey?: string) {
    this.keyId = keyId || process.env.APP_STORE_KEY_ID || "";
    this.issuerId = issuerId || process.env.APP_STORE_ISSUER_ID || "";
    this.privateKey = privateKey || process.env.APP_STORE_PRIVATE_KEY || "";
  }

  private generateToken(): string {
    if (!this.keyId || !this.issuerId || !this.privateKey) {
      throw new Error(
        "App Store Connect credentials (keyId, issuerId, privateKey) are required"
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.issuerId,
      iat: now,
      exp: now + 20 * 60, // 20 minutes
      aud: "appstoreconnect-v1",
    };

    return jwt.sign(payload, this.privateKey, {
      algorithm: "ES256",
      header: {
        alg: "ES256",
        kid: this.keyId,
        typ: "JWT",
      },
    });
  }

  async fetchReviews(
    config: AppStoreConfig,
    since?: Date
  ): Promise<CollectedReview[]> {
    const keyId = config.keyId || this.keyId;
    const issuerId = config.issuerId || this.issuerId;
    const privateKey = config.privateKey || this.privateKey;

    if (!keyId || !issuerId || !privateKey) {
      throw new Error("App Store Connect credentials are required");
    }

    // Temporarily set for token generation
    this.keyId = keyId;
    this.issuerId = issuerId;
    this.privateKey = privateKey;

    const token = this.generateToken();
    const allReviews: CollectedReview[] = [];
    let nextUrl: string | null =
      `https://api.appstoreconnect.apple.com/v1/apps/${config.appId}/customerReviews?sort=-createdDate&limit=200`;

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `App Store Connect API error: ${response.status} ${response.statusText}`
        );
      }

      const data: AppStoreResponse = await response.json();

      for (const review of data.data) {
        const publishedAt = new Date(review.attributes.createdDate);

        if (since && publishedAt <= since) {
          return allReviews;
        }

        const fullContent = review.attributes.title
          ? `${review.attributes.title}\n\n${review.attributes.body}`
          : review.attributes.body;

        allReviews.push({
          externalId: review.id,
          authorName: review.attributes.reviewerNickname || null,
          authorAvatarUrl: null,
          content: fullContent,
          rating: review.attributes.rating,
          language: "en",
          publishedAt: publishedAt.toISOString(),
          rawData: review as unknown as Record<string, unknown>,
        });
      }

      nextUrl = data.links.next || null;
    }

    return allReviews;
  }
}
