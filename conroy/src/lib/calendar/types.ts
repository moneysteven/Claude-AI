/**
 * One interface for every calendar backend. Conroy's own database is always
 * the source of truth for bookings it makes; a provider adds:
 *  - busy time the business created elsewhere (owner blocks off a morning in
 *    Google Calendar, a booking made directly on Cal.com), and
 *  - a mirror of Conroy bookings so staff see them in the calendar they use.
 */
export interface ExternalBusy {
  /** Google calendar id / Cal.com event type id the busy time belongs to. */
  calendarId: string;
  startAt: Date;
  endAt: Date;
}

export interface CalendarEventInput {
  calendarId: string;
  bookingId: string;
  reference: string;
  title: string;
  description: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  attendeeName: string;
  attendeePhone?: string | null;
}

export interface CalendarProvider {
  readonly type: "INTERNAL" | "GOOGLE" | "CALCOM";
  /** Busy intervals NOT created by Conroy, for the given calendars. */
  listBusy(params: { calendarIds: string[]; from: Date; to: Date }): Promise<ExternalBusy[]>;
  /** Mirror a booking; returns the external id (event id / booking uid). */
  createEvent(input: CalendarEventInput): Promise<string | null>;
  /** Update the mirror; returns the (possibly new) external id. */
  updateEvent(externalId: string, input: CalendarEventInput): Promise<string | null>;
  deleteEvent(externalId: string, calendarId: string, reason?: string): Promise<void>;
}

export class CalendarProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CalendarProviderError";
  }
}
