// Glow by Launthia – booking emails (server side only), sent with Resend.
//
// What is sent, and when (queued by the database in the same step as the payment – see platform.sql):
//   to the client   booking_confirmation + payment_receipt   once a payment is verified (never before)
//                   booking_cancelled / booking_rescheduled   only when Launthia chooses to send them
//   to Launthia     owner_new_booking                         a paid booking (verified by PayPal / the bank)
//                   owner_bank_check                          a client says they sent a bank transfer to her account: check it
//                   owner_zelle_check / owner_cashapp_check   a client says they sent Zelle / Cash App: check your account
//                   owner_paypal_check                        a client says they paid her on PayPal's page: check your PayPal
//                   owner_attention                           a payment needs her (paid twice, time taken, wrong amount)
// Payments made in TEST MODE (PayPal sandbox) are marked "[TEST]" in every email.
//
// Resend: POST https://api.resend.com/emails with from, to, subject, reply_to, html, text, and the
// Idempotency-Key header ("ensure emails are only sent once") – checked against Resend's official OpenAPI
// specification (github.com/resend/resend-openapi, commit 5013f33, November 2026). Each email's dedupe key is its
// Idempotency-Key, so a retry can never deliver a second copy.
//
// Secrets (Supabase > Edge Functions > Secrets; never in the website): RESEND_API_KEY, CONFIRM_FROM
// ("Glow by Launthia <bookings@[verified domain]>", for clients), ALERT_FROM (for Launthia's alerts), SITE_URL (for
// the policy and dashboard links; left out if not set), BUSINESS_LEGAL_NAME (optional, shown on receipts).

import { rpc } from "./db.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const RESEND_API_KEY = env("RESEND_API_KEY");
const CONFIRM_FROM = env("CONFIRM_FROM");
const ALERT_FROM = env("ALERT_FROM");
const LEGAL_NAME = env("BUSINESS_LEGAL_NAME").trim();
const SITE = (() => {
  try {
    const u = new URL(env("SITE_URL"));
    return u.protocol === "https:" ? u.origin : "";
  } catch (_) { return ""; }
})();

// the business details exactly as they appear on the website
export const BUSINESS = {
  name: "Glow by Launthia",
  artist: "Launthia Watson",
  studio: "Station Road, Little London, Westmoreland, Jamaica",
  phone: "1-876-277-8913",
  tel: "+18762778913",
  email: "Launthiawatson@yahoo.com",
};
const TZ = "America/Jamaica";

export function emailConfigured(): boolean {
  return RESEND_API_KEY.length > 0 && CONFIRM_FROM.length > 0 && ALERT_FROM.length > 0;
}

// ---- formatting --------------------------------------------------------------------------------------------
export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const clean = (s: unknown) => String(s ?? "").replace(/[\r\n]+/g, " ").trim(); // no line breaks in subjects
// an internal reference given when Launthia confirms a payment that was sent without one: never shown
const shownRef = (r: unknown) => (/^checked-by-owner-/.test(String(r ?? "")) ? "" : r);
function when(iso: unknown) {
  const d = new Date(String(iso || ""));
  if (isNaN(d.getTime())) return { long: "", short: "", time: "" };
  // some systems put special narrow spaces in dates and times, which older email apps show as "?": use plain spaces
  const plain = (x: string) => x.replace(/[\u202f\u00a0\u2009]/g, " ");
  return {
    long: plain(d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ })),
    short: plain(d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ })),
    time: plain(d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })),
  };
}
function length(startIso: unknown, endIso: unknown): string {
  const m = Math.round((new Date(String(endIso)).getTime() - new Date(String(startIso)).getTime()) / 60000);
  if (!(m > 0)) return "";
  const h = Math.floor(m / 60), r = m % 60;
  return [h ? `${h} hour${h > 1 ? "s" : ""}` : "", r ? `${r} minutes` : ""].filter(Boolean).join(" ");
}
export function money(amount: unknown, currency: unknown): string {
  const n = Number(amount);
  if (!isFinite(n)) return "";
  const c = String(currency || "JMD");
  const whole = c === "JMD" && Number.isInteger(n);
  return `${c} $${n.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
const METHOD: Record<string, string> = { card: "Card", bank: "Bank transfer", paypal: "PayPal", zelle: "Zelle", cashapp: "Cash App", cash: "Cash (paid in person)" };
function telOf(p: string) {
  const d = String(p || "").replace(/\D/g, "");
  if (/^\s*\+/.test(p)) return "+" + d;
  if (d.length === 7) return "+1876" + d;
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  return d;
}
const firstName = (n: unknown) => clean(n).split(/\s+/)[0] || "there";
const link = (href: string, text: string) => `<a href="${esc(href)}" style="color:#3B2A20${href.startsWith("tel:") ? ";white-space:nowrap" : ""}">${esc(text)}</a>`;
const keep = (html: string) => `<span style="white-space:nowrap">${html}</span>`; // keeps "10:00 AM" or a number on one line

// ---- layout (the same look as the existing alerts) ------------------------------------------------------------
type Row = [string, string, string?]; // label (plain text), value (HTML, already escaped), optional plain-text value
function page(o: { title: string; intro?: string; rows: Row[]; after?: string[]; button?: [string, string]; test: boolean; footer: boolean }): string {
  const tr = o.rows.filter(([, v]) => v !== "").map(([k, v]) =>
    `<tr><td style="padding:9px 0;color:#6E5646;font-size:12px;letter-spacing:.08em;text-transform:uppercase;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:9px 0 9px 16px;font-size:15px;text-align:right;vertical-align:top">${v}</td></tr>`).join("");
  const banner = o.test
    ? `<p style="margin:0 0 16px;padding:10px 14px;border-radius:12px;background:#FFF3CD;color:#5C4400;font-size:13px;font-weight:600">TEST MODE – no real money was taken. This is a test booking.</p>`
    : "";
  const after = (o.after || []).map((p) => `<p style="margin:16px 0 0;font-size:14px;line-height:1.55">${p}</p>`).join("");
  const button = o.button
    ? `<p style="margin:24px 0 0"><a href="${esc(o.button[1])}" style="display:inline-block;padding:14px 26px;border-radius:999px;background:#3B2A20;color:#F7F2EC;text-decoration:none;font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase">${esc(o.button[0])}</a></p>`
    : "";
  const footer = o.footer
    ? `<p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#6E5646;text-align:center">${esc(BUSINESS.name)} · ${esc(BUSINESS.artist)}<br>${esc(BUSINESS.studio)}<br>` +
      `<a href="tel:${BUSINESS.tel}" style="color:#6E5646">${esc(BUSINESS.phone)}</a> · <a href="mailto:${esc(BUSINESS.email)}" style="color:#6E5646">${esc(BUSINESS.email)}</a></p>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)}</title></head>` +
    `<body style="margin:0;padding:0;background:#F7F2EC"><div style="background:#F7F2EC;padding:24px 12px;font-family:'Hanken Grotesk',Helvetica,Arial,sans-serif;color:#3B2A20">` +
    `<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:22px;padding:28px 24px;border:1px solid #E6D9C5">` +
    `<p style="margin:0 0 6px;font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#6E5646">${esc(BUSINESS.name)}</p>` +
    `<h1 style="margin:0 0 16px;font:italic 400 27px/1.2 'Bodoni Moda',Didot,Georgia,serif;color:#3B2A20">${esc(o.title)}</h1>${banner}` +
    (o.intro ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.55">${o.intro}</p>` : "") +
    `<table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #EFE6DA">${tr}</table>${after}${button}</div>${footer}</div></body></html>`;
}
// HTML → plain text; web links keep their address in brackets so text-only readers can still open them
const strip = (html: string) => html.replace(/<a href="(https:[^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_m, href, label) => `${label} (${href.replace(/&amp;/g, "&")})`)
  .replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
function textOf(o: { title: string; intro?: string; rows: Row[]; after?: string[]; button?: [string, string]; test: boolean; footer: boolean }): string {
  const lines = [o.test ? "TEST MODE – no real money was taken. This is a test booking.\n" : "", o.title, "", o.intro ? strip(o.intro) + "\n" : ""];
  for (const [k, v, t] of o.rows) if (v !== "") lines.push(`${k}: ${t ?? strip(v)}`);
  for (const p of o.after || []) lines.push("", strip(p));
  if (o.button) lines.push("", `${o.button[0]}: ${o.button[1]}`);
  if (o.footer) lines.push("", `${BUSINESS.name} · ${BUSINESS.artist}`, BUSINESS.studio, `${BUSINESS.phone} · ${BUSINESS.email}`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ---- the emails ---------------------------------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
export type QueuedEmail = { id: number; kind: string; audience: string; to_email: string; dedupe_key: string; booking: any; payment: any };
export type Message = { from: string; to: string[]; subject: string; html: string; text: string; reply_to?: string };

export function buildEmail(e: QueuedEmail): Message {
  const b = e.booking;
  if (!b) throw new Error("booking not found");
  if (!e.to_email) throw new Error("no address");
  const p = e.payment || null;
  const test = !!p?.is_test;
  const T = test ? "[TEST] " : "";
  const w = when(b.starts_at);
  const svc = clean(b.service);
  const ref = clean(b.reference);
  const len = length(b.starts_at, b.ends_at);
  const policy = SITE ? ` Please see our ${link(`${SITE}/#cancellation`, "Cancellation & Refund Policy")}.` : "";
  const contact = `text or call ${link(`tel:${BUSINESS.tel}`, BUSINESS.phone)}, or reply to this email`;
  const paidLine = p ? esc(money(p.amount, p.currency)) + (p.currency !== "JMD" && b.amount_jmd ? ` <span style="color:#6E5646;font-size:13px">(${esc(money(b.amount_jmd, "JMD"))})</span>` : "") : "";
  const dashboard: [string, string] | undefined = SITE ? ["Open your dashboard", `${SITE}/owner`] : undefined;
  const whenRow = w.long ? `${keep(esc(w.short))}, ${keep(esc(w.time))}<br><span style="font-size:12px;color:#6E5646">Jamaica time</span>` : "";
  const whenText = w.long ? `${w.short}, ${w.time} (Jamaica time)` : "";
  const clientRows = (): Row[] => [["Client", esc(clean(b.client_name))], ["Phone", b.phone ? link(`tel:${telOf(b.phone)}`, b.phone) : ""]];
  // pay in person: booked now, paid in cash at the appointment (until Launthia marks it received)
  const inPerson = b.payment_method === "cash" && b.payment_status !== "paid";
  const dueLine = b.amount_jmd ? `${esc(money(b.amount_jmd, "JMD"))} in cash` : "In cash";
  // deno-lint-ignore no-explicit-any
  let o: any;
  let subject = "";

  switch (e.kind) {
    case "booking_confirmation":
      if (!ref || !w.long) throw new Error("booking not confirmed");
      subject = `${T}Booking confirmed – ${svc}, ${w.short} at ${w.time} (${ref})`;
      o = { title: "Your booking is confirmed", intro: inPerson
          ? `Hi ${esc(firstName(b.client_name))}, thank you for booking with ${esc(BUSINESS.name)}. Your appointment is booked. Please pay ${dueLine} at your appointment.`
          : `Hi ${esc(firstName(b.client_name))}, thank you for booking with ${esc(BUSINESS.name)}. Your appointment is confirmed and paid in full.`,
        rows: [["Booking reference", `<strong>${esc(ref)}</strong>`], ["Service", esc(svc)], ["Date", esc(w.long)], ["Time", `${keep(esc(w.time))} <span style="font-size:12px;color:#6E5646">(Jamaica time)</span>`],
               ["Length", esc(len)], inPerson ? ["To pay at your appointment", dueLine] : ["Paid", paidLine], ["Studio", esc(BUSINESS.studio)]],
        after: [inPerson ? "You’ll get a receipt when you pay." : "Your payment receipt comes in a separate email.", `To change or cancel, ${contact}.${policy}`] };
      break;
    case "payment_receipt": {
      if (!p || !ref) throw new Error("no payment");
      const pw = when(p.paid_at);
      const status = p.status === "refunded" ? "Refunded" : p.status === "partly refunded" ? "Partly refunded" : p.status === "succeeded" ? "Paid" : "";
      if (!status) throw new Error("payment not completed");
      subject = `${T}Receipt for your booking ${ref} – ${BUSINESS.name}`;
      o = { title: "Payment receipt", intro: `Hi ${esc(firstName(b.client_name))}, thank you for your payment. Please keep this receipt for your records.`,
        rows: [["Booking reference", `<strong>${esc(ref)}</strong>`], ["Date paid", esc(pw.long)], ["Paid with", esc(METHOD[p.method] || p.method)],
               ["Amount paid", esc(money(p.amount, p.currency))], ["Booking price", p.currency !== "JMD" ? esc(money(p.amount_jmd ?? b.amount_jmd, "JMD")) : ""],
               ["Status", esc(status)], ["Transaction ID", esc(clean(p.gateway_txn_id || shownRef(p.provider_ref)))],
               ["Service", esc(svc)], ["Appointment", w.long ? `${esc(w.long)}, ${keep(esc(w.time))}` : ""]],
        after: [`Paid to ${esc(LEGAL_NAME || BUSINESS.name)}${LEGAL_NAME ? "" : ` (${esc(BUSINESS.artist)})`}, ${esc(BUSINESS.studio)}.`, `Questions about this payment? ${contact.charAt(0).toUpperCase() + contact.slice(1)}.${policy}`] };
      break;
    }
    case "booking_cancelled":
      subject = `${T}Your booking has been cancelled – ${svc}${w.short ? `, ${w.short}` : ""}`;
      o = { title: "Your booking has been cancelled",
        intro: `Hi ${esc(firstName(b.client_name))}, your ${esc(svc)} appointment${w.long ? ` on ${esc(w.long)} at ${esc(w.time)}` : ""} has been cancelled.`,
        rows: [["Booking reference", ref ? `<strong>${esc(ref)}</strong>` : ""], ["Service", esc(svc)], ["Date", esc(w.long)], ["Time", esc(w.time)]],
        after: [`If you have any questions, including about your payment, ${contact}.${policy}`] };
      break;
    case "booking_rescheduled":
      if (!w.long) throw new Error("no new time");
      subject = `${T}Your booking has a new time – ${svc}, ${w.short} at ${w.time}`;
      o = { title: "Your booking has a new time", intro: `Hi ${esc(firstName(b.client_name))}, your appointment has been moved. Here are the new details.`,
        rows: [["Booking reference", ref ? `<strong>${esc(ref)}</strong>` : ""], ["Service", esc(svc)], ["New date", esc(w.long)],
               ["New time", `${keep(esc(w.time))} <span style="font-size:12px;color:#6E5646">(Jamaica time)</span>`], ["Length", esc(len)], ["Studio", esc(BUSINESS.studio)]],
        after: [`If this time doesn't suit you, ${contact}.${policy}`] };
      break;
    case "owner_new_booking":
      subject = inPerson ? `${T}New booking – pay in person (cash) – ${svc} – ${w.short}, ${w.time}` : `${T}New paid booking – ${svc} – ${w.short}, ${w.time}`;
      o = { title: inPerson ? "New booking – paying in person" : "New paid booking",
        intro: inPerson ? "This client will pay you in cash at the appointment. When they pay, tap Cash received on the booking in your dashboard." : undefined,
        rows: [["Service", esc(svc)], ["Day and time", whenRow, whenText], ...clientRows(),
               inPerson ? ["To pay in person", dueLine] : ["Paid", p ? `${paidLine} · ${esc(METHOD[p.method] || p.method)}` : ""], ["Reference", esc(ref)]],
        button: dashboard };
      break;
    case "owner_bank_check": {
      if (!p) throw new Error("no payment");
      const notes = String(p.notes || "");
      const sender = notes.match(/Sent from: ([^·]+)/)?.[1]?.trim() || "";
      const to = notes.match(/Sent to: ([^·]+)/)?.[1]?.trim() || "";
      subject = `${T}Bank transfer sent to you – please check – ${svc} – ${w.short}, ${w.time}`;
      o = { title: "A client sent you a bank transfer",
        intro: `A client says they have sent ${esc(money(p.amount, p.currency))} by bank transfer${to ? ` to ${esc(to)}` : ""} to pay for their booking. Please check that the money has arrived in that account, then confirm it in your dashboard. Don't confirm from a screenshot or a message alone.`,
        rows: [["Booking reference", esc(ref)], ["Amount to look for", esc(money(p.amount, p.currency))], ["Sent to", esc(to)], ["Transaction reference", esc(clean(p.provider_ref))],
               ["Receipt", p.has_receipt ? "Added – open it on the booking in your dashboard" : "None"], ["Sent from", esc(sender)],
               ...clientRows(), ["Service", esc(svc)], ["Day and time", whenRow, whenText]],
        after: ["The time stays booked for this client until you confirm or reject the payment."], button: dashboard };
      break;
    }
    case "owner_zelle_check":
    case "owner_paypal_check":
    case "owner_cashapp_check": {
      if (!p) throw new Error("no payment");
      const zelle = e.kind === "owner_zelle_check", pp = e.kind === "owner_paypal_check";
      const name = zelle ? "Zelle" : pp ? "PayPal" : "Cash App";
      const sender = String(p.notes || "").match(/Sent from: ([^·]+)/)?.[1]?.trim() || "";
      subject = `${T}${name} payment to check – ${svc} – ${w.short}, ${w.time}`;
      o = { title: zelle ? "Check your bank for a Zelle payment" : pp ? "Check your PayPal for a payment" : "Check your Cash App for a payment",
        intro: `A client says they have sent this ${name} payment. Please check that the money is in your ${zelle ? "account" : pp ? "PayPal" : "Cash App"}, then confirm it in your dashboard. Don't confirm from a screenshot or a message alone.`,
        rows: [["Amount to look for", esc(money(p.amount, p.currency))], [zelle ? "Zelle confirmation" : pp ? "PayPal transaction ID" : "Cash App reference", esc(clean(p.provider_ref) || "–")], ["Sent from", esc(sender)],
               ...clientRows(), ["Service", esc(svc)], ["Day and time", whenRow, whenText]],
        after: ["The time stays booked for this client until you confirm or reject the payment."], button: dashboard };
      break;
    }
    case "owner_attention": {
      const why = String(p?.failure_reason || "");
      const what = why.startsWith("a second payment") ? "This client paid twice for the same booking. Please refund the second payment."
        : why.startsWith("paid after the hold ran out") ? "This client's payment went through after their time had been taken by someone else. Please contact them to choose a new time or to refund them."
        : why.startsWith("amount mismatch") ? `The amount the payment service reported doesn't match the booking price, so the booking was not confirmed. Please check this payment. (${esc(why)})`
        : p?.status === "awaiting review" ? "A pending payment came in for a time that is now taken. Please check this booking."
        : why ? esc(why) : "Please check this booking in your dashboard.";
      subject = `${T}Booking needs your attention – ${svc} – ${w.short}, ${w.time}`;
      o = { title: "A booking needs your attention", intro: what,
        rows: [...clientRows(), ["Service", esc(svc)], ["Day and time", whenRow, whenText],
               ["Payment", p ? `${esc(money(p.amount, p.currency))} · ${esc(METHOD[p.method] || p.method)}` : ""], ["Transaction ID", esc(clean(p?.gateway_txn_id || shownRef(p?.provider_ref)))]],
        button: dashboard };
      break;
    }
    default:
      throw new Error(`no email for ${e.kind}`);
  }
  const forClient = e.audience === "client";
  const opts = { ...o, test, footer: forClient };
  const msg: Message = { from: forClient ? CONFIRM_FROM : ALERT_FROM, to: [e.to_email], subject: clean(subject), html: page(opts), text: textOf(opts) };
  if (forClient) msg.reply_to = BUSINESS.email;
  return msg;
}

// ---- sending -------------------------------------------------------------------------------------------------------
async function sendResend(msg: Message, key: string): Promise<{ ok: boolean; id?: string; reason?: string; final?: boolean }> {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, attempt === 1 ? 1000 : 3000));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key.slice(0, 256) },
        body: JSON.stringify(msg),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (res.ok) {
        let id = "";
        try { id = String(JSON.parse(text)?.id || ""); } catch (_) { id = ""; }
        return { ok: true, id };
      }
      last = `Resend ${res.status}: ${text.slice(0, 200)}`;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return { ok: false, reason: last, final: true }; // won't fix itself
    } catch (e) {
      last = `network: ${(e as Error)?.message || e}`;
    } finally { clearTimeout(t); }
  }
  return { ok: false, reason: last };
}

// sends what is queued (for one booking, some ids, or anything waiting). Safe to run at the same time from
// several places: the database hands each email to one sender only.
export async function processEmails(opts: { booking?: string | null; ids?: number[] | null; limit?: number } = {}) {
  const out = { sent: 0, failed: 0, retry: 0, skipped: "" };
  if (!emailConfigured()) { out.skipped = "email not set up"; return out; } // stays queued until it is
  const rows: QueuedEmail[] = (await rpc("claim_emails", { p_booking: opts.booking ?? null, p_ids: opts.ids ?? null, p_limit: opts.limit ?? 10 })) || [];
  for (const row of rows) {
    let msg: Message;
    try { msg = buildEmail(row); } catch (e) {
      await rpc("finish_email", { p_id: row.id, p_ok: false, p_detail: `could not write it: ${(e as Error)?.message || e}`, p_final: true });
      out.failed++;
      continue;
    }
    const r = await sendResend(msg, `glow-${row.dedupe_key}`);
    await rpc("finish_email", { p_id: row.id, p_ok: r.ok, p_provider_id: r.id || null, p_detail: r.ok ? `to ${row.to_email}` : r.reason || "failed", p_final: !!r.final });
    if (r.ok) out.sent++; else if (r.final) out.failed++; else out.retry++;
  }
  return out;
}

// after a payment step: send that booking's queued emails without making the client wait
export async function emailsAfter(booking: string | null | undefined): Promise<void> {
  if (!booking) return;
  const work = processEmails({ booking }).then(() => undefined, (e) => console.error("emails", String((e as Error)?.message || e)));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) { rt.waitUntil(work); return; }
  await work;
}
