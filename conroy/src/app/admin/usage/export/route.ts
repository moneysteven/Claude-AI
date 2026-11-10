import { listBusinessesWithUsage } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { currentUser } from "@/lib/auth/session";
import { isPeriod, periodOf } from "@/lib/billing";
import { clientIp, errorJson } from "@/lib/http";
import { csvCell, CSV_HEADER, csvRow, csvTotals } from "../rows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Usage for every business for one month, as CSV (super admin only). */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return errorJson(401, "Sign in first");
  if (user.role !== "SUPER_ADMIN") return errorJson(403, "Only Steven Scale Solutions can export usage");
  if (user.mustChangePassword) return errorJson(403, "Change your temporary password first");

  const month = new URL(req.url).searchParams.get("month");
  const period = isPeriod(month) ? month : periodOf();
  const rows = await listBusinessesWithUsage(period);
  const lines = [CSV_HEADER, ...rows.map(csvRow), csvTotals(rows)].map((cells) => cells.map(csvCell).join(","));
  await audit({ userId: user.id, action: "usage.export", details: { period, businesses: rows.length }, ip: clientIp(req) });

  return new Response(`${lines.join("\r\n")}\r\n`, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="conroy-usage-${period}.csv"`,
      "cache-control": "no-store",
    },
  });
}
