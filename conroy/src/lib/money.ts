/**
 * Money formatting. Amounts are integer cents. J$ prices are shown without
 * cents when whole ("J$4,500"), with cents otherwise ("J$4,500.50").
 */

export function formatJmd(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return `J$${formatAmount(cents)}`;
}

export function formatUsd(cents: number): string {
  return `US$${formatAmount(cents, true)}`;
}

function formatAmount(cents: number, alwaysCents = false): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const wholeStr = whole.toLocaleString("en-US");
  const out = fraction === 0 && !alwaysCents ? wholeStr : `${wholeStr}.${String(fraction).padStart(2, "0")}`;
  return negative ? `-${out}` : out;
}

/** Convert J$ cents to US$ cents using an admin-set rate (J$ per US$1). */
export function jmdToUsdCents(jmdCents: number, jmdPerUsd: number): number {
  if (!(jmdPerUsd > 0)) throw new Error("Exchange rate must be positive");
  return Math.round(jmdCents / jmdPerUsd);
}

/**
 * Price label for a service: "J$4,500", "from J$15,000",
 * "J$4,500 (about US$28.85)", or "price on consultation" when no price is set.
 */
export function priceLabel(
  priceCents: number | null | undefined,
  opts: { isFrom?: boolean; usdRate?: number | null } = {},
): string {
  if (priceCents === null || priceCents === undefined) return "price on consultation";
  let label = `${opts.isFrom ? "from " : ""}${formatJmd(priceCents)}`;
  if (opts.usdRate && opts.usdRate > 0) label += ` (about ${formatUsd(jmdToUsdCents(priceCents, opts.usdRate))})`;
  return label;
}

/** Parse "4500", "4,500", "J$4,500.50", "$4500" into cents. */
export function parseJmdToCents(input: string | number): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? Math.round(input * 100) : null;
  const cleaned = input.replace(/j\$|jmd|\$|,|\s/gi, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}
