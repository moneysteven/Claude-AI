"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updatePlan } from "@/lib/admin";
import { requireSuperAdmin } from "@/lib/auth/session";
import { blankToUndefined, parseForm, redirectWith } from "@/lib/forms";
import { parseJmdToCents } from "@/lib/money";

const BACK = "/admin/plans";

const count = (max: number) => z.coerce.number().int("whole number").min(0, "can't be negative").max(max, `max ${max}`);

const schema = z.object({
  code: z.enum(["LITE", "STARTER", "GROWTH"]),
  name: z.string().trim().min(1, "required").max(40),
  description: z.preprocess(blankToUndefined, z.string().trim().max(200).optional()),
  monthlyPrice: z.string().trim().min(1, "required").max(20),
  includedVoiceMinutes: count(100_000),
  voiceOveragePerMinute: z.string().trim().min(1, "required").max(20),
  includedWhatsAppMessages: count(1_000_000),
  whatsappOveragePerMsg: z.string().trim().min(1, "required").max(20),
});

function cents(value: string, label: string): number {
  const c = parseJmdToCents(value);
  if (c === null) redirectWith(BACK, "error", `${label}: enter an amount in J$, e.g. 15000`);
  return c;
}

export async function updatePlanAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const d = parseForm(schema, formData, BACK);
  await updatePlan(
    d.code,
    {
      name: d.name,
      description: d.description ?? null,
      monthlyPriceCents: cents(d.monthlyPrice, "Monthly price"),
      includedVoiceMinutes: d.includedVoiceMinutes,
      voiceOveragePerMinuteCents: cents(d.voiceOveragePerMinute, "Overage per minute"),
      includedWhatsAppMessages: d.includedWhatsAppMessages,
      whatsappOveragePerMsgCents: cents(d.whatsappOveragePerMsg, "Overage per message"),
    },
    user.id,
  );
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `${d.name} plan saved`);
}
