import crypto from "node:crypto";
import { DateTime } from "luxon";
import { CalendarProviderError, type CalendarEventInput, type CalendarProvider, type ExternalBusy } from "./types";

/**
 * Google Calendar via a platform service account. Each business shares its
 * calendar(s) with GOOGLE_SERVICE_ACCOUNT_EMAIL ("Make changes to events"),
 * so no per-business OAuth consent screen is needed. See SETUP_PROVIDERS.md.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";

export interface GoogleCredentials {
  clientEmail: string;
  privateKey: string;
}

type FetchFn = typeof fetch;

let tokenCache: { token: string; expiresAt: number; email: string } | null = null;

function signJwt(creds: GoogleCredentials, nowSec: number): string {
  const header = { alg: "RS256", typ: "JWT" };
  const claims = { iss: creds.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 };
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc(header)}.${enc(claims)}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(creds.privateKey.replace(/\\n/g, "\n"));
  return `${unsigned}.${signature.toString("base64url")}`;
}

interface GoogleEvent {
  id: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly type = "GOOGLE" as const;

  constructor(
    private readonly creds: GoogleCredentials,
    private readonly timezone: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private async token(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (tokenCache && tokenCache.email === this.creds.clientEmail && tokenCache.expiresAt - 60 > now) return tokenCache.token;
    const res = await this.fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signJwt(this.creds, now),
      }),
    });
    if (!res.ok) throw new CalendarProviderError(`Google token request failed (${res.status})`, res.status);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    tokenCache = { token: json.access_token, expiresAt: now + json.expires_in, email: this.creds.clientEmail };
    return json.access_token;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchFn(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await this.token()}`, "content-type": "application/json", ...(init.headers ?? {}) },
    });
    if (res.status === 204 || (res.status === 410 && init.method === "DELETE")) return undefined as T;
    if (!res.ok) throw new CalendarProviderError(`Google Calendar ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status})`, res.status);
    return (await res.json()) as T;
  }

  async listBusy({ calendarIds, from, to }: { calendarIds: string[]; from: Date; to: Date }): Promise<ExternalBusy[]> {
    const out: ExternalBusy[] = [];
    for (const calendarId of calendarIds) {
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250",
        });
        if (pageToken) params.set("pageToken", pageToken);
        const page = await this.call<{ items?: GoogleEvent[]; nextPageToken?: string }>(
          `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        );
        for (const ev of page.items ?? []) {
          if (ev.status === "cancelled" || ev.transparency === "transparent") continue;
          if (ev.extendedProperties?.private?.conroy === "1") continue; // our own mirror; already in the DB
          const range = this.eventRange(ev);
          if (range) out.push({ calendarId, ...range });
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
    }
    return out;
  }

  private eventRange(ev: GoogleEvent): { startAt: Date; endAt: Date } | null {
    if (ev.start?.dateTime && ev.end?.dateTime) {
      return { startAt: new Date(ev.start.dateTime), endAt: new Date(ev.end.dateTime) };
    }
    if (ev.start?.date && ev.end?.date) {
      // All-day events block the whole local day(s).
      return {
        startAt: DateTime.fromISO(ev.start.date, { zone: this.timezone }).toUTC().toJSDate(),
        endAt: DateTime.fromISO(ev.end.date, { zone: this.timezone }).toUTC().toJSDate(),
      };
    }
    return null;
  }

  private body(input: CalendarEventInput) {
    return {
      summary: input.title,
      description: input.description,
      start: { dateTime: input.startAt.toISOString(), timeZone: input.timezone },
      end: { dateTime: input.endAt.toISOString(), timeZone: input.timezone },
      extendedProperties: { private: { conroy: "1", conroyBookingId: input.bookingId, reference: input.reference } },
    };
  }

  async createEvent(input: CalendarEventInput): Promise<string | null> {
    const ev = await this.call<GoogleEvent>(`/calendars/${encodeURIComponent(input.calendarId)}/events`, {
      method: "POST",
      body: JSON.stringify(this.body(input)),
    });
    return ev.id;
  }

  async updateEvent(externalId: string, input: CalendarEventInput): Promise<string | null> {
    const ev = await this.call<GoogleEvent>(
      `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(externalId)}`,
      { method: "PATCH", body: JSON.stringify(this.body(input)) },
    );
    return ev.id;
  }

  async deleteEvent(externalId: string, calendarId: string): Promise<void> {
    await this.call(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}`, { method: "DELETE" });
  }
}
