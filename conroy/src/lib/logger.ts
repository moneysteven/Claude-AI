import pino from "pino";

/**
 * Structured JSON logs. Anything that could carry a secret or personal data is
 * redacted. Log ids and counts, not message bodies, transcripts or tokens.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "conroy" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "password",
      "*.password",
      "passwordHash",
      "*.passwordHash",
      "token",
      "*.token",
      "accessToken",
      "*.accessToken",
      "apiKey",
      "*.apiKey",
      "secret",
      "*.secret",
      "authorization",
      "*.authorization",
      "headers.authorization",
      "headers.cookie",
      "*.headers.authorization",
      "*.headers.cookie",
      "body",
      "*.body",
      "transcript",
      "*.transcript",
      "privateKey",
      "*.privateKey",
    ],
    censor: "[redacted]",
  },
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
