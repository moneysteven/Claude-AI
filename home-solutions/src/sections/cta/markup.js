// Section 12a final CTA band (BRIEF §4.12), id="contact": "Let the light in."
// over the balcony-view clip (lazy, poster photo-terrace-glass-doors-railing) with
// a bright glass panel. "Book a free site visit" is [data-booking-open] (the booking
// modal intercepts it); without JS it falls back to a prefilled email.
// WhatsApp shows only once BUSINESS.whatsapp is confirmed; until then Email + Call head office.

export default function cta(ctx) {
  const { B, sectionVideo, btn, fmt, contact } = ctx;
  const { esc, telHref, phoneDisplay } = fmt;
  const head = B.branches.find((b) => /head office/i.test(b.name)) || B.branches[0];
  const headPhone = head?.phones?.[0];
  const bookMail = contact.mailtoLink(B, "Free site visit request", `Hi ${B.name},\n\nI'd like to book a free site visit.\n\nName:\nPhone:\nNearest branch:\nWhat I need:\n`);

  const wa = contact.whatsappEnabled(B)
    ? btn("WhatsApp us", { href: contact.waLink(B, `Hi ${B.name}, `), variant: "glass", attrs: 'target="_blank" rel="noopener"' })
    : ""; // TODO(business): confirm WhatsApp number (BUSINESS.whatsapp); the button appears automatically once set

  const fallbacks = wa ? "" : [
    btn("Email us", { href: `mailto:${B.email}`, variant: "glass" }),
    headPhone ? btn(`Call head office ${phoneDisplay(headPhone)}`, { href: telHref(headPhone), variant: "glass", arrow: false, className: "cta-call" }) : "",
  ].join("\n        ");

  return `<section id="contact" class="section cta" aria-labelledby="cta-title">
  <div class="cta-bg" aria-hidden="true">
    ${sectionVideo("band-cta", { poster: "photo-terrace-glass-doors-railing", className: "bg-video cta-video" })}
    <span class="cta-wash"></span>
  </div>
  <div class="container">
    <div class="cta-panel glass" data-light data-reveal>
      <p class="eyebrow">Free site visit</p>
      <h2 id="cta-title" class="cta-title">Let the light in.</h2>
      <p class="cta-sub">Tell us about your windows, doors or glass and we will come and look at your space. Or call your nearest of our ${B.branches.length} branches.</p>
      <div class="cta-btns">
        ${btn("Book a free site visit", { href: bookMail, variant: "primary", attrs: "data-booking-open" })}
        ${wa}
        ${fallbacks}
      </div>
      <p class="cta-meta">
        <a href="mailto:${esc(B.email)}">${esc(B.email)}</a>
        <span aria-hidden="true">·</span>
        <a href="#branches">Find your nearest branch</a>
      </p>
    </div>
  </div>
</section>`;
}
