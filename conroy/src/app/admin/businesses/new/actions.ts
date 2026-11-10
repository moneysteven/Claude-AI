"use server";

import { requireSuperAdmin } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { forwardingCodes, type ForwardingCode } from "@/lib/forwarding";
import { logger } from "@/lib/logger";
import { createTenantFromOnboarding, OnboardingError } from "@/lib/onboarding/create";
import type { FieldErrors, OnboardingInput } from "@/lib/onboarding/schema";
import { formatPhone } from "@/lib/phone";
import { retellConfigured, syncRetellAgent } from "@/lib/retell/provision";

export interface LaunchResult {
  businessId: string;
  slug: string;
  name: string;
  status: string;
  ownerEmail: string;
  tempPassword: string;
  widgetSnippet: string;
  demoUrl: string;
  privacyUrl: string;
  voice: { status: "created" | "skipped" | "failed"; message: string };
  voiceNumber: string | null;
  forwarding: ForwardingCode[];
  googleServiceAccount: string | null;
  calendarProvider: string;
  websitePlatform: string | null;
}

export type SubmitResult = { ok: true; launch: LaunchResult } | { ok: false; errors: FieldErrors; message: string };

/**
 * Onboarding submit: create the tenant, then (optionally) its Retell voice
 * agent. A voice failure never undoes the tenant: it can be retried from the
 * business page.
 */
export async function submitOnboardingAction(payload: OnboardingInput): Promise<SubmitResult> {
  const user = await requireSuperAdmin();
  try {
    const { business, owner } = await createTenantFromOnboarding(payload, { id: user.id, role: user.role });

    let voice: LaunchResult["voice"];
    if (!payload.options?.createVoiceAgent) {
      voice = { status: "skipped", message: "Voice agent not created (you chose to do it later)." };
    } else if (!retellConfigured()) {
      voice = { status: "skipped", message: "RETELL_API_KEY isn't set on the server, so the voice agent wasn't created. Add it, then use 'Create voice agent' on the business page." };
    } else {
      try {
        const { agentId } = await syncRetellAgent(business.id, undefined, user.id);
        voice = { status: "created", message: `Retell agent ${agentId} created from the Conroy template.` };
      } catch (err) {
        logger.error({ err: (err as Error).message, businessId: business.id }, "retell provisioning failed during onboarding");
        voice = { status: "failed", message: `The business was created, but Retell said: ${(err as Error).message}. Retry from the business page.` };
      }
    }

    return {
      ok: true,
      launch: {
        businessId: business.id,
        slug: business.slug,
        name: business.name,
        status: business.status,
        ownerEmail: owner.email,
        tempPassword: owner.tempPassword,
        widgetSnippet: `<script src="${env.APP_URL}/widget.js" data-business="${business.slug}" defer></script>`,
        demoUrl: `${env.APP_URL}/demo/${business.slug}`,
        privacyUrl: `${env.APP_URL}/p/${business.slug}/privacy`,
        voice,
        voiceNumber: business.voiceNumber ? formatPhone(business.voiceNumber) : null,
        forwarding: forwardingCodes(business.voiceNumber),
        googleServiceAccount: env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null,
        calendarProvider: business.calendarProvider,
        websitePlatform: business.websitePlatform,
      },
    };
  } catch (err) {
    if (err instanceof OnboardingError) {
      return { ok: false, errors: err.fieldErrors, message: "Some answers need fixing before the business can be created." };
    }
    logger.error({ err: (err as Error).message }, "onboarding failed");
    return { ok: false, errors: {}, message: `Something went wrong: ${(err as Error).message}` };
  }
}
