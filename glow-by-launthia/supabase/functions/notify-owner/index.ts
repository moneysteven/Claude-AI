// Glow by Launthia: "notify-owner" Edge Function (Supabase, Deno).
// Emails Launthia a short private alert when a client's booking is saved, or a test email from her dashboard.
// Email only, never SMS, and never to clients.
//
// It can be called in exactly two ways, anything else gets 401 and nothing is sent:
//   a) the Database Webhook on INSERT into public.bookings, with the header x-webhook-secret = ALERT_WEBHOOK_SECRET
//   b) Launthia's "Send test email" button, with her signed-in session (checked with Supabase Auth)
//
// Secrets (Project Settings > Edge Functions > Secrets; never in the website):
//   RESEND_API_KEY, ALERT_FROM ("Glow by Launthia <alerts@[verified domain]>"), ALERT_WEBHOOK_SECRET, SITE_URL (optional)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase inside Edge Functions (server side only).

const OWNER_EMAIL = "launthiawatson@yahoo.com";
const HOURLY_LIMIT = 30;

const env = (k: string) => Deno.env.get(k) ?? "";
const SB_URL = env("SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = env("RESEND_API_KEY");
const ALERT_FROM = env("ALERT_FROM");
const WEBHOOK_SECRET = env("ALERT_WEBHOOK_SECRET");
const SITE_URL = (env("SITE_URL") || "https://glow-by-launthia.com").replace(/\/+$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// the same number of steps whatever the guess, so the secret can't be worked out letter by letter
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function db(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`database ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function isOwner(req: Request): Promise<boolean> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token === SERVICE_KEY) return false;
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return false;
  const user = await res.json();
  return String(user?.email || "").toLowerCase() === OWNER_EMAIL;
}

async function log(kind: string, status: string, detail: string, booking_id: string | null = null) {
  try {
    await db("alert_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ kind, status, detail: detail.slice(0, 500), booking_id }) });
  } catch (_) { /* a failed log never stops anything */ }
}

// emails actually attempted in the last hour (all kinds), so spam bookings can't run up usage
async function attemptsLastHour(): Promise<number> {
  const since = encodeURIComponent(new Date(Date.now() - 3600_000).toISOString());
  const rows = await db(`alert_log?select=id&status=in.(sent,failed)&created_at=gte.${since}&limit=${HOURLY_LIMIT}`);
  return rows.length;
}

// one try plus at most 2 retries (after 1s, then 3s); never more
async function sendEmail(msg: Record<string, unknown>): Promise<{ ok: boolean; reason?: string }> {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, attempt === 1 ? 1000 : 3000));
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });
      if (res.ok) return { ok: true };
      last = `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break; // a wrong address or key won't fix itself
    } catch (e) {
      last = `network: ${(e as Error)?.message || e}`;
    }
  }
  return { ok: false, reason: last };
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
function telOf(p: string) {
  const d = String(p || "").replace(/\D/g, "");
  if (/^\s*\+/.test(p)) return "+" + d;
  if (d.length === 7) return "+1876" + d;
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  return d;
}
// appointment day and time are already Jamaica times: format them as they are
function apptLabel(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const [hh, mm] = time.split(":").map(Number);
  return { day, time: `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}` };
}
const money = (n: number | null) => (typeof n === "number" ? `J$${n.toLocaleString("en-US")}` : "Not set yet");

function card(title: string, rows: [string, string][], button?: [string, string]) {
  const tr = rows.map(([k, v]) => `<tr><td style="padding:8px 0;color:#6E5646;font-size:13px;letter-spacing:.08em;text-transform:uppercase;vertical-align:top">${k}</td><td style="padding:8px 0 8px 16px;font-size:16px;text-align:right">${v}</td></tr>`).join("");
  return `<div style="background:#F7F2EC;padding:24px 12px;font-family:'Hanken Grotesk',Helvetica,Arial,sans-serif;color:#3B2A20">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:22px;padding:28px 24px;border:1px solid #E6D9C5">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#6E5646">Glow by Launthia</p>
<h1 style="margin:0 0 18px;font:italic 400 28px/1.2 'Bodoni Moda',Didot,Georgia,serif;color:#3B2A20">${title}</h1>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #EFE6DA">${tr}</table>
${button ? `<p style="margin:24px 0 0"><a href="${button[1]}" style="display:inline-block;padding:14px 26px;border-radius:999px;background:#3B2A20;color:#F7F2EC;text-decoration:none;font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase">${button[0]}</a></p>` : ""}
</div></div>`;
}

async function bookingAlert(bookingId: string) {
  const settings = (await db("owner_settings?id=eq.1&select=email_alerts,alert_email"))?.[0];
  if (!settings || !settings.email_alerts) { await log("booking", "skipped", "alerts are off", bookingId); return { sent: false, reason: "alerts are off" }; }
  const already = await db(`alert_log?select=id&kind=eq.booking&status=eq.sent&booking_id=eq.${bookingId}&limit=1`);
  if (already.length) return { sent: false, reason: "already sent" };
  if ((await attemptsLastHour()) >= HOURLY_LIMIT) { await log("booking", "skipped", "hourly limit reached", bookingId); return { sent: false, reason: "hourly limit reached" }; }
  const b = (await db(`bookings?id=eq.${bookingId}&select=client_name,phone,service,appt_date,appt_time,price_jmd`))?.[0];
  if (!b) { await log("booking", "failed", "booking not found", bookingId); return { sent: false, reason: "booking not found" }; }
  const when = apptLabel(b.appt_date, b.appt_time);
  const subject = `New booking – ${b.service} – ${when.day}, ${when.time}`;
  const text = `New booking\n\nService: ${b.service}\nDay and time: ${when.day}, ${when.time} (Jamaica time)\nClient: ${b.client_name}\nPhone: ${b.phone}\nPrice: ${money(b.price_jmd)}\n\nOpen your dashboard: ${SITE_URL}/owner`;
  const html = card("New booking", [
    ["Service", esc(b.service)],
    ["Day and time", `${esc(when.day)}, ${esc(when.time)}<br><span style="font-size:12px;color:#6E5646">Jamaica time</span>`],
    ["Client", esc(b.client_name)],
    ["Phone", `<a href="tel:${esc(telOf(b.phone))}" style="color:#3B2A20">${esc(b.phone)}</a>`],
    ["Price", esc(money(b.price_jmd))],
  ], ["Open your dashboard", `${SITE_URL}/owner`]);
  const r = await sendEmail({ from: ALERT_FROM, to: [settings.alert_email], subject, html, text });
  await log("booking", r.ok ? "sent" : "failed", r.ok ? `to ${settings.alert_email}` : r.reason || "failed", bookingId);
  return r.ok ? { sent: true } : { sent: false, reason: r.reason };
}

async function testEmail() {
  const settings = (await db("owner_settings?id=eq.1&select=alert_email"))?.[0];
  if (!settings) return { sent: false, reason: "settings not found" };
  if ((await attemptsLastHour()) >= HOURLY_LIMIT) { await log("test", "skipped", "hourly limit reached"); return { sent: false, reason: "hourly limit reached" }; }
  const subject = "Test – Glow by Launthia booking alerts are working";
  const text = "This is a test. When someone books on your website, you'll get an email like this with the booking details.";
  const html = card("Alerts are working", [["Test", esc(text)]]);
  const r = await sendEmail({ from: ALERT_FROM, to: [settings.alert_email], subject, html, text });
  await log("test", r.ok ? "sent" : "failed", r.ok ? `to ${settings.alert_email}` : r.reason || "failed");
  return r.ok ? { sent: true, to: settings.alert_email } : { sent: false, reason: r.reason };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  if (!SB_URL || !SERVICE_KEY || !RESEND_API_KEY || !ALERT_FROM) return reply(500, { sent: false, reason: "the function's secrets are not set yet" });

  // a) the Database Webhook
  if (sameSecret(req.headers.get("x-webhook-secret") || "", WEBHOOK_SECRET)) {
    let payload: any = null;
    try { payload = await req.json(); } catch (_) { /* fall through */ }
    const id = payload?.record?.id;
    if (payload?.type !== "INSERT" || payload?.table !== "bookings" || !/^[0-9a-f-]{36}$/i.test(String(id || ""))) return reply(400, { error: "not a new booking" });
    // only booking requests sent from the website's form are alerted here. A slot held during online
    // checkout ("Held") is not a booking yet: it is alerted once its payment is verified.
    if (String(payload?.record?.status || "Requested") !== "Requested") return reply(200, { sent: false, reason: "not a booking request" });
    const work = bookingAlert(id).catch(async (e) => { await log("booking", "failed", String(e?.message || e), id); return { sent: false }; });
    // answer straight away; the email goes out in the background, so a booking never waits for it
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) { rt.waitUntil(work); return reply(202, { accepted: true }); }
    return reply(200, await work);
  }

  // b) Launthia's "Send test email" button
  if (await isOwner(req)) {
    let payload: any = {};
    try { payload = await req.json(); } catch (_) { /* empty body */ }
    if (!payload?.test) return reply(400, { error: "nothing to do" });
    try { return reply(200, await testEmail()); } catch (e) { return reply(200, { sent: false, reason: String((e as Error)?.message || e) }); }
  }

  return reply(401, { error: "unauthorized" });
});
