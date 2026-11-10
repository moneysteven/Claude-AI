import { z } from "zod";

/**
 * Typed, validated environment. Import `env` instead of reading process.env
 * directly so a missing secret fails loudly at startup, not mid-call.
 * Values are never logged.
 */
const flag = (defaultValue: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(defaultValue)
    .transform((v) => v === "true");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  DATA_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "DATA_ENCRYPTION_KEY must be base64 of 32 bytes"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  DEFAULT_AREA_CODE: z.enum(["876", "658"]).default("876"),

  ALERT_EMAIL: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: z.string().default("Conroy Alerts <alerts@example.com>"),

  LLM_PROVIDER: z.enum(["anthropic", "openai", "rules"]).default("rules"),
  LLM_MODEL: z.string().default("claude-haiku-5-5"),
  ANTHROPIC_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(10).default(6),

  RETELL_API_KEY: optionalString,
  RETELL_WEBHOOK_KEY: optionalString,
  RETELL_FUNCTION_SECRET: optionalString,
  RETELL_LLM_MODEL: z.string().default("claude-5.5-haiku"),
  RETELL_VOICE_ID: z.string().default("11labs-Adrian"),
  RETELL_VERIFY_SIGNATURES: flag("true"),

  TELEPHONY_PROVIDER: z.enum(["twilio", "telnyx"]).default("twilio"),
  SIP_TERMINATION_URI: optionalString,
  SIP_TRUNK_USERNAME: optionalString,
  SIP_TRUNK_PASSWORD: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TELNYX_PUBLIC_KEY: optionalString,

  WHATSAPP_PROVIDER: z.enum(["console", "meta", "360dialog"]).default("console"),
  META_WA_ACCESS_TOKEN: optionalString,
  META_WA_APP_SECRET: optionalString,
  META_WA_VERIFY_TOKEN: optionalString,
  META_WA_API_VERSION: z.string().default("v23.0"),
  DIALOG360_API_KEY: optionalString,
  DIALOG360_BASE_URL: z.string().url().default("https://waba-v2.360dialog.io"),
  DIALOG360_WEBHOOK_TOKEN: optionalString,

  GOOGLE_SERVICE_ACCOUNT_EMAIL: optionalString,
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: optionalString,
  CALCOM_API_BASE_URL: z.string().url().default("https://api.cal.com/v2"),

  JOBS_ENABLED: flag("true"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    // Only variable names and messages are printed, never values.
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

/** Lazily validated env (lazy so `next build` can run without runtime secrets). */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    if (!cached) cached = loadEnv();
    return cached[prop as keyof Env];
  },
});

/** For tests: drop the cached env after changing process.env. */
export function resetEnvCache() {
  cached = undefined;
}

export const isProduction = () => process.env.NODE_ENV === "production";
