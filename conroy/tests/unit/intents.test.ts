import { describe, expect, it } from "vitest";
import { detectIntent, isHumanHandoffKeyword, isOptOut, type Intent } from "@/lib/intents";
import { isUrgentMedical } from "@/lib/safety";

/**
 * Jamaican English / Patois test set: real ways customers ask things, with
 * the intent the assistant must recognise. Keep adding phrases heard on real
 * calls and chats.
 */
const PHRASES: [string, Intent][] = [
  ["wah gwaan", "GREETING"],
  ["Wagwan!", "GREETING"],
  ["Good morning, is this Tasha's salon?", "GREETING"],
  ["Wah gwaan, unnu open today?", "HOURS"],
  ["unnu open today?", "HOURS"],
  ["wat time unnu close?", "HOURS"],
  ["unnu open pon Sunday?", "HOURS"],
  ["how much fi a trim?", "PRICE"],
  ["a how much fi wash and set?", "PRICE"],
  ["wah di price fi box braids?", "PRICE"],
  ["mi waan book fi Saturday", "BOOK"],
  ["hello, mi waan mek a appointment", "BOOK"],
  ["mi waan a silk press tomorrow", "BOOK"],
  ["yuh have space tomorrow?", "AVAILABILITY"],
  ["yuh can fit mi in today bout 3?", "AVAILABILITY"],
  ["unnu have anyting fi Tuesday evening?", "AVAILABILITY"],
  ["a weh unnu deh?", "LOCATION"],
  ["weh unnu locate?", "LOCATION"],
  ["how mi fi get deh from Half Way Tree?", "LOCATION"],
  ["mi cyaan come tomorrow, mi haffi change di time", "RESCHEDULE"],
  ["Mi waan move mi appointment to Friday", "RESCHEDULE"],
  ["mi waan cancel mi appointment", "CANCEL"],
  ["cancel it", "CANCEL"],
  ["mi waan talk to a real person", "HUMAN"],
  ["put mi through to Tasha", "HUMAN"],
  ["lemme talk to somebody", "HUMAN"],
  ["STOP", "OPT_OUT"],
  ["stop sending mi message dem", "OPT_OUT"],
  ["START", "OPT_IN"],
  ["tanks", "THANKS"],
  ["big up yuhself", "THANKS"],
  ["respect, bless up", "THANKS"],
  ["unnu do braids?", "SERVICES"],
  ["wah kinda service unnu have?", "SERVICES"],
  ["how mi fi pay?", "PAYMENT"],
  ["unnu tek card?", "PAYMENT"],
  ["mi send di money already", "PAYMENT"],
  ["weh unnu cancellation policy?", "POLICY"],
  ["mi deposit refundable?", "POLICY"],
  ["mi did book fi 2 o'clock an nobody nuh deh yah, dis nuh right!", "COMPLAINT"],
  ["mi chest a hurt mi bad and mi cyaan breathe", "URGENT_MEDICAL"],
  ["yes man", "CONFIRM"],
  ["yeah mon", "CONFIRM"],
  ["no sah", "DENY"],
  ["nah man", "DENY"],
];

describe("Patois / Jamaican English intent detection", () => {
  it(`has at least 30 test phrases (currently ${PHRASES.length})`, () => {
    expect(PHRASES.length).toBeGreaterThanOrEqual(30);
  });

  it.each(PHRASES)("%s -> %s", (phrase, expected) => {
    expect(detectIntent(phrase).intent).toBe(expected);
  });

  it("keeps secondary intents (greeting + question)", () => {
    const r = detectIntent("Wah gwaan, unnu open today?");
    expect(r.matched).toEqual(expect.arrayContaining(["HOURS", "GREETING"]));
  });

  it("does not treat ordinary words as opt-out", () => {
    expect(isOptOut("which bus stop is closest?")).toBe(false);
    expect(isOptOut("Stop")).toBe(true);
  });

  it("recognises handoff keywords", () => {
    expect(isHumanHandoffKeyword("talk to a person")).toBe(true);
    expect(isHumanHandoffKeyword("how much fi a trim")).toBe(false);
  });

  it("flags urgent medical phrases but not ordinary 'emergency' requests", () => {
    expect(isUrgentMedical("my father having a heart attack")).toBe(true);
    expect(isUrgentMedical("mi car need emergency repair")).toBe(false);
  });
});
