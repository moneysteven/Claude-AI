import crypto from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as telnyxPOST } from "@/app/api/telephony/telnyx/route";
import { POST as twilioPOST } from "@/app/api/telephony/twilio/route";
import { db } from "@/lib/db";
import { twilioSignature, verifyTelnyxSignature, verifyTwilioSignature } from "@/lib/telephony";
import { createSalon, ensureTestDb, resetDb, type Fixture } from "./helpers";

const TWILIO_TOKEN = "test-twilio-auth-token";

describe("Twilio signature", () => {
  it("matches Twilio's documented algorithm", () => {
    // Example from Twilio's security docs (token 12345, their sample URL and params).
    const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
    const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
    expect(twilioSignature("12345", url, params)).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
    expect(verifyTwilioSignature("12345", url, params, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=")).toBe(true);
    expect(verifyTwilioSignature("12345", url, { ...params, Digits: "9999" }, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=")).toBe(false);
    // Twilio sometimes signs with the default port included; both forms are accepted.
    expect(verifyTwilioSignature("12345", "https://mycompany.com:443/myapp.php?foo=1&bar=2", params, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=")).toBe(true);
  });
});

describe("carrier webhooks", () => {
  let f: Fixture;
  beforeAll(ensureTestDb);
  beforeEach(async () => {
    await resetDb();
    f = await createSalon("carrier-salon", { voiceNumber: "+18765550123" });
  });

  it("Twilio: rejects bad signatures, records completed call seconds once", async () => {
    const params = { CallSid: "CA42", CallStatus: "completed", CallDuration: "125", To: "+18765550123", From: "+18765550142" };
    const body = new URLSearchParams(params).toString();
    const url = "http://localhost:3000/api/telephony/twilio";
    const bad = await twilioPOST(new Request(url, { method: "POST", headers: { "x-twilio-signature": "nope" }, body }));
    expect(bad.status).toBe(401);
    const sig = twilioSignature(TWILIO_TOKEN, url, params);
    for (let i = 0; i < 2; i++) {
      const ok = await twilioPOST(new Request(url, { method: "POST", headers: { "x-twilio-signature": sig }, body }));
      expect(ok.status).toBe(200);
    }
    const usage = await db.usageEvent.findMany({ where: { businessId: f.business.id, kind: "TELEPHONY_SECONDS" } });
    expect(usage.map((u) => u.quantity)).toEqual([125]);
  });

  it("Telnyx: verifies Ed25519 signatures with a freshness window", async () => {
    const key = crypto.createPrivateKey(process.env.TEST_TELNYX_PRIVATE_KEY_PEM!);
    const event = {
      data: {
        id: "evt_1",
        event_type: "call.hangup",
        payload: { call_session_id: "sess_1", to: "+18765550123", start_time: "2026-11-10T15:00:00Z", end_time: "2026-11-10T15:03:20Z" },
      },
    };
    const raw = JSON.stringify(event);
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto.sign(null, Buffer.from(`${ts}|${raw}`), key).toString("base64");
    expect(verifyTelnyxSignature(process.env.TELNYX_PUBLIC_KEY, raw, sig, ts)).toBe(true);
    expect(verifyTelnyxSignature(process.env.TELNYX_PUBLIC_KEY, raw.replace("sess_1", "sess_2"), sig, ts)).toBe(false);
    expect(verifyTelnyxSignature(process.env.TELNYX_PUBLIC_KEY, raw, sig, String(Number(ts) - 600))).toBe(false); // replay

    const req = (signature: string) =>
      new Request("http://localhost/api/telephony/telnyx", {
        method: "POST",
        headers: { "telnyx-signature-ed25519": signature, "telnyx-timestamp": ts },
        body: raw,
      });
    expect((await telnyxPOST(req("AAAA"))).status).toBe(401);
    expect((await telnyxPOST(req(sig))).status).toBe(200);
    expect((await (await telnyxPOST(req(sig))).json()).duplicate).toBe(true);
    const usage = await db.usageEvent.findMany({ where: { businessId: f.business.id, kind: "TELEPHONY_SECONDS" } });
    expect(usage.map((u) => u.quantity)).toEqual([200]);
  });
});
