// Test environment: deterministic secrets, never real provider keys.
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.APP_URL ??= "http://localhost:3000";
process.env.LLM_PROVIDER = "rules";
process.env.WHATSAPP_PROVIDER = "console";
process.env.LOG_LEVEL = "silent";
process.env.JOBS_ENABLED = "false";
// Always the throwaway test database (it is truncated by the integration tests).
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? "postgresql://conroy:conroy_dev@localhost:5432/conroy_test";
// Provider secrets used to sign test webhooks (never real keys).
process.env.RETELL_API_KEY = "test-retell-api-key";
process.env.RETELL_VERIFY_SIGNATURES = "true";
process.env.RETELL_FUNCTION_SECRET = "test-function-secret";
process.env.META_WA_APP_SECRET = "test-meta-app-secret";
process.env.META_WA_VERIFY_TOKEN = "test-verify-token";
process.env.DIALOG360_WEBHOOK_TOKEN = "test-360-token";
