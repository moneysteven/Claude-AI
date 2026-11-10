import { usdRate } from "@/lib/business";
import { priceLabel } from "@/lib/money";
import { json, preflight, publicContext } from "@/lib/public-api";
import { tenantDb } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export function OPTIONS(req: Request, { params }: Params) {
  return params.then(({ slug }) => preflight(req, slug));
}

/** Bookable services and the staff who do them (first names only). */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await publicContext(req, slug, { name: "services", max: 60, windowMs: 60_000 });
  if (!ctx.ok) return ctx.response;
  const t = tenantDb(ctx.business.id);
  const [services, staff] = await Promise.all([
    t.service.findMany({ where: { active: true, bookable: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { staff: true } }),
    t.staff.findMany({ where: { active: true, acceptsBookings: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const rate = usdRate(ctx.business);
  return json(
    {
      services: services.map((s) => {
        const linked = s.staff.map((l) => l.staffId);
        const who = (linked.length ? staff.filter((p) => linked.includes(p.id)) : staff).map((p) => ({ id: p.id, name: p.name }));
        return {
          id: s.id,
          name: s.name,
          description: s.description,
          durationMin: s.durationMin,
          price: priceLabel(s.priceCents, { isFrom: s.priceIsFrom, usdRate: rate }),
          deposit: s.depositCents ? priceLabel(s.depositCents) : null,
          staff: who,
        };
      }),
    },
    { headers: { ...ctx.headers, "cache-control": "public, max-age=60" } },
  );
}
