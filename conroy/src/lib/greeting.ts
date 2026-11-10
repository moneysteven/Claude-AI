import { greetingFor } from "./time";

/**
 * The phone opening line. Browser-safe (used for the live preview in the
 * onboarding wizard and settings) and used by the voice agent.
 */

export interface GreetingBusiness {
  name: string;
  assistantName: string;
  category: string;
  greeting: string | null;
  timezone: string;
}

export const PLACE_NOUN: Record<string, string> = {
  SALON: "salon",
  BARBER: "shop",
  AUTO_SHOP: "shop",
  RESTAURANT: "restaurant",
  CLINIC: "clinic",
  GYM: "gym",
  BOUTIQUE: "boutique",
  TOUR_OPERATOR: "team",
  GUESTHOUSE: "guesthouse",
  OTHER: "team",
};

const DISCLOSURE_RE = /\b(ai|artificial intelligence|virtual assistant)\b/i;
const RECORDING_RE = /\brecord(ed|ing)?\b/i;

/**
 * Opening line. AI disclosure and the recording notice are mandatory and are
 * added even if a business writes its own greeting.
 * e.g. "Good morning, you've reached Tasha's Beauty Salon. I'm Conroy, the salon's
 * AI assistant. This call may be recorded to help us serve you. How can I help?"
 */
export function buildVoiceGreeting(
  business: GreetingBusiness,
  now: Date = new Date(),
): string {
  const hello = greetingFor(now, business.timezone);
  const noun = PLACE_NOUN[business.category] ?? "team";
  if (business.greeting && business.greeting.trim()) {
    let custom = business.greeting
      .trim()
      .replace(/\{greeting\}/gi, hello)
      .replace(/\{business\}/gi, business.name)
      .replace(/\{assistant\}/gi, business.assistantName);
    if (!DISCLOSURE_RE.test(custom)) custom += ` I'm ${business.assistantName}, an AI assistant.`;
    if (!RECORDING_RE.test(custom)) custom += " This call may be recorded to help us serve you.";
    if (!/\?\s*$/.test(custom)) custom += " How can I help?";
    return custom;
  }
  return `${hello}, you've reached ${business.name}. I'm ${business.assistantName}, the ${noun}'s AI assistant. This call may be recorded to help us serve you. How can I help?`;
}
