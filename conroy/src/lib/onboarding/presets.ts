import type { Category, OnboardingInput } from "./schema";

/**
 * Sensible starting points per business type, so onboarding with the owner
 * takes minutes. Prices are deliberately left blank: never guess a price.
 * Client-safe.
 */

type Hours = OnboardingInput["hours"];

const day = (weekday: number, open: string, close: string, lunch?: [string, string]) => ({
  weekday,
  isClosed: false,
  openTime: open,
  closeTime: close,
  breakStart: lunch?.[0] ?? "",
  breakEnd: lunch?.[1] ?? "",
});
const closed = (weekday: number) => ({ weekday, isClosed: true, openTime: "", closeTime: "", breakStart: "", breakEnd: "" });

function weekHours(build: (weekday: number) => Hours[number]): Hours {
  return [0, 1, 2, 3, 4, 5, 6].map(build);
}

export const PRESET_HOURS: Record<Category, Hours> = {
  SALON: weekHours((d) => (d === 0 ? closed(d) : d === 6 ? day(d, "08:00", "15:00") : day(d, "09:00", "18:00"))),
  BARBER: weekHours((d) => (d === 0 ? day(d, "10:00", "15:00") : day(d, "09:00", "19:00"))),
  AUTO_SHOP: weekHours((d) => (d === 0 ? closed(d) : d === 6 ? day(d, "08:00", "13:00") : day(d, "08:00", "17:00", ["12:00", "13:00"]))),
  RESTAURANT: weekHours((d) => day(d, "11:00", "22:00")),
  CLINIC: weekHours((d) => (d === 0 ? closed(d) : d === 6 ? day(d, "09:00", "12:00") : day(d, "08:30", "16:30", ["12:30", "13:30"]))),
  GYM: weekHours((d) => (d === 0 ? day(d, "07:00", "13:00") : day(d, "05:30", "21:00"))),
  BOUTIQUE: weekHours((d) => (d === 0 ? closed(d) : day(d, "10:00", "18:00"))),
  TOUR_OPERATOR: weekHours((d) => day(d, "07:00", "18:00")),
  GUESTHOUSE: weekHours((d) => day(d, "08:00", "20:00")),
  OTHER: weekHours((d) => (d === 0 ? closed(d) : d === 6 ? day(d, "09:00", "14:00") : day(d, "09:00", "17:00"))),
};

type ServicePreset = Pick<OnboardingInput["services"][number], "name" | "durationMin">;

export const PRESET_SERVICES: Record<Category, ServicePreset[]> = {
  SALON: [
    { name: "Wash & Set", durationMin: 60 },
    { name: "Silk Press", durationMin: 90 },
    { name: "Trim", durationMin: 30 },
    { name: "Relaxer Touch-up", durationMin: 120 },
    { name: "Box Braids", durationMin: 300 },
  ],
  BARBER: [
    { name: "Haircut", durationMin: 30 },
    { name: "Haircut & Beard", durationMin: 45 },
    { name: "Line-up / Shape-up", durationMin: 15 },
    { name: "Kids' Haircut", durationMin: 30 },
  ],
  AUTO_SHOP: [
    { name: "Oil & Filter Change", durationMin: 60 },
    { name: "Computer Diagnostics", durationMin: 60 },
    { name: "Brake Service", durationMin: 120 },
    { name: "Wheel Alignment", durationMin: 60 },
  ],
  RESTAURANT: [
    { name: "Table Reservation", durationMin: 90 },
    { name: "Catering Consultation", durationMin: 30 },
  ],
  CLINIC: [
    { name: "General Consultation", durationMin: 20 },
    { name: "Follow-up Visit", durationMin: 15 },
    { name: "Medical Certificate", durationMin: 15 },
  ],
  GYM: [
    { name: "Personal Training Session", durationMin: 60 },
    { name: "Fitness Assessment", durationMin: 45 },
    { name: "Gym Tour / Sign-up", durationMin: 30 },
  ],
  BOUTIQUE: [
    { name: "Personal Styling Appointment", durationMin: 60 },
    { name: "Alterations Fitting", durationMin: 30 },
  ],
  TOUR_OPERATOR: [
    { name: "Half-day Tour", durationMin: 240 },
    { name: "Full-day Tour", durationMin: 480 },
    { name: "Airport Transfer", durationMin: 90 },
  ],
  GUESTHOUSE: [{ name: "Property Viewing", durationMin: 30 }],
  OTHER: [{ name: "Appointment", durationMin: 30 }],
};

export const PRESET_POLICIES: OnboardingInput["policies"] = [
  { kind: "CANCELLATION", title: "Cancellations", body: "Please give at least 24 hours' notice to cancel or reschedule." },
  { kind: "LATENESS", title: "Lateness", body: "We hold your appointment for 15 minutes. After that we may need to reschedule you." },
];

/** Questions owners are usually asked; answers must be filled in with the owner. */
export const SUGGESTED_FAQS: Record<Category, string[]> = {
  SALON: ["Do you take walk-ins?", "Is there parking?", "Do I need to bring my own hair for braids?", "How can I pay?"],
  BARBER: ["Do you take walk-ins?", "Do you cut children's hair?", "How can I pay?"],
  AUTO_SHOP: ["Do you work on all makes of vehicle?", "Do you sell parts or should I bring my own?", "Do you offer a warranty on repairs?", "How can I pay?"],
  RESTAURANT: ["Do you deliver?", "Do you have vegetarian options?", "Can you cater events?", "Is there parking?"],
  CLINIC: ["Do you accept health insurance?", "What should I bring to my appointment?", "Do you take walk-ins?", "How can I pay?"],
  GYM: ["How much is membership?", "Do you offer day passes?", "Do you have personal trainers?"],
  BOUTIQUE: ["Do you do alterations?", "What is your return policy?", "Do you deliver?"],
  TOUR_OPERATOR: ["Do you pick up from hotels?", "Is lunch included?", "What should I bring?", "Do you take US dollars?"],
  GUESTHOUSE: ["What time is check-in and check-out?", "Is there Wi-Fi?", "Do you offer airport pickup?", "Is breakfast included?"],
  OTHER: ["Where are you located?", "How can I pay?"],
};
