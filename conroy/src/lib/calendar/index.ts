import type { Business } from "@prisma/client";
import { decryptJson } from "../crypto";
import { env } from "../env";
import { CalComProvider } from "./calcom";
import { GoogleCalendarProvider } from "./google";
import type { CalendarProvider, ExternalBusy } from "./types";

export type { CalendarProvider, ExternalBusy, CalendarEventInput } from "./types";

/** Per-business calendar settings stored encrypted in Business.calendarConfigEnc. */
export interface CalendarConfig {
  /** Google: calendar id for business-wide events (often the owner's Gmail address). */
  calendarId?: string;
  /** Cal.com: API key and the default event type id. */
  apiKey?: string;
  eventTypeId?: string;
}

/** Internal provider: Conroy's database only, nothing external. */
export class InternalCalendarProvider implements CalendarProvider {
  readonly type = "INTERNAL" as const;
  async listBusy(): Promise<ExternalBusy[]> {
    return [];
  }
  async createEvent(): Promise<string | null> {
    return null;
  }
  async updateEvent(externalId: string): Promise<string | null> {
    return externalId;
  }
  async deleteEvent(): Promise<void> {}
}

export interface ResolvedCalendar {
  provider: CalendarProvider;
  /** Calendar for business-wide busy time and for bookings with no staff calendar. */
  defaultCalendarId: string | null;
}

export function calendarFor(
  business: Pick<Business, "calendarProvider" | "calendarConfigEnc" | "timezone">,
): ResolvedCalendar {
  const config = decryptJson<CalendarConfig>(business.calendarConfigEnc) ?? {};
  if (business.calendarProvider === "GOOGLE") {
    if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
      throw new Error("Google Calendar selected but GOOGLE_SERVICE_ACCOUNT_* is not configured");
    }
    return {
      provider: new GoogleCalendarProvider(
        { clientEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, privateKey: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY },
        business.timezone,
      ),
      defaultCalendarId: config.calendarId ?? null,
    };
  }
  if (business.calendarProvider === "CALCOM") {
    if (!config.apiKey) throw new Error("Cal.com selected but no API key is saved for this business");
    return { provider: new CalComProvider(config.apiKey, env.CALCOM_API_BASE_URL), defaultCalendarId: config.eventTypeId ?? null };
  }
  return { provider: new InternalCalendarProvider(), defaultCalendarId: null };
}
