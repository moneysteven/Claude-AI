import { detectIntent } from "./intents";

/** Jamaica emergency numbers. */
export const EMERGENCY_NUMBERS = {
  police: "119",
  ambulanceFire: "110",
} as const;

export const EMERGENCY_MESSAGE =
  "If this is an emergency, please hang up and call 110 for an ambulance or 119 for the police right away. " +
  "I'm an AI assistant and can't give medical advice, but I'm alerting the team now.";

export function isUrgentMedical(text: string): boolean {
  return detectIntent(text).matched.includes("URGENT_MEDICAL");
}

/** Extra rules for regulated categories, appended to the assistant prompt. */
export function categoryGuardrails(category: string): string {
  const base =
    "Never give medical, legal or financial advice. If asked, say you're an AI assistant and offer to book an appointment or pass the question to the team.";
  if (category === "CLINIC") {
    return (
      base +
      " This is a clinic: you ONLY book appointments, share practical information (hours, location, prices, what to bring) and route messages. " +
      "Never suggest a diagnosis, medication, dosage or treatment. If someone describes urgent symptoms (chest pain, trouble breathing, heavy bleeding, " +
      "fainting, stroke signs, severe allergic reaction, thoughts of self-harm) tell them to call 110 (ambulance) or 119 (police) immediately, " +
      "then flag it to staff with urgency URGENT."
    );
  }
  return base;
}
