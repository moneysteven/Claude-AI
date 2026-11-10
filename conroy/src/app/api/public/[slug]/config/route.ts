import { privacyUrl } from "@/lib/business";
import { env } from "@/lib/env";
import { formatPhone, toWhatsAppId } from "@/lib/phone";
import { json, preflight, publicContext } from "@/lib/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export function OPTIONS(req: Request, { params }: Params) {
  return params.then(({ slug }) => preflight(req, slug));
}

/** Branding + notices for the embeddable widget. */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await publicContext(req, slug, { name: "config", max: 120, windowMs: 60_000 });
  if (!ctx.ok) return ctx.response;
  const b = ctx.business;
  return json(
    {
      name: b.name,
      assistantName: b.assistantName,
      brandColor: b.brandColor,
      brandTextColor: b.brandTextColor,
      privacyUrl: privacyUrl(b, env.APP_URL),
      aiNotice: `You're chatting with ${b.assistantName}, ${b.name}'s AI assistant. Don't share card details or medical information here.`,
      welcome:
        b.tone === "LIGHT_PATOIS"
          ? `Wah gwaan! I'm ${b.assistantName}. Ask me about our hours, prices or location, or book an appointment.`
          : `Hi! I'm ${b.assistantName}. Ask me about our hours, prices or location, or book an appointment.`,
      whatsapp: b.whatsappNumber ? { display: formatPhone(b.whatsappNumber), link: `https://wa.me/${toWhatsAppId(b.whatsappNumber)}` } : null,
    },
    { headers: { ...ctx.headers, "cache-control": "public, max-age=300" } },
  );
}
