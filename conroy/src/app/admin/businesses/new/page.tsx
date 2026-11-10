import type { Metadata } from "next";
import { getPlans } from "@/lib/billing";
import { env } from "@/lib/env";
import { JAMAICA_HOLIDAY_DEFAULTS } from "@/lib/holidays";
import { formatJmd } from "@/lib/money";
import { retellConfigured } from "@/lib/retell/provision";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Onboard a business" };

export default async function NewBusinessPage() {
  const plans = await getPlans();
  return (
    <>
      <h1>Onboard a new business</h1>
      <p className="muted">
        Fill this in with the owner (about 20 minutes). On &quot;Create&quot;, Conroy sets up the business, its knowledge base, the owner&apos;s login and
        the voice agent, and gives you the widget code and call-forwarding codes.
      </p>
      <OnboardingWizard
        holidays={JAMAICA_HOLIDAY_DEFAULTS.map((h) => ({ key: h.key, name: h.name }))}
        plans={(["LITE", "STARTER", "GROWTH"] as const).map((code) => ({
          code,
          name: plans[code].name,
          price: formatJmd(plans[code].monthlyPriceCents),
          minutes: plans[code].includedVoiceMinutes,
          messages: plans[code].includedWhatsAppMessages,
        }))}
        googleServiceAccount={env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null}
        retellReady={retellConfigured()}
      />
    </>
  );
}
