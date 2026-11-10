/**
 * WhatsApp message templates (category: UTILITY). Create them in WhatsApp
 * Manager / 360dialog hub with exactly these names, language "en" and body
 * text, then wait for approval. Business-initiated messages (reminders,
 * payment links, owner summaries) can only be sent as approved templates.
 */
export interface TemplateDefinition {
  name: string;
  language: string;
  category: "UTILITY";
  body: string; // {{1}}, {{2}}... placeholders
  example: string[];
  description: string;
}

export const TEMPLATES = {
  booking_confirmation: {
    name: "booking_confirmation",
    language: "en",
    category: "UTILITY",
    body: "Hi {{1}}, your {{2}} at {{3}} is confirmed for {{4}}. Booking ref: {{5}}. Reply to this message if you need to reschedule or cancel.",
    example: ["Shanice", "Silk Press", "Tasha's Beauty Salon", "Saturday 14 November at 10:00 AM", "TB-7K4P"],
    description: "Sent right after a booking is made by phone, website or WhatsApp.",
  },
  appointment_reminder: {
    name: "appointment_reminder",
    language: "en",
    category: "UTILITY",
    body: "Reminder from {{1}}: your {{2}} is {{3}}, {{4}}. Booking ref: {{5}}. Reply C to cancel or R to reschedule.",
    example: ["Tasha's Beauty Salon", "Silk Press", "tomorrow", "Saturday 14 November at 10:00 AM", "TB-7K4P"],
    description: "Sent 24 hours and 2 hours before the appointment.",
  },
  booking_update: {
    name: "booking_update",
    language: "en",
    category: "UTILITY",
    body: "Hi {{1}}, your booking {{2}} at {{3}} has been {{4}}. Details: {{5}}. Reply here if you have any questions.",
    example: ["Shanice", "TB-7K4P", "Tasha's Beauty Salon", "rescheduled", "Silk Press on Monday 16 November at 2:00 PM"],
    description: "Sent when a booking is rescheduled or cancelled.",
  },
  payment_link: {
    name: "payment_link",
    language: "en",
    category: "UTILITY",
    body: "Hi {{1}}, here is your secure payment link from {{2}} for {{3}} ({{4}}): {{5}} Reference: {{6}}. We never ask for card details by chat.",
    example: ["Shanice", "Tasha's Beauty Salon", "Box Braids deposit", "J$5,000", "https://pay.example.com/abc", "PAY-8XK2"],
    description: "Sends a Fygaro or WiPay payment link (deposit, full payment or invoice).",
  },
  payment_reminder: {
    name: "payment_reminder",
    language: "en",
    category: "UTILITY",
    body: "Hi {{1}}, a friendly reminder from {{2}}: your payment of {{3}} for {{4}} (ref {{5}}) is still open. Pay securely here: {{6}} If you've already paid, please reply and we'll check.",
    example: ["Shanice", "Tasha's Beauty Salon", "J$5,000", "Box Braids deposit", "PAY-8XK2", "https://pay.example.com/abc"],
    description: "Polite payment follow-up (day 3 and day 7).",
  },
  owner_call_summary: {
    name: "owner_call_summary",
    language: "en",
    category: "UTILITY",
    body: "New call for {{1}}. Caller: {{2}}. Reason: {{3}}. Outcome: {{4}}. Booking: {{5}}. Transcript: {{6}}",
    example: [
      "Tasha's Beauty Salon",
      "Shanice Brown (876) 555-0142",
      "Wants a silk press Saturday",
      "Booked",
      "Silk Press, Sat 14 Nov 10:00 AM, ref TB-7K4P",
      "https://app.example.com/dashboard/calls/abc",
    ],
    description: "Summary sent to the owner after every call.",
  },
  staff_alert: {
    name: "staff_alert",
    language: "en",
    category: "UTILITY",
    body: "{{1}} for {{2}}: {{3}}. Customer: {{4}}. Open the inbox: {{5}}",
    example: ["Customer wants a person", "Tasha's Beauty Salon", "Asked about a refund", "(876) 555-0142", "https://app.example.com/dashboard/inbox/abc"],
    description: "Handoff requests, urgent flags and messages for staff.",
  },
} as const satisfies Record<string, TemplateDefinition>;

export type TemplateName = keyof typeof TEMPLATES;

/**
 * Template parameters may not contain newlines, tabs or more than four
 * consecutive spaces, and must not be empty.
 */
export function sanitizeParam(value: string | null | undefined, maxLength = 250): string {
  const cleaned = (value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  const short = cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
  return short || "-";
}

export function renderTemplate(name: TemplateName, params: string[]): string {
  const def = TEMPLATES[name];
  return def.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? "");
}

export function templateParamCount(name: TemplateName): number {
  return (TEMPLATES[name].body.match(/\{\{\d+\}\}/g) ?? []).length;
}
