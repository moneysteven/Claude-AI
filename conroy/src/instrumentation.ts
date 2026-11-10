import type { Instrumentation } from "next";

/**
 * Any unhandled error in a page, server action or API route is logged as
 * structured JSON and emailed to ALERT_EMAIL (throttled per route). The query
 * string is dropped because webhook URLs can carry tokens.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("./lib/logger");
  const { sendAdminAlert } = await import("./lib/notify/email");
  const path = request.path.split("?")[0];
  const message = err instanceof Error ? err.message : String(err);
  const digest = (err as { digest?: string } | null)?.digest;
  logger.error({ err: message, digest, path, method: request.method, route: context.routePath, kind: context.routeType }, "unhandled request error");
  await sendAdminAlert(`Error on ${context.routePath}`, `${request.method} ${path}\n${message}`, {
    route: context.routePath,
    kind: context.routeType,
    digest,
  }).catch(() => {});
};
