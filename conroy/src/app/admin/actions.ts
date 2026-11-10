"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireSuperAdmin, setAdminBusiness } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { parseForm } from "@/lib/forms";

const switchSchema = z.object({ businessId: z.string().min(1), to: z.enum(["dashboard", "settings", "inbox"]).optional() });

/** Super admin: work inside one business's dashboard. */
export async function switchBusinessAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const d = parseForm(switchSchema, formData, "/admin");
  const business = await db.business.findUnique({ where: { id: d.businessId }, select: { id: true } });
  if (!business) redirect("/admin?error=Business%20not%20found");
  await setAdminBusiness(business.id);
  await audit({ businessId: business.id, userId: user.id, action: "admin.switch_business" });
  redirect(d.to === "settings" ? "/dashboard/settings" : d.to === "inbox" ? "/dashboard/inbox" : "/dashboard");
}
