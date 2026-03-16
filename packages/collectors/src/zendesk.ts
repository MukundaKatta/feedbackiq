import type { Collector, CollectorConfig, CollectedReview } from "./types";

interface ZendeskConfig extends CollectorConfig {
  subdomain?: string;
  email?: string;
  apiToken?: string;
  ticketFormId?: string;
  satisfactionRatingsOnly?: boolean;
}

interface ZendeskSatisfactionRating {
  id: number;
  url: string;
  assignee_id: number;
  group_id: number;
  requester_id: number;
  ticket_id: number;
  score: "offered" | "good" | "bad";
  comment: string;
  reason: string;
  reason_code: number;
  created_at: string;
  updated_at: string;
}

interface ZendeskRatingsResponse {
  satisfaction_ratings: ZendeskSatisfactionRating[];
  next_page: string | null;
  count: number;
}

interface ZendeskTicket {
  id: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  requester_id: number;
  created_at: string;
  updated_at: string;
  satisfaction_rating?: {
    score: string;
    comment: string;
  };
  tags: string[];
}

interface ZendeskTicketsResponse {
  tickets: ZendeskTicket[];
  next_page: string | null;
  count: number;
}

interface ZendeskUser {
  id: number;
  name: string;
  email: string;
  photo: { content_url: string } | null;
}

export class ZendeskCollector implements Collector {
  readonly sourceType = "zendesk" as const;
  private subdomain: string;
  private email: string;
  private apiToken: string;

  constructor(subdomain?: string, email?: string, apiToken?: string) {
    this.subdomain = subdomain || process.env.ZENDESK_SUBDOMAIN || "";
    this.email = email || process.env.ZENDESK_EMAIL || "";
    this.apiToken = apiToken || process.env.ZENDESK_API_TOKEN || "";
  }

  private get authHeader(): string {
    const credentials = Buffer.from(
      `${this.email}/token:${this.apiToken}`
    ).toString("base64");
    return `Basic ${credentials}`;
  }

  private get baseUrl(): string {
    return `https://${this.subdomain}.zendesk.com/api/v2`;
  }

  private async fetchUser(userId: number): Promise<ZendeskUser | null> {
    try {
      const response = await fetch(`${this.baseUrl}/users/${userId}.json`, {
        headers: { Authorization: this.authHeader },
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.user;
    } catch {
      return null;
    }
  }

  async fetchReviews(
    config: ZendeskConfig,
    since?: Date
  ): Promise<CollectedReview[]> {
    const subdomain = config.subdomain || this.subdomain;
    const email = config.email || this.email;
    const apiToken = config.apiToken || this.apiToken;

    if (!subdomain || !email || !apiToken) {
      throw new Error("Zendesk credentials (subdomain, email, apiToken) are required");
    }

    this.subdomain = subdomain;
    this.email = email;
    this.apiToken = apiToken;

    if (config.satisfactionRatingsOnly !== false) {
      return this.fetchSatisfactionRatings(since);
    }

    return this.fetchTicketFeedback(config.ticketFormId, since);
  }

  private async fetchSatisfactionRatings(
    since?: Date
  ): Promise<CollectedReview[]> {
    const allReviews: CollectedReview[] = [];
    let url: string | null = `${this.baseUrl}/satisfaction_ratings.json?sort_by=created_at&sort_order=desc&per_page=100`;

    if (since) {
      url += `&start_time=${Math.floor(since.getTime() / 1000)}`;
    }

    const userCache = new Map<number, ZendeskUser | null>();

    while (url) {
      const response = await fetch(url, {
        headers: { Authorization: this.authHeader },
      });

      if (!response.ok) {
        throw new Error(
          `Zendesk API error: ${response.status} ${response.statusText}`
        );
      }

      const data: ZendeskRatingsResponse = await response.json();

      for (const rating of data.satisfaction_ratings) {
        if (rating.score === "offered") continue;

        if (!userCache.has(rating.requester_id)) {
          userCache.set(
            rating.requester_id,
            await this.fetchUser(rating.requester_id)
          );
        }
        const user = userCache.get(rating.requester_id);

        const ratingValue = rating.score === "good" ? 5 : 1;

        const content = [
          `Satisfaction: ${rating.score}`,
          rating.comment ? `Comment: ${rating.comment}` : "",
          rating.reason ? `Reason: ${rating.reason}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        allReviews.push({
          externalId: `zd_sat_${rating.id}`,
          authorName: user?.name || null,
          authorAvatarUrl: user?.photo?.content_url || null,
          content,
          rating: ratingValue,
          language: "en",
          publishedAt: new Date(rating.created_at).toISOString(),
          rawData: rating as unknown as Record<string, unknown>,
        });
      }

      url = data.next_page;
    }

    return allReviews;
  }

  private async fetchTicketFeedback(
    ticketFormId?: string,
    since?: Date
  ): Promise<CollectedReview[]> {
    const allReviews: CollectedReview[] = [];
    let searchQuery = "type:ticket";

    if (ticketFormId) {
      searchQuery += ` ticket_form_id:${ticketFormId}`;
    }
    if (since) {
      searchQuery += ` created>${since.toISOString().split("T")[0]}`;
    }

    let url: string | null = `${this.baseUrl}/search.json?query=${encodeURIComponent(searchQuery)}&sort_by=created_at&sort_order=desc&per_page=100`;

    while (url) {
      const response = await fetch(url, {
        headers: { Authorization: this.authHeader },
      });

      if (!response.ok) {
        throw new Error(
          `Zendesk Search API error: ${response.status} ${response.statusText}`
        );
      }

      const data: ZendeskTicketsResponse = await response.json();

      for (const ticket of data.tickets) {
        const feedbackContent = [
          ticket.subject ? `Subject: ${ticket.subject}` : "",
          ticket.description,
          ticket.satisfaction_rating?.comment
            ? `Satisfaction Comment: ${ticket.satisfaction_rating.comment}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const satScore = ticket.satisfaction_rating?.score;
        const rating = satScore === "good" ? 5 : satScore === "bad" ? 1 : null;

        allReviews.push({
          externalId: `zd_ticket_${ticket.id}`,
          authorName: null,
          authorAvatarUrl: null,
          content: feedbackContent,
          rating,
          language: "en",
          publishedAt: new Date(ticket.created_at).toISOString(),
          rawData: ticket as unknown as Record<string, unknown>,
        });
      }

      url = data.next_page;
    }

    return allReviews;
  }
}
