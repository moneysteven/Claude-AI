import fs from "node:fs";

/**
 * Next.js loads .env itself; the worker and scripts run under plain Node,
 * so they call this first. In Docker the variables come from compose and
 * there is no .env file, which is fine.
 */
export function loadDotEnv(path = ".env") {
  if (fs.existsSync(path)) process.loadEnvFile(path);
}
