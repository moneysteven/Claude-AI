import { audit } from "@/lib/audit";
import { businessForUser, currentUser, SETTINGS_ROLES } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { clientIp, errorJson, json } from "@/lib/http";
import { maskPhone, toE164 } from "@/lib/phone";
import { exportPersonData } from "@/lib/privacy/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Subject access request: download everything held about one phone number
 * as JSON. Same access rules as the privacy page (owner/manager/super admin).
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return errorJson(401, "Sign in first");
  if (!SETTINGS_ROLES.includes(user.role)) return errorJson(403, "Only owners and managers can export personal data");

  const business = await businessForUser(user);
  if (!business) return errorJson(403, "No business is linked to this account");

  const raw = new URL(req.url).searchParams.get("phone") ?? "";
  const phone = toE164(raw, env.DEFAULT_AREA_CODE);
  if (!phone) return errorJson(400, "Enter a valid phone number");

  const data = await exportPersonData(business.id, phone);
  await audit({
    businessId: business.id,
    userId: user.id,
    action: "privacy.export",
    entityType: "Contact",
    details: { phone: maskPhone(phone) },
    ip: clientIp(req),
  });
  const filename = `conroy-${business.slug}-${phone.replace(/\D/g, "")}-${new Date().toISOString().slice(0, 10)}.json`;
  return json(
    { business: business.name, ...data },
    { headers: { "content-disposition": `attachment; filename="${filename}"` } },
  );
}
