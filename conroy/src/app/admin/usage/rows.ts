import { listBusinessesWithUsage } from "@/lib/admin";

/** Shared by the usage page and its CSV export so both show the same numbers. */
export type UsageRow = Awaited<ReturnType<typeof listBusinessesWithUsage>>[number];

export function carrierMinutes(row: UsageRow): number {
  return Math.round(row.usage.telephonySeconds / 60);
}

export function overageCents(row: UsageRow): number {
  return row.bill.voiceOverageCents + row.bill.messageOverageCents;
}

export function usageTotals(rows: UsageRow[]) {
  const sum = (f: (r: UsageRow) => number) => rows.reduce((acc, r) => acc + f(r), 0);
  return {
    calls: sum((r) => r.usage.calls),
    voiceMinutes: sum((r) => r.usage.voiceMinutes),
    includedMinutes: sum((r) => r.bill.includedMinutes),
    carrierMinutes: sum(carrierMinutes),
    whatsappOutbound: sum((r) => r.usage.whatsappOutbound),
    includedMessages: sum((r) => r.bill.includedMessages),
    whatsappInbound: sum((r) => r.usage.whatsappInbound),
    webChatMessages: sum((r) => r.usage.webChatMessages),
    llmInputTokens: sum((r) => r.usage.llmInputTokens),
    llmOutputTokens: sum((r) => r.usage.llmOutputTokens),
    baseCents: sum((r) => r.bill.baseCents),
    overageCents: sum(overageCents),
    totalCents: sum((r) => r.bill.totalCents),
  };
}

export const CSV_HEADER = [
  "Business",
  "Slug",
  "Status",
  "Plan",
  "Calls",
  "Call minutes used",
  "Call minutes included",
  "Call minutes %",
  "Carrier minutes",
  "WhatsApp sent",
  "WhatsApp included",
  "WhatsApp sent %",
  "WhatsApp received",
  "Web chat messages",
  "LLM input tokens",
  "LLM output tokens",
  "Base price J$",
  "Overage J$",
  "Total J$",
];

const jmd = (cents: number) => (cents / 100).toFixed(2);

export function csvRow(row: UsageRow): (string | number)[] {
  return [
    row.business.name,
    row.business.slug,
    row.business.status,
    row.business.plan,
    row.usage.calls,
    row.usage.voiceMinutes,
    row.bill.includedMinutes,
    row.bill.minutesPercent,
    carrierMinutes(row),
    row.usage.whatsappOutbound,
    row.bill.includedMessages,
    row.bill.messagesPercent,
    row.usage.whatsappInbound,
    row.usage.webChatMessages,
    row.usage.llmInputTokens,
    row.usage.llmOutputTokens,
    jmd(row.bill.baseCents),
    jmd(overageCents(row)),
    jmd(row.bill.totalCents),
  ];
}

export function csvTotals(rows: UsageRow[]): (string | number)[] {
  const t = usageTotals(rows);
  return [
    "TOTAL",
    "",
    "",
    "",
    t.calls,
    t.voiceMinutes,
    t.includedMinutes,
    "",
    t.carrierMinutes,
    t.whatsappOutbound,
    t.includedMessages,
    "",
    t.whatsappInbound,
    t.webChatMessages,
    t.llmInputTokens,
    t.llmOutputTokens,
    jmd(t.baseCents),
    jmd(t.overageCents),
    jmd(t.totalCents),
  ];
}

/** RFC 4180 quoting; also neutralises spreadsheet formulas (=, +, -, @) in text cells. */
export function csvCell(value: string | number): string {
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
