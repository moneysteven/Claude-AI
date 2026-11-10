import { describe, expect, it } from "vitest";
import { decrypt, encrypt, randomCode, signValue, verifySignedValue } from "@/lib/crypto";
import { formatJmd, jmdToUsdCents, parseJmdToCents, priceLabel } from "@/lib/money";

describe("money", () => {
  it("formats J$ like J$4,500", () => {
    expect(formatJmd(450000)).toBe("J$4,500");
    expect(formatJmd(1500000)).toBe("J$15,000");
    expect(formatJmd(450050)).toBe("J$4,500.50");
    expect(formatJmd(0)).toBe("J$0");
  });

  it("builds price labels with optional US$ for tourists", () => {
    expect(priceLabel(450000)).toBe("J$4,500");
    expect(priceLabel(1500000, { isFrom: true })).toBe("from J$15,000");
    expect(priceLabel(450000, { usdRate: 156 })).toBe("J$4,500 (about US$28.85)");
    expect(priceLabel(null)).toBe("price on consultation");
    expect(jmdToUsdCents(1560000, 156)).toBe(10000);
  });

  it("parses typed amounts", () => {
    expect(parseJmdToCents("4,500")).toBe(450000);
    expect(parseJmdToCents("J$4,500.50")).toBe(450050);
    expect(parseJmdToCents("$5000")).toBe(500000);
    expect(parseJmdToCents("five thousand")).toBeNull();
  });
});

describe("crypto", () => {
  it("round-trips AES-GCM encryption with a random IV", () => {
    const a = encrypt("Caller wants a silk press on Saturday");
    const b = encrypt("Caller wants a silk press on Saturday");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("Caller wants a silk press on Saturday");
  });

  it("detects tampering", () => {
    const token = encrypt("secret");
    const parts = token.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("signs widget tokens", () => {
    const signed = signValue("conv_123");
    expect(verifySignedValue(signed)).toBe("conv_123");
    expect(verifySignedValue(signed.replace("conv_123", "conv_999"))).toBeNull();
    expect(verifySignedValue("garbage")).toBeNull();
  });

  it("makes unambiguous reference codes", () => {
    const code = randomCode(6);
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
  });
});
