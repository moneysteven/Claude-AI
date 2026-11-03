// Contact channels with graceful fallbacks (BRIEF §3 forms/whatsapp TBC).
//  - WhatsApp buttons render only when BUSINESS.whatsapp is a confirmed number.
//  - Forms POST to Formspree when an id is set; otherwise they open a
//    prefilled email to BUSINESS.email (mailto fallback).

const isSet = (v) => v && v !== "TBC";

export const whatsappEnabled = (B) => isSet(B.whatsapp);

/** https://wa.me/<number>?text=<encoded> or null when WhatsApp isn't confirmed. */
export function waLink(B, text = "") {
  if (!whatsappEnabled(B)) return null;
  const n = String(B.whatsapp).replace(/\D/g, "");
  return `https://wa.me/${n}${text ? "?text=" + encodeURIComponent(text) : ""}`;
}

export function mailtoLink(B, subject, body) {
  return `mailto:${B.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export const formspreeEndpoint = (B) => (isSet(B.forms?.formspreeId) ? `https://formspree.io/f/${B.forms.formspreeId}` : null);

/**
 * Sends a form. Returns { method: "formspree" | "mailto", ok }.
 * `fields` is a flat object; `text` is the human-readable message used for
 * mailto/WhatsApp fallbacks.
 */
export async function submitForm(B, { subject, fields, text }) {
  const endpoint = formspreeEndpoint(B);
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ _subject: subject, ...fields }),
      });
      if (res.ok) return { method: "formspree", ok: true };
    } catch { /* fall through to mailto */ }
  }
  const href = mailtoLink(B, subject, text);
  try { window.location.href = href; } catch { /* ignore */ }
  return { method: "mailto", ok: true, href };
}
