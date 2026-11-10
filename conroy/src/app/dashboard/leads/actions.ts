"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireTenant } from "@/lib/auth/session";
import { parseForm, redirectWith } from "@/lib/forms";

const schema = z.object({
  leadId: z.string().min(1),
  status: z.enum(["NEW", "CONTACTED", "WON", "LOST"]),
  notes: z.string().max(1000).optional(),
});

export async function updateLeadAction(formData: FormData) {
  const { user, business, t } = await requireTenant();
  const d = parseForm(schema, formData, "/dashboard/leads");
  await t.lead.update({ where: { id: d.leadId }, data: { status: d.status, ...(d.notes !== undefined ? { notes: d.notes || null } : {}) } });
  await audit({ businessId: business.id, userId: user.id, action: "lead.update", entityType: "Lead", entityId: d.leadId, details: { status: d.status } });
  revalidatePath("/dashboard/leads");
  redirectWith("/dashboard/leads", "ok", "Lead updated");
}
