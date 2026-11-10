import { audit } from "@/lib/audit";
import { currentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clientIp, errorJson } from "@/lib/http";
import { exportBusinessData } from "@/lib/offboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything held for one business as a single JSON file (super admin only),
 * to hand back to a client who is leaving. Each download is audited.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return errorJson(401, "Sign in first");
  if (user.role !== "SUPER_ADMIN") return errorJson(403, "Only Steven Scale Solutions can export a whole business");
  if (user.mustChangePassword) return errorJson(403, "Change your temporary password first");

  const { id } = await params;
  const business = await db.business.findUnique({ where: { id }, select: { id: true, slug: true } });
  if (!business) return errorJson(404, "Business not found");

  const data = await exportBusinessData(business.id);
  await audit({
    businessId: business.id,
    userId: user.id,
    action: "business.export",
    entityType: "Business",
    entityId: business.id,
    details: { contacts: data.contacts.length, bookings: data.bookings.length, calls: data.calls.length, conversations: data.conversations.length },
    ip: clientIp(req),
  });

  const filename = `conroy-${business.slug}-full-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
