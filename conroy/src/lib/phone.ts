/**
 * Phone number normalisation for Jamaica (+1 876 / +1 658) and international
 * callers. Everything is stored as E.164 ("+18765551234").
 *
 * Accepted inputs (default area code 876):
 *   876-555-1234, (876) 555 1234, 876.555.1234, 8765551234, 1-876-555-1234,
 *   +1 876 555 1234, 555-1234 / 5551234 (7 digits -> default area code),
 *   0118765551234 / 0018765551234 (international dialling prefixes),
 *   +44 20 7946 0958 (other countries pass through as E.164).
 */

export const JAMAICA_AREA_CODES = ["876", "658"] as const;
export type JamaicaAreaCode = (typeof JAMAICA_AREA_CODES)[number];

export interface NormalisedPhone {
  e164: string;
  isJamaican: boolean;
  isNanp: boolean;
  /** "(876) 555-1234" for NANP numbers, E.164 otherwise. */
  display: string;
}

function isValidNanp(tenDigits: string): boolean {
  // NXX-NXX-XXXX: area code and exchange cannot start with 0 or 1.
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(tenDigits);
}

export function normalizePhone(
  input: string | null | undefined,
  defaultAreaCode: JamaicaAreaCode = "876",
): NormalisedPhone | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (raw === "") return null;
  // Reject letters (vanity numbers / garbage) except an "ext" suffix we drop.
  const withoutExt = raw.replace(/\s*(ext\.?|x)\s*\d+$/i, "");
  if (/[a-z]/i.test(withoutExt)) return null;

  const hasPlus = withoutExt.startsWith("+");
  let digits = withoutExt.replace(/\D/g, "");
  if (digits.length === 0) return null;

  if (!hasPlus) {
    // International dialling prefixes: 011 (from NANP) or 00 (most other countries).
    if (digits.startsWith("011")) digits = digits.slice(3);
    else if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.length === 7) digits = `1${defaultAreaCode}${digits}`;
    else if (digits.length === 10) digits = `1${digits}`;
    // 11 digits starting with 1 are already NANP with country code.
  }

  if (digits.startsWith("1")) {
    if (digits.length !== 11) return null;
    const national = digits.slice(1);
    if (!isValidNanp(national)) return null;
    const area = national.slice(0, 3);
    return {
      e164: `+${digits}`,
      isJamaican: (JAMAICA_AREA_CODES as readonly string[]).includes(area),
      isNanp: true,
      display: `(${area}) ${national.slice(3, 6)}-${national.slice(6)}`,
    };
  }

  // Non-NANP international number: E.164 allows up to 15 digits.
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return { e164: `+${digits}`, isJamaican: false, isNanp: false, display: `+${digits}` };
}

/** Convenience: E.164 string or null. */
export function toE164(input: string | null | undefined, defaultAreaCode: JamaicaAreaCode = "876"): string | null {
  return normalizePhone(input, defaultAreaCode)?.e164 ?? null;
}

/** "(876) 555-1234" for display; falls back to the input. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  return normalizePhone(e164)?.display ?? e164;
}

/** WhatsApp APIs want the number without "+". */
export function toWhatsAppId(e164: string): string {
  return e164.replace(/^\+/, "");
}

/** Mask for logs: +1876***1234 */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  if (e164.length <= 8) return "***";
  return `${e164.slice(0, 5)}***${e164.slice(-4)}`;
}
