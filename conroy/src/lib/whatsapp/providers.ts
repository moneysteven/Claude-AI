import type { Business, WhatsAppProviderType } from "@prisma/client";
import { decryptJson, hmacSha256Hex, randomToken, safeEqual } from "../crypto";
import { env } from "../env";
import { logger } from "../logger";
import { maskPhone, toWhatsAppId } from "../phone";

/**
 * WhatsApp provider adapters. Meta Cloud API is primary; 360dialog speaks the
 * same Cloud API message format behind a different URL and auth header, so
 * switching is a per-business config change (Business.whatsappProvider).
 */

export interface SendResult {
  providerMessageId: string | null;
}

export interface WhatsAppProvider {
  readonly type: WhatsAppProviderType;
  sendText(to: string, text: string): Promise<SendResult>;
  sendTemplate(to: string, name: string, language: string, params: string[]): Promise<SendResult>;
}

export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "WhatsAppSendError";
  }
}

type FetchFn = typeof fetch;

function textBody(to: string, text: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toWhatsAppId(to),
    type: "text",
    text: { preview_url: true, body: text.slice(0, 4096) },
  };
}

function templateBody(to: string, name: string, language: string, params: string[]) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toWhatsAppId(to),
    type: "template",
    template: {
      name,
      language: { code: language },
      components: params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : [],
    },
  };
}

async function post(fetchFn: FetchFn, url: string, headers: Record<string, string>, body: unknown): Promise<SendResult> {
  const res = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok) {
    throw new WhatsAppSendError(`WhatsApp send failed (${res.status}): ${json.error?.message ?? "unknown error"}`, res.status, json.error?.code);
  }
  return { providerMessageId: json.messages?.[0]?.id ?? null };
}

export class MetaCloudProvider implements WhatsAppProvider {
  readonly type = "META" as const;
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
    private readonly apiVersion: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}
  private url() {
    return `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
  }
  sendText(to: string, text: string) {
    return post(this.fetchFn, this.url(), { authorization: `Bearer ${this.accessToken}` }, textBody(to, text));
  }
  sendTemplate(to: string, name: string, language: string, params: string[]) {
    return post(this.fetchFn, this.url(), { authorization: `Bearer ${this.accessToken}` }, templateBody(to, name, language, params));
  }
}

export class Dialog360Provider implements WhatsAppProvider {
  readonly type = "DIALOG360" as const;
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}
  private url() {
    return `${this.baseUrl.replace(/\/$/, "")}/messages`;
  }
  sendText(to: string, text: string) {
    return post(this.fetchFn, this.url(), { "D360-API-KEY": this.apiKey }, textBody(to, text));
  }
  sendTemplate(to: string, name: string, language: string, params: string[]) {
    return post(this.fetchFn, this.url(), { "D360-API-KEY": this.apiKey }, templateBody(to, name, language, params));
  }
}

/** Development provider: logs metadata only (never the message text) and pretends to send. */
export class ConsoleProvider implements WhatsAppProvider {
  readonly type = "CONSOLE" as const;
  async sendText(to: string, text: string) {
    logger.info({ to: maskPhone(to), chars: text.length }, "[whatsapp:console] text message");
    return { providerMessageId: `console.${randomToken(12)}` };
  }
  async sendTemplate(to: string, name: string, _language: string, params: string[]) {
    logger.info({ to: maskPhone(to), template: name, params: params.length }, "[whatsapp:console] template message");
    return { providerMessageId: `console.${randomToken(12)}` };
  }
}

interface WaCredentials {
  accessToken?: string; // Meta: per-business token override
  apiKey?: string; // 360dialog: channel API key
}

export function whatsappFor(business: Pick<Business, "whatsappProvider" | "waPhoneNumberId" | "waCredentialsEnc">): WhatsAppProvider {
  const creds = decryptJson<WaCredentials>(business.waCredentialsEnc) ?? {};
  switch (business.whatsappProvider) {
    case "META": {
      const token = creds.accessToken ?? env.META_WA_ACCESS_TOKEN;
      if (!token || !business.waPhoneNumberId) throw new Error("Meta WhatsApp is not configured for this business");
      return new MetaCloudProvider(business.waPhoneNumberId, token, env.META_WA_API_VERSION);
    }
    case "DIALOG360": {
      const key = creds.apiKey ?? env.DIALOG360_API_KEY;
      if (!key) throw new Error("360dialog is not configured for this business");
      return new Dialog360Provider(key, env.DIALOG360_BASE_URL);
    }
    default:
      return new ConsoleProvider();
  }
}

/** Meta webhook signature: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  return safeEqual(`sha256=${hmacSha256Hex(appSecret, rawBody)}`, header);
}

/** 360dialog does not sign webhooks; we authenticate with a secret token in the URL. */
export function verifyDialog360Token(token: string | null, expected: string | undefined): boolean {
  if (!expected || !token) return false;
  return safeEqual(token, expected);
}

/** Customer service window: free-form messages only within 24h of the customer's last message. */
export function isWithinServiceWindow(lastInboundAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < 24 * 60 * 60 * 1000;
}
