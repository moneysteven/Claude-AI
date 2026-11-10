import { CalendarProviderError, type CalendarEventInput, type CalendarProvider, type ExternalBusy } from "./types";

/**
 * Cal.com (API v2) as the calendar of record. "calendarId" is a Cal.com event
 * type id (one per staff member or one for the business). Conroy bookings are
 * created as Cal.com bookings so they show up in Cal.com and its connected
 * calendars; bookings made directly on Cal.com count as busy time here.
 */

type FetchFn = typeof fetch;

interface CalBooking {
  uid: string;
  start: string;
  end: string;
  status?: string;
  eventTypeId?: number;
  metadata?: Record<string, string>;
}

const BOOKINGS_API_VERSION = "2024-08-13";

export class CalComProvider implements CalendarProvider {
  readonly type = "CALCOM" as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "cal-api-version": BOOKINGS_API_VERSION,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new CalendarProviderError(`Cal.com ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status})`, res.status);
    const json = (await res.json()) as { status?: string; data: T };
    return json.data;
  }

  async listBusy({ calendarIds, from, to }: { calendarIds: string[]; from: Date; to: Date }): Promise<ExternalBusy[]> {
    if (calendarIds.length === 0) return [];
    const params = new URLSearchParams({
      afterStart: from.toISOString(),
      beforeEnd: to.toISOString(),
      status: "upcoming,unconfirmed",
      eventTypeIds: calendarIds.join(","),
      take: "250",
    });
    const bookings = await this.call<CalBooking[]>(`/bookings?${params}`);
    return (bookings ?? [])
      .filter((b) => b.metadata?.conroy !== "1")
      .filter((b) => b.eventTypeId !== undefined && calendarIds.includes(String(b.eventTypeId)))
      .map((b) => ({ calendarId: String(b.eventTypeId), startAt: new Date(b.start), endAt: new Date(b.end) }));
  }

  async createEvent(input: CalendarEventInput): Promise<string | null> {
    const booking = await this.call<CalBooking>("/bookings", {
      method: "POST",
      body: JSON.stringify({
        start: input.startAt.toISOString(),
        eventTypeId: Number(input.calendarId),
        attendee: {
          name: input.attendeeName,
          // Cal.com requires an email; customers book by phone/WhatsApp, so a
          // non-deliverable placeholder keyed to the booking is used.
          email: `booking-${input.reference.toLowerCase()}@noreply.invalid`,
          timeZone: input.timezone,
          ...(input.attendeePhone ? { phoneNumber: input.attendeePhone } : {}),
        },
        metadata: { conroy: "1", conroyBookingId: input.bookingId, reference: input.reference },
      }),
    });
    return booking.uid;
  }

  async updateEvent(externalId: string, input: CalendarEventInput): Promise<string | null> {
    const booking = await this.call<CalBooking>(`/bookings/${encodeURIComponent(externalId)}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ start: input.startAt.toISOString(), reschedulingReason: "Rescheduled via Conroy" }),
    });
    return booking.uid ?? externalId;
  }

  async deleteEvent(externalId: string, _calendarId: string, reason = "Cancelled via Conroy"): Promise<void> {
    await this.call(`/bookings/${encodeURIComponent(externalId)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ cancellationReason: reason }),
    });
  }
}
