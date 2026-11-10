import { BusinessCategory } from "@prisma/client";
import type { Metadata } from "next";
import { Flash } from "@/components/Flash";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { knowledgeTextFor } from "@/lib/knowledge";
import { formatPhone } from "@/lib/phone";
import { buildVoiceGreeting } from "@/lib/retell/voice";
import { updateBusinessAction } from "./actions";

export const metadata: Metadata = { title: "Business & assistant" };

const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  SALON: "Salon",
  BARBER: "Barber shop",
  AUTO_SHOP: "Auto shop",
  RESTAURANT: "Restaurant",
  CLINIC: "Clinic",
  GYM: "Gym",
  BOUTIQUE: "Boutique",
  TOUR_OPERATOR: "Tour operator",
  GUESTHOUSE: "Guesthouse",
  OTHER: "Other",
};

export default async function BusinessSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { business } = await requireTenant(SETTINGS_ROLES);
  const [kb, greetingPreview] = await Promise.all([knowledgeTextFor(business.id), Promise.resolve(buildVoiceGreeting(business, new Date()))]);
  const phone = (v: string | null) => (v ? formatPhone(v) : "");

  return (
    <>
      <h1>Business & assistant</h1>
      <Flash searchParams={sp} />
      <p className="muted">
        Everything here feeds {business.assistantName}&apos;s knowledge on calls, WhatsApp and the website chat. Changes apply to the next call or
        message.
      </p>

      <form action={updateBusinessAction} className="stack">
        <section className="card">
          <h2>Business details</h2>
          <div className="stack">
            <label>
              Business name
              <input name="name" defaultValue={business.name} required maxLength={120} />
            </label>
            <label>
              Type of business
              <select name="category" defaultValue={business.category}>
                {Object.values(BusinessCategory).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Address
              <input name="addressLine" defaultValue={business.addressLine ?? ""} maxLength={200} placeholder="Shop 7, Demo Plaza, Half Way Tree Road" />
            </label>
            <div className="row">
              <label>
                Area / town
                <input name="area" defaultValue={business.area ?? ""} maxLength={100} placeholder="Half Way Tree" />
              </label>
              <label>
                Parish
                <input name="parish" defaultValue={business.parish ?? ""} maxLength={100} placeholder="St. Andrew" />
              </label>
            </div>
            <label>
              Directions & landmarks
              <textarea name="directions" defaultValue={business.directions ?? ""} maxLength={1000} />
            </label>
            <div className="row">
              <label>
                Main phone
                <input name="phoneMain" inputMode="tel" defaultValue={phone(business.phoneMain)} maxLength={30} placeholder="876-555-1234" />
              </label>
              <label>
                Public WhatsApp number
                <input name="whatsappNumber" inputMode="tel" defaultValue={phone(business.whatsappNumber)} maxLength={30} />
              </label>
            </div>
            <div className="row">
              <label>
                Email
                <input name="email" type="email" defaultValue={business.email ?? ""} maxLength={200} />
              </label>
              <label>
                Website
                <input name="websiteUrl" type="url" defaultValue={business.websiteUrl ?? ""} maxLength={300} placeholder="https://" />
              </label>
              <label>
                Website platform
                <input name="websitePlatform" defaultValue={business.websitePlatform ?? ""} maxLength={100} placeholder="WordPress, Hostinger..." />
              </label>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Owner & handoff</h2>
          <div className="stack">
            <label>
              Owner name
              <input name="ownerName" defaultValue={business.ownerName ?? ""} maxLength={120} />
            </label>
            <div className="row">
              <label>
                Owner WhatsApp <small className="muted">(call summaries and alerts)</small>
                <input name="ownerWhatsapp" inputMode="tel" defaultValue={phone(business.ownerWhatsapp)} maxLength={30} />
              </label>
              <label>
                Handoff number <small className="muted">(live call transfers)</small>
                <input name="handoffNumber" inputMode="tel" defaultValue={phone(business.handoffNumber)} maxLength={30} />
              </label>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Assistant</h2>
          <div className="stack">
            <label>
              Assistant name
              <input name="assistantName" defaultValue={business.assistantName} required maxLength={40} />
            </label>
            <label>
              Phone greeting (optional)
              <textarea
                name="greeting"
                defaultValue={business.greeting ?? ""}
                maxLength={400}
                placeholder="{greeting}, you've reached {business}. I'm {assistant}, the salon's AI assistant..."
              />
              <small className="muted">
                Placeholders: {"{greeting}"} (Good morning/afternoon/evening, Jamaica time), {"{business}"}, {"{assistant}"}. Conroy always adds
                the AI-assistant disclosure and the call-recording notice if your text leaves them out (Data Protection Act).
              </small>
            </label>
            <div>
              <strong>Current opening line:</strong>
              <pre className="code">{greetingPreview}</pre>
            </div>
            <label>
              Tone
              <select name="tone" defaultValue={business.tone}>
                <option value="JAMAICAN_ENGLISH">Friendly Jamaican English</option>
                <option value="LIGHT_PATOIS">Light Patois flavour in greetings and sign-offs only</option>
              </select>
            </label>
            <label>
              Other information the assistant may share
              <textarea name="extraKnowledge" defaultValue={business.extraKnowledge ?? ""} maxLength={4000} />
              <small className="muted">Products you sell, Wi-Fi, accessibility, anything customers often ask that isn&apos;t an FAQ.</small>
            </label>
            <label>
              Privacy notice URL <small className="muted">(leave blank to use the generated page)</small>
              <input name="privacyNoticeUrl" type="url" defaultValue={business.privacyNoticeUrl ?? ""} maxLength={300} placeholder="https://" />
            </label>
          </div>
        </section>

        <section className="card">
          <h2>Prices & bookings</h2>
          <div className="stack">
            <label className="check">
              <input type="checkbox" name="showUsd" defaultChecked={business.showUsd} /> Also show US$ prices (tourist-facing businesses)
            </label>
            <label>
              Exchange rate: J$ per US$1
              <input
                name="usdRateJmdPerUsd"
                inputMode="decimal"
                defaultValue={business.usdRateJmdPerUsd ? business.usdRateJmdPerUsd.toString() : ""}
                placeholder="158.00"
              />
            </label>
            <div className="row">
              <label>
                Slot interval (minutes)
                <input name="slotIntervalMin" type="number" min={5} max={120} defaultValue={business.slotIntervalMin} required />
              </label>
              <label>
                Minimum notice (minutes)
                <input name="bookingLeadTimeMin" type="number" min={0} max={2880} defaultValue={business.bookingLeadTimeMin} required />
              </label>
              <label>
                Book up to (days ahead)
                <input name="maxDaysAhead" type="number" min={1} max={365} defaultValue={business.maxDaysAhead} required />
              </label>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Privacy & website widget</h2>
          <div className="stack">
            <label>
              Keep call recordings, transcripts and chat text for (days)
              <input name="retentionDays" type="number" min={7} max={730} defaultValue={business.retentionDays} required />
              <small className="muted">Deleted automatically every night after this many days (default 90).</small>
            </label>
            <label>
              Remove a customer&apos;s details after this many months without contact
              <input name="customerRetentionMonths" type="number" min={6} max={120} defaultValue={business.customerRetentionMonths} required />
              <small className="muted">
                Their contact, enquiries and chats are deleted; their past bookings and payments stay for your records without the name or
                number (default 24). A booking still coming up always counts as contact.
              </small>
            </label>
            <div className="row">
              <label>
                Brand colour
                <input name="brandColor" type="color" defaultValue={business.brandColor} />
              </label>
              <label>
                Brand text colour
                <input name="brandTextColor" type="color" defaultValue={business.brandTextColor} />
              </label>
            </div>
            <label>
              Websites allowed to use the widget <small className="muted">(one per line, e.g. https://www.example.com; blank = any)</small>
              <textarea name="widgetOrigins" defaultValue={business.widgetOrigins.join("\n")} maxLength={4000} />
            </label>
          </div>
        </section>

        <div>
          <button type="submit">Save settings</button>
        </div>
      </form>

      <details className="card">
        <summary>
          <strong>Knowledge base preview</strong> <small className="muted">(exactly what the assistant knows, generated from these settings)</small>
        </summary>
        <pre className="code">{kb}</pre>
      </details>
    </>
  );
}
