import crypto from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as metaGET, POST as metaPOST } from "@/app/api/whatsapp/meta/route";
import { POST as d360POST } from "@/app/api/whatsapp/360dialog/route";
import { decryptOptional } from "@/lib/crypto";
import { db } from "@/lib/db";
import { runReminderScan } from "@/lib/jobs/handlers";
import { sendCustomerWhatsApp } from "@/lib/whatsapp/outbound";
import { createSalon, ensureTestDb, resetDb, type Fixture } from "./helpers";

const SECRET = "test-meta-app-secret";
let seq = 0;

function payload(text: string, from = "18765550142", phoneNumberId = "pnid-wa-salon") {
  seq++;
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "18765550123", phone_number_id: phoneNumberId },
              contacts: [{ wa_id: from, profile: { name: "Shanice" } }],
              messages: [{ from, id: `wamid.${seq}.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

function metaRequest(body: unknown, secret = SECRET) {
  const raw = JSON.stringify(body);
  const sig = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  return new Request("http://localhost/api/whatsapp/meta", { method: "POST", headers: { "x-hub-signature-256": sig }, body: raw });
}

async function thread(businessId: string) {
  const msgs = await db.message.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } });
  return msgs.map((m) => ({ dir: m.direction, sender: m.sender, status: m.status, template: m.templateName, text: decryptOptional(m.bodyEnc) ?? "" }));
}

describe("WhatsApp integration", () => {
  let f: Fixture;
  beforeAll(ensureTestDb);
  beforeEach(async () => {
    await resetDb();
    f = await createSalon("wa-salon");
  });

  it("answers Meta's verification challenge only with the right token", async () => {
    const ok = await metaGET(new Request("http://localhost/api/whatsapp/meta?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=12345"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    const bad = await metaGET(new Request("http://localhost/api/whatsapp/meta?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345"));
    expect(bad.status).toBe(403);
  });

  it("rejects unsigned or wrongly signed webhooks", async () => {
    expect((await metaPOST(metaRequest(payload("hi"), "wrong-secret"))).status).toBe(401);
    expect((await d360POST(new Request("http://localhost/api/whatsapp/360dialog?token=nope", { method: "POST", body: "{}" }))).status).toBe(401);
  });

  it("replies with the AI notice first, then answers Patois questions from the knowledge base", async () => {
    expect((await metaPOST(metaRequest(payload("wah gwaan, how much fi a silk press?")))).status).toBe(200);
    let t = await thread(f.business.id);
    expect(t[0]).toMatchObject({ dir: "INBOUND", sender: "CUSTOMER" });
    expect(t[1].text).toContain("AI assistant");
    expect(t[1].text).toContain("/p/wa-salon/privacy");
    expect(t[1].text).toContain("J$6,500");

    await metaPOST(metaRequest(payload("is there parking?")));
    t = await thread(f.business.id);
    expect(t[3].text).toBe("Yes, free parking at the back.");
    expect(t[3].text).not.toContain("AI assistant"); // notice only once
  });

  it("ignores duplicate deliveries of the same message", async () => {
    const body = payload("hello");
    await metaPOST(metaRequest(body));
    await metaPOST(metaRequest(body));
    expect(await db.message.count({ where: { direction: "INBOUND" } })).toBe(1);
  });

  it("STOP opts out: confirmation sent, later reminders suppressed; START opts back in", async () => {
    await metaPOST(metaRequest(payload("STOP")));
    const contact = await db.contact.findFirstOrThrow({ where: { phone: "+18765550142" } });
    expect(contact.whatsappOptOut).toBe(true);
    const t = await thread(f.business.id);
    expect(t[1].text).toContain("unsubscribed");

    const res = await sendCustomerWhatsApp({ businessId: f.business.id, to: "+18765550142", sender: "SYSTEM", template: { name: "appointment_reminder", params: ["a", "b", "c", "d", "e"] } });
    expect(res.status).toBe("SUPPRESSED");

    await metaPOST(metaRequest(payload("START")));
    expect((await db.contact.findFirstOrThrow({ where: { phone: "+18765550142" } })).whatsappOptOut).toBe(false);
  });

  it("'talk to a person' pauses the bot and alerts staff; the bot stays quiet until resumed", async () => {
    await metaPOST(metaRequest(payload("mi waan talk to a real person")));
    const conv = await db.conversation.findFirstOrThrow({ where: { businessId: f.business.id } });
    expect(conv.status).toBe("HUMAN");
    const before = (await thread(f.business.id)).length;
    await metaPOST(metaRequest(payload("hello? anybody there?")));
    const after = await thread(f.business.id);
    expect(after.length).toBe(before + 1); // stored, but no bot reply
    expect(after[after.length - 1].dir).toBe("INBOUND");
  });

  it("flags urgent medical messages with emergency numbers", async () => {
    await metaPOST(metaRequest(payload("mi chest a hurt mi bad and mi cyaan breathe")));
    const t = await thread(f.business.id);
    expect(t[1].text).toContain("110");
    expect(t[1].text).toContain("119");
    expect((await db.conversation.findFirstOrThrow({})).status).toBe("HUMAN");
  });

  it("enforces the 24-hour window: free text inside, template required outside", async () => {
    await metaPOST(metaRequest(payload("hi")));
    const inside = await sendCustomerWhatsApp({ businessId: f.business.id, to: "+18765550142", sender: "STAFF", text: "Hi from Tasha" });
    expect(inside.status).toBe("SENT");
    await db.contact.updateMany({ data: { lastInboundWhatsappAt: new Date(Date.now() - 25 * 3600 * 1000) } });
    const outside = await sendCustomerWhatsApp({ businessId: f.business.id, to: "+18765550142", sender: "STAFF", text: "Hi again" });
    expect(outside.status).toBe("SUPPRESSED");
  });

  it("sends 24h and 2h reminders once each", async () => {
    const service = await db.service.findFirstOrThrow({ where: { businessId: f.business.id } });
    const booking = await db.booking.create({
      data: {
        businessId: f.business.id,
        reference: "TS-REM1",
        serviceId: service.id,
        startAt: new Date(Date.now() + 20 * 3600 * 1000),
        endAt: new Date(Date.now() + 21.5 * 3600 * 1000),
        channel: "WHATSAPP",
        customerName: "Shanice",
        customerPhone: "+18765550142",
        createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      },
    });
    await runReminderScan();
    await runReminderScan();
    let reminders = (await thread(f.business.id)).filter((m) => m.template === "appointment_reminder");
    expect(reminders).toHaveLength(1);
    // Two hours before.
    await runReminderScan(new Date(booking.startAt.getTime() - 90 * 60 * 1000));
    reminders = (await thread(f.business.id)).filter((m) => m.template === "appointment_reminder");
    expect(reminders).toHaveLength(2);
  });

  it("routes 360dialog webhooks with the secret token", async () => {
    const res = await d360POST(
      new Request("http://localhost/api/whatsapp/360dialog?token=test-360-token&business=wa-salon", {
        method: "POST",
        body: JSON.stringify(payload("unnu open today?", "18765550142", "unknown-number-id")),
      }),
    );
    expect(res.status).toBe(200);
    expect(await db.message.count({ where: { businessId: f.business.id, direction: "INBOUND" } })).toBe(1);
  });
});
