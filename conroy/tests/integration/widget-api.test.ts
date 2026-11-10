import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as availabilityGET } from "@/app/api/public/[slug]/availability/route";
import { POST as bookingsPOST } from "@/app/api/public/[slug]/bookings/route";
import { GET as chatGET, POST as chatPOST } from "@/app/api/public/[slug]/chat/route";
import { GET as configGET } from "@/app/api/public/[slug]/config/route";
import { GET as servicesGET } from "@/app/api/public/[slug]/services/route";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { createSalon, ensureTestDb, nextWeekday, resetDb, type Fixture } from "./helpers";

const SLUG = "widget-salon";
const params = { params: Promise.resolve({ slug: SLUG }) };
const get = (path: string, origin?: string) => new Request(`http://localhost/api/public/${SLUG}${path}`, { headers: origin ? { origin } : {} });
const post = (path: string, body: unknown, origin = "https://tashas-salon.example") =>
  new Request(`http://localhost/api/public/${SLUG}${path}`, { method: "POST", headers: { origin, "content-type": "text/plain;charset=UTF-8" }, body: JSON.stringify(body) });

describe("public widget API", () => {
  let f: Fixture;
  beforeAll(ensureTestDb);
  beforeEach(async () => {
    await resetDb();
    f = await createSalon(SLUG, { widgetOrigins: ["https://tashas-salon.example"] });
  });

  it("serves branding and the AI notice, only to allowed websites", async () => {
    const ok = await configGET(get("/config", "https://tashas-salon.example"), params);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://tashas-salon.example");
    const cfg = await ok.json();
    expect(cfg.aiNotice).toContain("AI assistant");
    expect(cfg.privacyUrl).toContain(`/p/${SLUG}/privacy`);
    const blocked = await configGET(get("/config", "https://evil.example"), params);
    expect(blocked.status).toBe(403);
  });

  it("books end to end: services -> availability -> booking -> WhatsApp confirmation", async () => {
    const services = await (await servicesGET(get("/services"), params)).json();
    const silk = services.services.find((s: { name: string }) => s.name === "Silk Press");
    expect(silk.price).toBe("J$6,500");
    const date = nextWeekday(3);
    const avail = await (await availabilityGET(get(`/availability?serviceId=${silk.id}&date=${date}`), params)).json();
    expect(avail.slots.length).toBeGreaterThan(0);
    const slot = avail.slots[0];

    const noConsent = await bookingsPOST(post("/bookings", { serviceId: silk.id, start: slot.start, name: "Shanice Brown", phone: "876-555-0142" }), params);
    expect(noConsent.status).toBe(400);

    const res = await bookingsPOST(post("/bookings", { serviceId: silk.id, start: slot.start, name: "Shanice Brown", phone: "(876) 555 0142", consent: true }), params);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.reference).toBeTruthy();
    const booking = await db.booking.findFirstOrThrow({ where: { reference: body.reference } });
    expect(booking.customerPhone).toBe("+18765550142");
    expect(booking.channel).toBe("WEB");
    const confirmation = await db.message.findFirst({ where: { businessId: f.business.id, templateName: "booking_confirmation" } });
    expect(confirmation).not.toBeNull();

    // Same slot again: conflict with alternatives.
    const again = await bookingsPOST(post("/bookings", { serviceId: silk.id, start: slot.start, name: "Other Person", phone: "876-555-0143", consent: true, staffId: booking.staffId }), params);
    expect(again.status).toBe(409);
  });

  it("drops bot submissions (honeypot)", async () => {
    const res = await bookingsPOST(post("/bookings", { serviceId: f.serviceId, start: `${nextWeekday(3)}T10:00`, name: "Bot", phone: "876-555-0142", consent: true, website: "spam.example" }), params);
    expect(res.status).toBe(400);
    expect(await db.booking.count()).toBe(0);
  });

  it("chats with a signed token and lets staff replies through by polling", async () => {
    const first = await (await chatPOST(post("/chat", { message: "unnu open today?" }), params)).json();
    expect(first.token).toMatch(/\./);
    expect(first.reply).toBeTruthy();
    const second = await (await chatPOST(post("/chat", { message: "talk to a person", token: first.token }), params)).json();
    expect(second.status).toBe("HUMAN");
    expect(second.token).toBe(first.token);

    const conv = await db.conversation.findFirstOrThrow({ where: { businessId: f.business.id, channel: "WEB" } });
    await db.message.create({ data: { businessId: f.business.id, conversationId: conv.id, direction: "OUTBOUND", sender: "STAFF", bodyEnc: encrypt("Hi, Tasha here!"), status: "SENT" } });
    const polled = await (await chatGET(get(`/chat?token=${encodeURIComponent(first.token)}&after=0`), params)).json();
    expect(polled.messages.map((m: { text: string }) => m.text)).toEqual(["Hi, Tasha here!"]);

    const forged = await chatGET(get(`/chat?token=${encodeURIComponent(`${conv.id}.forged`)}`), params);
    expect(forged.status).toBe(401);
  });

  it("answers 'open on <day>?' directly instead of listing the whole week (no AI)", async () => {
    const ask = async (message: string) => (await (await chatPOST(post("/chat", { message }), params)).json()).reply as string;
    expect(await ask("unnu open Sunday?")).toMatch(/^No, we're closed on Sundays\. We're open again /);
    expect(await ask("unnu open sat?")).toMatch(/^Yes, we're open (tomorrow \(|on |today|We're)|^We're (open|closed) right now/);
    expect(await ask("wah time unnu close?")).toContain("Our hours:");
  });

  it("rate limits bursts", async () => {
    let last = 200;
    for (let i = 0; i < 25; i++) last = (await chatPOST(post("/chat", { message: `hi ${i}` }), params)).status;
    expect(last).toBe(429);
  });
});
