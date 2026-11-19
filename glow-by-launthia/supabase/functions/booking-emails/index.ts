// Glow by Launthia: "booking-emails" Edge Function (Supabase, Deno) – sends the emails waiting in the queue
// (public.email_log): booking confirmations and receipts to clients, and alerts to Launthia. See _shared/emails.ts.
//
// It can be called in exactly two ways; anything else gets 401 and nothing is sent:
//   a) the Database Webhook on INSERT into public.email_log, with the header x-webhook-secret = ALERT_WEBHOOK_SECRET
//      (the same secret as the booking-alert webhook): sends that email, then anything else still waiting;
//   b) Launthia's dashboard ("send now"), with her signed-in session: sends whatever is waiting.
// What can be sent is decided only by the database (emails are queued by the payment steps, or by Launthia's own
// choice); this function can't write an email of its own.
//
// Secrets: RESEND_API_KEY, CONFIRM_FROM, ALERT_FROM, ALERT_WEBHOOK_SECRET, SITE_URL (optional),
// BUSINESS_LEGAL_NAME (optional). Deploy: supabase functions deploy booking-emails --no-verify-jwt

import { rpc, SB_URL, SERVICE_KEY } from "../_shared/db.ts";
import { processEmails } from "../_shared/emails.ts";

const WEBHOOK_SECRET = Deno.env.get("ALERT_WEBHOOK_SECRET") ?? "";
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

async function isAdmin(req: Request): Promise<boolean> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token === SERVICE_KEY) return false;
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return false;
  const user = await res.json().catch(() => null);
  const email = String(user?.email || "").toLowerCase();
  return email !== "" && (await rpc<boolean>("is_admin_email", { p_email: email })) === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST only" });

  // a) the Database Webhook
  if (sameSecret(req.headers.get("x-webhook-secret") || "", WEBHOOK_SECRET)) {
    // deno-lint-ignore no-explicit-any
    let payload: any = null;
    try { payload = await req.json(); } catch (_) { /* fall through */ }
    const id = Number(payload?.record?.id);
    if (payload?.type !== "INSERT" || payload?.table !== "email_log" || !Number.isSafeInteger(id) || id <= 0) return reply(400, { error: "not a new email" });
    const work = (async () => {
      const a = await processEmails({ ids: [id], limit: 1 });
      const b = await processEmails({ limit: 10 }); // and anything else still waiting
      return { sent: a.sent + b.sent, failed: a.failed + b.failed, retry: a.retry + b.retry, skipped: a.skipped || b.skipped };
    })().catch((e) => { console.error("booking-emails", String((e as Error)?.message || e)); return { sent: 0, failed: 0, retry: 0, skipped: "error" }; });
    // answer straight away; the emails go out in the background
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) { rt.waitUntil(work); return reply(202, { accepted: true }); }
    return reply(200, await work);
  }

  // b) Launthia's dashboard
  if (await isAdmin(req).catch(() => false)) {
    // deno-lint-ignore no-explicit-any
    let payload: any = {};
    try { payload = await req.json(); } catch (_) { /* empty body */ }
    if (payload?.action !== "flush") return reply(400, { error: "nothing to do" });
    try { return reply(200, await processEmails({ limit: 20 })); } catch (_) { return reply(500, { error: "Could not send right now. Please try again." }); }
  }

  return reply(401, { error: "unauthorized" });
});
