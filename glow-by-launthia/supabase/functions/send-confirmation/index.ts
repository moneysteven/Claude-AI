// Glow by Launthia: "send-confirmation" Edge Function (Supabase, Deno).
// When Launthia taps Confirm in her dashboard (or "Send confirmation email" on a booking she marked paid first),
// this sends the client ONE confirmation email.
// Only Launthia's signed-in session can call it. It loads the booking itself (it never trusts an email,
// date or time sent from the browser), sends through Resend, and records confirmation_sent_at so a
// booking is only ever confirmed by email once. It is a service message about the client's own booking:
// no marketing, no promotions.
//
// Secrets (Project Settings > Edge Functions > Secrets; never in the website):
//   RESEND_API_KEY, CONFIRM_FROM ("Glow by Launthia <bookings@[verified domain]>"), SITE_URL (optional)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase inside Edge Functions (server side only).

const OWNER_EMAIL = "launthiawatson@yahoo.com";
const REPLY_TO = "Launthiawatson@yahoo.com";
const PHONE = "1-876-277-8913";
const STUDIO = "Station Road, Little London, Westmoreland";
const HOURLY_LIMIT = 30;

const env = (k: string) => Deno.env.get(k) ?? "";
const SB_URL = env("SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = env("RESEND_API_KEY");
const CONFIRM_FROM = env("CONFIRM_FROM");
const SITE_URL = (env("SITE_URL") || "https://glow-by-launthia.com").replace(/\/+$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

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

async function log(status: string, detail: string, booking_id: string) {
  try {
    await db("alert_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ kind: "confirmation", status, detail: detail.slice(0, 500), booking_id }) });
  } catch (_) { /* a failed log never stops anything */ }
}

// the same hourly limit as the booking alerts: emails attempted in the last hour, all kinds
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
// appointment day and time are already Jamaica times: format them as they are
function when(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const f = (o: Intl.DateTimeFormatOptions) => dt.toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
  const [hh, mm] = time.split(":").map(Number);
  return {
    short: f({ weekday: "short", day: "numeric", month: "short" }),                                   // Sat 21 Nov
    long: `${f({ weekday: "long" })}, ${f({ day: "numeric", month: "long", year: "numeric" })}`,     // Saturday, 21 November 2026
    time: `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`,
  };
}

function confirmationEmail(b: any) {
  const w = when(b.appt_date, b.appt_time);
  const first = String(b.client_name || "").trim().split(/\s+/)[0] || "there";
  const policy = `${SITE_URL}/#cancellation`;
  const subject = `Your Glow by Launthia appointment is confirmed – ${b.service}, ${w.short} at ${w.time}`;
  const text = [
    `Hi ${first},`, "", "Your appointment is confirmed.", "",
    `Service: ${b.service}`, `Date: ${w.long}`, `Time: ${w.time} (Jamaica time)`, `Where: ${STUDIO}`, "",
    `Need to change or cancel? Please give at least 24 hours' notice (7 days for bridal). Reply to this email or call ${PHONE}.`,
    `See our Cancellation & Refund Policy: ${policy}`, "", "Thank you,", "Launthia – Glow by Launthia",
  ].join("\n");
  const row = (k: string, v: string) => `<tr><td style="padding:9px 0;color:#6E5646;font-size:12px;letter-spacing:.14em;text-transform:uppercase;vertical-align:top">${k}</td><td style="padding:9px 0 9px 16px;font-size:16px;text-align:right">${v}</td></tr>`;
  const html = `<div style="background:#F7F2EC;padding:24px 12px;font-family:'Hanken Grotesk',Helvetica,Arial,sans-serif;color:#3B2A20;line-height:1.55">
<div style="max-width:500px;margin:0 auto;background:#ffffff;border-radius:22px;padding:30px 26px;border:1px solid #E6D9C5">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#6E5646">Glow by Launthia</p>
<h1 style="margin:0 0 6px;font:italic 400 30px/1.2 'Bodoni Moda',Didot,Georgia,serif;color:#3B2A20">You're confirmed</h1>
<p style="margin:0 0 18px;font-size:16px">Hi ${esc(first)},<br>Your appointment is confirmed.</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #EFE6DA;border-bottom:1px solid #EFE6DA">
${row("Service", esc(b.service))}${row("Date", esc(w.long))}${row("Time", `${esc(w.time)} <span style="color:#6E5646;font-size:13px">(Jamaica time)</span>`)}${row("Where", esc(STUDIO))}
</table>
<p style="margin:18px 0 0;font-size:15px">Need to change or cancel? Please give at least 24 hours' notice (7 days for bridal). Reply to this email or call <a href="tel:+18762778913" style="color:#3B2A20">${PHONE}</a>.</p>
<p style="margin:12px 0 0;font-size:15px">See our <a href="${esc(policy)}" style="color:#3B2A20">Cancellation &amp; Refund Policy</a>.</p>
<p style="margin:22px 0 0;font-size:15px">Thank you,<br><span style="font:italic 400 19px/1.4 'Bodoni Moda',Didot,Georgia,serif">Launthia</span> – Glow by Launthia</p>
</div></div>`;
  return { subject, text, html };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  if (!SB_URL || !SERVICE_KEY || !RESEND_API_KEY || !CONFIRM_FROM) return reply(500, { sent: false, reason: "the function's secrets are not set yet" });
  if (!(await isOwner(req))) return reply(401, { error: "unauthorized" });

  let id = "";
  try { id = String((await req.json())?.booking_id || ""); } catch (_) { /* empty body */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reply(400, { sent: false, reason: "no booking" });

  try {
    const b = (await db(`bookings?id=eq.${id}&select=id,client_name,email,service,appt_date,appt_time,status,confirmation_sent_at`))?.[0];
    if (!b) return reply(404, { sent: false, reason: "booking not found" });
    if (b.status !== "Confirmed" && b.status !== "Paid") return reply(409, { sent: false, reason: "the booking isn't Confirmed" });
    if (!b.email) return reply(200, { sent: false, reason: "no client email on this booking" });
    if (b.confirmation_sent_at) return reply(200, { sent: false, already: true, at: b.confirmation_sent_at, reason: "already sent" });
    if ((await attemptsLastHour()) >= HOURLY_LIMIT) { await log("skipped", "hourly limit reached", id); return reply(200, { sent: false, reason: "hourly limit reached" }); }

    // claim it first, so two taps can never send two emails
    const at = new Date().toISOString();
    const claimed = await db(`bookings?id=eq.${id}&confirmation_sent_at=is.null&select=id`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ confirmation_sent_at: at }),
    });
    if (!claimed?.length) return reply(200, { sent: false, already: true, reason: "already sent" });

    const mail = confirmationEmail(b);
    const r = await sendEmail({ from: CONFIRM_FROM, to: [b.email], reply_to: REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text });
    if (!r.ok) {
      // let it go again, so the dashboard's "Resend" can try once more
      await db(`bookings?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ confirmation_sent_at: null }) }).catch(() => {});
      await log("failed", r.reason || "failed", id);
      return reply(200, { sent: false, reason: r.reason });
    }
    await log("sent", "confirmation to the client", id);
    return reply(200, { sent: true, at });
  } catch (e) {
    return reply(200, { sent: false, reason: String((e as Error)?.message || e) });
  }
});
