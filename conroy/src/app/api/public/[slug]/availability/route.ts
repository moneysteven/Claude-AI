import { z } from "zod";
import { getAvailability } from "@/lib/booking/service";
import { errorJson } from "@/lib/http";
import { json, preflight, publicContext } from "@/lib/public-api";
import { tenantDb } from "@/lib/tenant";
import { addDays, formatTime, todayLocal } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

const querySchema = z.object({
  serviceId: z.string().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffId: z.string().max(40).optional(),
});

export function OPTIONS(req: Request, { params }: Params) {
  return params.then(({ slug }) => preflight(req, slug));
}

/** Open start times for one service on one Jamaica date. */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await publicContext(req, slug, { name: "availability", max: 60, windowMs: 60_000 });
  if (!ctx.ok) return ctx.response;
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    serviceId: url.searchParams.get("serviceId") ?? "",
    date: url.searchParams.get("date") ?? "",
    staffId: url.searchParams.get("staffId") || undefined,
  });
  if (!parsed.success) return errorJson(400, "serviceId and date (YYYY-MM-DD) are required", ctx.headers);
  const tz = ctx.business.timezone;
  const today = todayLocal(new Date(), tz);
  if (parsed.data.date < today || parsed.data.date > addDays(today, ctx.business.maxDaysAhead)) {
    return json({ date: parsed.data.date, slots: [] }, { headers: ctx.headers });
  }
  if (parsed.data.staffId) {
    const staff = await tenantDb(ctx.business.id).staff.findFirst({ where: { id: parsed.data.staffId, active: true } });
    if (!staff) return errorJson(400, "Unknown staff member", ctx.headers);
  }
  const res = await getAvailability({
    businessId: ctx.business.id,
    serviceId: parsed.data.serviceId,
    fromDate: parsed.data.date,
    toDate: parsed.data.date,
    staffId: parsed.data.staffId ?? null,
  });
  if (!res) return errorJson(404, "Unknown service", ctx.headers);
  return json(
    {
      date: parsed.data.date,
      timezone: "Jamaica time",
      slots: res.slots.map((s) => ({ start: `${s.localDate}T${s.localTime}`, label: formatTime(s.startAt, tz), staffIds: s.staffIds })),
    },
    { headers: ctx.headers },
  );
}
