import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as d360POST } from "@/app/api/whatsapp/360dialog/route";
import { register360dialogWebhook, saveWhatsAppSettings } from "@/lib/connections";
import { db } from "@/lib/db";
import { renderPaymentUrl } from "@/lib/payments/service";
import { createSalon, ensureTestDb, resetDb, type Fixture } from "./helpers";

const message = (id: string) => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ value: { metadata: { phone_number_id: "nobody" }, contacts: [{ wa_id: "18765550142" }], messages: [{ from: "18765550142", id, type: "text", text: { body: "hi" } }] } }] }],
});

describe("provider configuration", () => {
  let f: Fixture;
  beforeAll(ensureTestDb);
  beforeEach(async () => {
    await resetDb();
    f = await createSalon("provider-salon");
  });

  it("accepts the 360dialog secret as a header (preferred) or in the URL", async () => {
    const viaHeader = await d360POST(
      new Request("http://localhost/api/whatsapp/360dialog?business=provider-salon", {
        method: "POST",
        headers: { "x-conroy-webhook-token": "test-360-token" },
        body: JSON.stringify(message("wamid.h1")),
      }),
    );
    expect(viaHeader.status).toBe(200);
    const wrongHeader = await d360POST(
      new Request("http://localhost/api/whatsapp/360dialog?business=provider-salon", {
        method: "POST",
        headers: { "x-conroy-webhook-token": "guess" },
        body: JSON.stringify(message("wamid.h2")),
      }),
    );
    expect(wrongHeader.status).toBe(401);
    expect(await db.message.count({ where: { businessId: f.business.id, direction: "INBOUND" } })).toBe(1);
  });

  it("registers the 360dialog webhook only with an API key and an https APP_URL", async () => {
    const calls: unknown[] = [];
    const fakeFetch = (async (...args: unknown[]) => {
      calls.push(args);
      return new Response("{}", { status: 201 });
    }) as typeof fetch;
    expect((await register360dialogWebhook(f.business.id, "admin", fakeFetch)).message).toMatch(/API key/);
    await saveWhatsAppSettings(f.business.id, { provider: "DIALOG360", phoneNumberId: "pn-provider", apiKey: "d360-key" }, "admin");
    // Tests run with APP_URL=http://localhost:3000; 360dialog only accepts https webhooks.
    expect((await register360dialogWebhook(f.business.id, "admin", fakeFetch)).message).toMatch(/https/);
    expect(calls).toHaveLength(0);
  });

  it("fills Fygaro's documented link parameters", () => {
    const url = renderPaymentUrl(
      { urlTemplate: "https://fygaro.com/en/pb/demo/?amount={amount}&client_reference={reference}&client_note={description}" },
      { amountCents: 500000, reference: "PAY-8XK2", description: "Box braids deposit" },
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("amount")).toBe("5000.00");
    expect(parsed.searchParams.get("client_reference")).toBe("PAY-8XK2");
    expect(parsed.searchParams.get("client_note")).toBe("Box braids deposit");
    // A plain "pay me" link (e.g. WiPay) is used as is.
    expect(renderPaymentUrl({ urlTemplate: "https://jm.wipayfinancial.com/to_me/demo" }, { amountCents: 100, reference: "X" })).toBe(
      "https://jm.wipayfinancial.com/to_me/demo",
    );
  });
});
