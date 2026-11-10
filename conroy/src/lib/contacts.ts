import { tenantDb } from "./tenant";

/** Find or create the contact for a phone number (E.164). Fills in the name if it was unknown. */
export async function upsertContact(businessId: string, phone: string, name?: string | null) {
  const t = tenantDb(businessId);
  const cleanName = name?.trim().slice(0, 120) || null;
  const existing = await t.contact.findFirst({ where: { phone } });
  if (existing) {
    if (cleanName && !existing.name) {
      return t.contact.update({ where: { id: existing.id }, data: { name: cleanName } });
    }
    return existing;
  }
  try {
    return await t.contact.create({ data: { businessId, phone, name: cleanName } });
  } catch {
    // Concurrent create (unique businessId+phone): read the winner.
    return t.contact.findFirstOrThrow({ where: { phone } });
  }
}
