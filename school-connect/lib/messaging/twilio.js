// Real SMS and WhatsApp through Twilio's REST API (no SDK needed).
//
// WhatsApp note: WhatsApp only lets a business send free-form text to someone
// who messaged it in the last 24 hours. Alerts that start a conversation
// (absence, bus near, etc.) must use message templates pre-approved by
// WhatsApp in your Twilio console. Until those are approved, keep parents on
// SMS, which has no such rule.

async function send({ to, body, channel }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set");

  const isWhatsApp = channel === "whatsapp";
  const from = isWhatsApp ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_SMS_FROM;
  if (!from) throw new Error(`No Twilio sender configured for ${channel}`);

  const params = new URLSearchParams({
    To: isWhatsApp ? `whatsapp:${to}` : to,
    From: isWhatsApp ? `whatsapp:${from}` : from,
    Body: body,
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Twilio error ${res.status}`);
  return { status: "sent", providerRef: data.sid };
}

module.exports = { name: "twilio", send };
