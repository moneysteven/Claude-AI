import type { Metadata } from "next";
import Link from "next/link";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { formatPhone } from "@/lib/phone";

export const metadata: Metadata = { title: "Widget & phone setup" };

export default async function WidgetSetupPage() {
  const { business } = await requireTenant(SETTINGS_ROLES);
  const app = env.APP_URL.replace(/\/$/, "");
  const snippet = `<script src="${app}/widget.js" data-business="${business.slug}" defer></script>`;
  const digits = business.voiceNumber ? business.voiceNumber.replace(/^\+/, "") : "1876XXXXXXX";
  const hasNumber = Boolean(business.voiceNumber);

  const forwarding: { what: string; code: string }[] = [
    { what: "Forward when you don't answer", code: `**61*${digits}#` },
    { what: "Forward when you don't answer, after about 20 seconds of ringing", code: `**61*${digits}**20#` },
    { what: "Forward when your line is busy", code: `**67*${digits}#` },
    { what: "Forward ALL calls (e.g. after hours or when the shop is closed)", code: `**21*${digits}#` },
    { what: "Stop forwarding unanswered calls", code: "##61#" },
    { what: "Stop forwarding busy calls", code: "##67#" },
    { what: "Stop forwarding all calls", code: "##21#" },
    { what: "Cancel every kind of forwarding", code: "##002#" },
    { what: "Check if unanswered-call forwarding is on", code: "*#61#" },
  ];

  const webhooks: { name: string; url: string; where: string }[] = [
    { name: "Retell inbound call webhook", url: `${app}/api/retell/inbound`, where: "Retell > Phone numbers > the 876 number > Inbound webhook URL" },
    { name: "Retell agent webhook", url: `${app}/api/retell/webhook`, where: "Retell > Agent > Webhook URL (set automatically by npm run retell:sync)" },
    { name: "Meta WhatsApp Cloud API webhook", url: `${app}/api/whatsapp/meta`, where: "Meta App > WhatsApp > Configuration > Callback URL (subscribe to 'messages')" },
    {
      name: "360dialog webhook (only if using 360dialog)",
      url: `${app}/api/whatsapp/360dialog?token=DIALOG360_WEBHOOK_TOKEN&business=${business.slug}`,
      where: "360dialog hub > webhook URL (replace DIALOG360_WEBHOOK_TOKEN with the value from the server's .env)",
    },
  ];

  return (
    <>
      <h1>Widget & phone setup</h1>

      <section className="card">
        <h2>Website chat & booking widget</h2>
        <p>Paste this one line into the client&apos;s website. It adds the chat and booking buttons in the business&apos;s brand colours.</p>
        <pre className="code">{snippet}</pre>
        <ul>
          <li>
            <strong>WordPress:</strong> install the free <em>WPCode</em> (or <em>Insert Headers and Footers</em>) plugin, open Code Snippets &gt;
            Header &amp; Footer, paste it into the <strong>Footer</strong> box and save.
          </li>
          <li>
            <strong>Hostinger Website Builder:</strong> Settings &gt; Integrations &gt; Custom code (paste in the body/footer section), or drag an{" "}
            <em>Embed code</em> element onto every page and paste it there. Publish the site.
          </li>
          <li>
            <strong>Plain HTML:</strong> paste it just before the closing <code>&lt;/body&gt;</code> tag on every page.
          </li>
        </ul>
        <p className="muted">
          If you limit the widget to specific websites (Business &amp; assistant &gt; Websites allowed), add the client&apos;s domain there first,
          e.g. https://www.example.com.
        </p>
        <p>
          <Link href={`/demo/${business.slug}`} className="button secondary">
            Open the demo page
          </Link>
        </p>
      </section>

      <section className="card">
        <h2>Phone number</h2>
        <p>
          {business.assistantName} answers on{" "}
          <strong>{hasNumber ? formatPhone(business.voiceNumber) : "no number connected yet (connect one with npm run retell:sync -- --import-number)"}</strong>
          .
        </p>
        <h3>Keeping the existing Digicel or Flow mobile number</h3>
        <p>
          Customers can keep calling the number they already know. On the business&apos;s own phone, dial one of these codes and press call. You
          should hear or see a confirmation.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>What it does</th>
                <th>Dial</th>
              </tr>
            </thead>
            <tbody>
              {forwarding.map((f) => (
                <tr key={f.code}>
                  <td>{f.what}</td>
                  <td>
                    <code>{f.code}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!hasNumber ? <p className="muted">Replace 1876XXXXXXX with the AI receptionist&apos;s number once it is connected.</p> : null}
        <p className="muted">
          These are standard GSM forwarding codes; confirm them with Digicel or Flow, and ask how forwarded calls are charged on the business&apos;s
          plan. Flow fixed landlines use Flow&apos;s own call-forwarding
          feature: call Flow or use the codes printed in the landline guide. Recommended setup: forward unanswered and busy calls during opening
          hours, and all calls after hours.
        </p>
      </section>

      <section className="card">
        <h2>Webhook URLs (for Steven)</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Webhook</th>
                <th>URL</th>
                <th>Where to paste it</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w) => (
                <tr key={w.name}>
                  <td>{w.name}</td>
                  <td>
                    <code style={{ wordBreak: "break-all" }}>{w.url}</code>
                  </td>
                  <td>
                    <small>{w.where}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          WhatsApp phone number ID for this business: <code>{business.waPhoneNumberId ?? "not set"}</code> (provider:{" "}
          {business.whatsappProvider.toLowerCase()}). Retell agent: <code>{business.retellAgentId ?? "not created yet"}</code>.
        </p>
      </section>
    </>
  );
}
