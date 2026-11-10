import { describe, expect, it } from "vitest";
import { formatPhone, maskPhone, normalizePhone, toE164, toWhatsAppId } from "@/lib/phone";

describe("normalizePhone", () => {
  it.each([
    ["876-555-1234", "+18765551234"],
    ["(876) 555 1234", "+18765551234"],
    ["(876)555-1234", "+18765551234"],
    ["876.555.1234", "+18765551234"],
    ["8765551234", "+18765551234"],
    ["1-876-555-1234", "+18765551234"],
    ["1 (876) 555-1234", "+18765551234"],
    ["+1 876 555 1234", "+18765551234"],
    ["+18765551234", "+18765551234"],
    ["555-1234", "+18765551234"],
    ["5551234", "+18765551234"],
    ["555 1234", "+18765551234"],
    ["658-555-1234", "+16585551234"],
    ["+1 (658) 555-0199", "+16585550199"],
    ["011 1 876 555 1234", "+18765551234"],
    ["876-555-1234 ext 12", "+18765551234"],
  ])("normalises %s to %s", (input, expected) => {
    expect(toE164(input)).toBe(expected);
  });

  it("uses 658 as the default area code when asked", () => {
    expect(toE164("555-1234", "658")).toBe("+16585551234");
  });

  it("flags Jamaican numbers", () => {
    expect(normalizePhone("876-555-1234")?.isJamaican).toBe(true);
    expect(normalizePhone("658-555-1234")?.isJamaican).toBe(true);
    expect(normalizePhone("+1 305 555 0123")?.isJamaican).toBe(false);
  });

  it("keeps international (US/UK/Canada) callers", () => {
    expect(toE164("+1 (416) 555-0199")).toBe("+14165550199");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(toE164("0044 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("+44 20 7946 0958")?.isNanp).toBe(false);
  });

  it.each([["", null], ["abc", null], ["123", null], ["876-055-1234", null], ["1-076-555-1234", null], ["1876555123", null], ["call me", null]])(
    "rejects %s",
    (input, expected) => {
      expect(toE164(input)).toBe(expected);
    },
  );

  it("formats for display and WhatsApp", () => {
    expect(formatPhone("+18765551234")).toBe("(876) 555-1234");
    expect(toWhatsAppId("+18765551234")).toBe("18765551234");
    expect(maskPhone("+18765551234")).toBe("+1876***1234");
  });
});
