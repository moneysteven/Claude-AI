import { z } from "zod";

/**
 * The onboarding form's data, shared by the browser wizard and the server.
 * Client-safe: no server imports here.
 */

export const CATEGORIES = ["SALON", "BARBER", "AUTO_SHOP", "RESTAURANT", "CLINIC", "GYM", "BOUTIQUE", "TOUR_OPERATOR", "GUESTHOUSE", "OTHER"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  SALON: "Hair / beauty salon",
  BARBER: "Barber shop",
  AUTO_SHOP: "Auto shop / mechanic",
  RESTAURANT: "Restaurant / cook shop",
  CLINIC: "Clinic / doctor / dentist",
  GYM: "Gym / fitness",
  BOUTIQUE: "Boutique / store",
  TOUR_OPERATOR: "Tour operator",
  GUESTHOUSE: "Guesthouse / villa",
  OTHER: "Other",
};

export const PARISHES = [
  "Kingston",
  "St. Andrew",
  "St. Catherine",
  "Clarendon",
  "Manchester",
  "St. Elizabeth",
  "Westmoreland",
  "Hanover",
  "St. James",
  "Trelawny",
  "St. Ann",
  "St. Mary",
  "Portland",
  "St. Thomas",
] as const;

export const WEBSITE_PLATFORMS = [
  "WordPress",
  "Hostinger Website Builder",
  "Wix",
  "Squarespace",
  "Shopify",
  "Plain HTML",
  "Facebook / Instagram only",
  "No website yet",
  "Other",
] as const;

export const POLICY_KINDS = ["CANCELLATION", "DEPOSIT", "LATENESS", "PAYMENT", "CHILDREN", "OTHER"] as const;
export const PLANS = ["LITE", "STARTER", "GROWTH"] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = z.union([z.literal(""), z.string().regex(TIME, "use a time like 09:00")]);
const text = (max: number) => z.string().trim().max(max, `keep it under ${max} characters`);
const required = (max: number, message: string) => z.string().trim().min(1, message).max(max, `keep it under ${max} characters`);

export const onboardingSchema = z.object({
  business: z.object({
    name: required(120, "Enter the business name"),
    category: z.enum(CATEGORIES),
    addressLine: text(200),
    area: text(100),
    parish: z.enum(PARISHES),
    directions: text(1000),
    email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
    websiteUrl: z.union([z.literal(""), z.string().trim().url("Use a full address like https://example.com")]),
    websitePlatform: z.enum(WEBSITE_PLATFORMS),
  }),
  phones: z.object({
    phoneMain: text(30),
    whatsappNumber: text(30),
    ownerWhatsapp: text(30),
    handoffNumber: text(30),
    voiceNumber: text(30),
  }),
  hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        isClosed: z.boolean(),
        openTime: time,
        closeTime: time,
        breakStart: time,
        breakEnd: time,
      }),
    )
    .length(7),
  /** Keys of public holidays the business stays OPEN (all others: closed). */
  holidaysOpen: z.array(z.string().max(40)).max(20),
  staff: z
    .array(
      z.object({
        name: required(60, "Enter the staff member's name"),
        title: text(80),
        workDays: z.array(z.number().int().min(0).max(6)).max(7),
      }),
    )
    .max(30),
  services: z
    .array(
      z.object({
        name: required(100, "Enter the service name"),
        durationMin: z.number().int().min(5, "at least 5 minutes").max(720, "at most 12 hours"),
        price: text(20),
        priceIsFrom: z.boolean(),
        deposit: text(20),
        staffNames: z.array(z.string().max(60)).max(30),
        description: text(300),
      }),
    )
    .min(1, "Add at least one service")
    .max(80),
  faqs: z.array(z.object({ question: required(300, "Enter the question"), answer: required(1000, "Enter the answer") })).max(50),
  policies: z
    .array(z.object({ kind: z.enum(POLICY_KINDS), title: required(100, "Enter a title"), body: required(1000, "Enter the policy text") }))
    .max(12),
  assistant: z.object({
    assistantName: required(40, "Give the assistant a name"),
    tone: z.enum(["JAMAICAN_ENGLISH", "LIGHT_PATOIS"]),
    greeting: text(400),
    extraKnowledge: text(4000),
  }),
  payments: z
    .array(
      z.object({
        provider: z.enum(["FYGARO", "WIPAY"]),
        kind: z.enum(["DEPOSIT", "FULL", "INVOICE"]),
        label: required(100, "Enter a label"),
        urlTemplate: required(500, "Paste the payment link"),
        defaultAmount: text(20),
      }),
    )
    .max(10),
  calendar: z.object({
    provider: z.enum(["INTERNAL", "GOOGLE", "CALCOM"]),
    googleCalendarId: text(200),
    calcomApiKey: text(200),
    calcomEventTypeId: text(20),
  }),
  plan: z.enum(PLANS),
  owner: z.object({
    name: required(120, "Enter the owner's name"),
    email: z.string().trim().email("Enter the owner's email (used to sign in)"),
  }),
  options: z.object({
    goLive: z.boolean(),
    createVoiceAgent: z.boolean(),
  }),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** Which wizard step a field path belongs to (to jump to the first error). */
export const STEP_FOR_SECTION: Record<string, number> = {
  business: 0,
  phones: 1,
  owner: 1,
  hours: 2,
  holidaysOpen: 2,
  staff: 3,
  services: 4,
  faqs: 5,
  policies: 5,
  assistant: 6,
  payments: 7,
  calendar: 8,
  plan: 8,
  options: 9,
};

export type FieldErrors = Record<string, string>;
