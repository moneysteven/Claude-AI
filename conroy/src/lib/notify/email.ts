import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";
import { logger } from "../logger";

/**
 * Error alerts to Steven's inbox (ALERT_EMAIL). Throttled per subject so a
 * failing provider doesn't flood the inbox: at most one email per subject
 * every 15 minutes per process. Never include secrets or customer messages.
 */
const lastSent = new Map<string, number>();
const THROTTLE_MS = 15 * 60 * 1000;

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST || !env.ALERT_EMAIL) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export async function sendAdminAlert(subject: string, message: string, context: Record<string, string | undefined> = {}): Promise<boolean> {
  const key = subject;
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - THROTTLE_MS) return false;
  lastSent.set(key, now);
  logger.warn({ alert: subject, ...context }, "admin alert");
  const tx = getTransporter();
  if (!tx) return false;
  try {
    const details = Object.entries(context)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    await tx.sendMail({
      from: env.SMTP_FROM,
      to: env.ALERT_EMAIL,
      subject: `[Conroy] ${subject}`,
      text: `${message}\n\n${details}\n\nTime: ${new Date().toISOString()}\nApp: ${env.APP_URL}`,
    });
    return true;
  } catch (err) {
    logger.error({ err: (err as Error).message }, "alert email failed");
    return false;
  }
}

export function emailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

/** Transactional email (sign-in links). Returns false if SMTP isn't configured or sending fails. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!env.SMTP_HOST) return false;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  try {
    await transporter.sendMail({ from: env.SMTP_FROM, to, subject, text });
    return true;
  } catch (err) {
    logger.error({ err: (err as Error).message }, "email send failed");
    return false;
  }
}
