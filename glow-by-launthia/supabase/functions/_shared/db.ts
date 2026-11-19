// Glow by Launthia – talking to the database from the Edge Functions (server side only).
// Every call goes through a database function (supabase/platform.sql), with the service role key that Supabase
// provides inside Edge Functions. The key never leaves the server and is never in the website.

const env = (k: string) => Deno.env.get(k) ?? "";
export const SB_URL = env("SUPABASE_URL");
export const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

export class DbError extends Error {
  code: string;
  status: number;
  userMessage: string | null; // only set for the friendly messages our own database functions raise
  constructor(code: string, status: number, userMessage: string | null) {
    super(`database ${status} ${code}`);
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
  }
}

// calls public.<fn>(named arguments) and returns its result
// deno-lint-ignore no-explicit-any
export async function rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!/^[a-z_]+$/.test(fn)) throw new Error("bad function name");
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = null; }
  if (!res.ok) {
    const code = String(body?.code || "");
    // P0001 = a message written for the client by our own database functions (e.g. "That time was just taken")
    throw new DbError(code, res.status, code === "P0001" && body?.message ? String(body.message) : null);
  }
  return body as T;
}
