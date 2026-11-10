import crypto from "node:crypto";
import { env } from "./env";

/**
 * Field-level encryption (AES-256-GCM) for sensitive data at rest:
 * transcripts, message bodies, recording links and provider credentials.
 *
 * Format: "v1.<iv b64url>.<auth tag b64url>.<ciphertext b64url>"
 */
const VERSION = "v1";

function key(): Buffer {
  const k = Buffer.from(env.DATA_ENCRYPTION_KEY, "base64");
  if (k.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must decode to 32 bytes");
  return k;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== VERSION || !ivB64 || !tagB64 || dataB64 === undefined) {
    throw new Error("Unrecognised ciphertext format");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
}

/** Encrypt when there is a value; keeps null/undefined as null. */
export function encryptOptional(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === "" ? null : encrypt(value);
}

/** Decrypt when there is a value. Returns null (and never throws) for unreadable data. */
export function decryptOptional(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}

export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T>(value: string | null | undefined): T | null {
  const text = decryptOptional(value);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Hex(secret: string | Buffer, input: string | Buffer): string {
  return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

/** Constant-time string comparison (length leak only). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Short, unambiguous codes (no 0/O/1/I/L) for booking and payment references. */
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function randomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return out;
}

/**
 * Signed tokens for the public chat widget: the browser holds
 * "<conversationId>.<hmac>" so it can continue its own conversation but
 * cannot read anyone else's.
 */
export function signValue(value: string): string {
  return `${value}.${hmacSha256Hex(env.SESSION_SECRET, `widget:${value}`).slice(0, 32)}`;
}

export function verifySignedValue(token: string | null | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = token.slice(0, idx);
  return safeEqual(signValue(value), token) ? value : null;
}
