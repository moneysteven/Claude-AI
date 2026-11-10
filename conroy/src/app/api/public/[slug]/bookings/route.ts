import { z } from "zod";
import { createBooking } from "@/lib/booking/service";
import { env } from "@/lib/env";
import { errorJson, parseJson, readRawBody } from "@/lib/http";
import { json, preflight, publicContext } from "@/lib/public-api";
import { toE164 } from "@/lib/phone";
import { formatDateTimeSpoken, formatTime, parseLocalDateTime } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

const bodySchema = z.object({
  serviceId: z.string().min(1).max(40),
  staffId: z.string().max(40).optional().nullable(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  name: z.string().trim().min(2).max(120),
  phone: z.string().min(7).max(30),
  notes: z.string().max(500).optional().nullable(),
  consent: z.literal(true),
  // Honeypot: real users never fill this hidden field.
  website: z.string().max(0).optional().nullable(),
});

export function OPTIONS(req: Request, { params }: Params) {
  return params.then(({ slug }) => preflight(req, slug));
}

/** Booking widget: create a booking; the confirmation goes to the customer's WhatsApp. */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await publicContext(req, slug, { name: "book", max: 5, windowMs: 10 * 60_000 });
  if (!ctx.ok) return ctx.response;
  const raw = await readRawBody(req, 10_000);
  if (raw === null) return errorJson(413, "Too large", ctx.headers);
  const parsed = bodySchema.safeParse(parseJson(raw));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".") ?? "form";
    const message = field === "consent" ? "Please agree to receive your confirmation by WhatsApp." : `Please check: ${field}`;
    return errorJson(400, message, ctx.headers);
  }
  const phone = toE164(parsed.data.phone, env.DEFAULT_AREA_CODE);
  if (!phone) return errorJson(400, "Please enter a valid phone number, e.g. 876-555-1234.", ctx.headers);
  const startAt = parseLocalDateTime(parsed.data.start, ctx.business.timezone);
  if (!startAt) return errorJson(400, "Invalid time", ctx.headers);

  const result = await createBooking({
    businessId: ctx.business.id,
    serviceId: parsed.data.serviceId,
    staffId: parsed.data.staffId || null,
    startAt,
    customerName: parsed.data.name,
    customerPhone: phone,
    notes: parsed.data.notes ?? null,
    actor: { channel: "WEB" },
  });
  if (!result.ok) {
    return json(
      {
        ok: false,
        error: result.code === "NOT_AVAILABLE" ? "Sorry, that time was just taken. Please pick another time." : result.message,
        alternatives: result.alternatives.map((s) => ({ start: `${s.localDate}T${s.localTime}`, label: formatTime(s.startAt, ctx.business.timezone) })),
      },
      { status: 409, headers: ctx.headers },
    );
  }
  const b = result.booking;
  return json(
    {
      ok: true,
      reference: b.reference,
      service: b.service.name,
      staff: b.staff?.name ?? null,
      when: `${formatDateTimeSpoken(b.startAt, ctx.business.timezone)} (Jamaica time)`,
      deposit: b.service.depositCents ? "A deposit is needed to secure this booking; we'll send a secure payment link by WhatsApp." : null,
    },
    { status: 201, headers: ctx.headers },
  );
}
