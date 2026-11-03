// Fixed header (BRIEF §2). Transparent over the hero; frosted glass + compact
// after 40px of scroll (index.js). Mobile: hamburger -> full-height glass sheet.
import { logoSVG } from "./logo.js";

export const NAV = [
  ["Products", "#products"], ["Finishes", "#finishes"], ["Quote", "#quote"],
  ["Projects", "#projects"], ["Branches", "#branches"], ["FAQ", "#faq"],
];

export const ICON = {
  phone: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M6.6 3.5h2.6l1.4 4-2 1.5a12 12 0 0 0 6.4 6.4l1.5-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  quote: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M8 4h8m-8 0a2 2 0 0 0-2 2v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a2 2 0 0 0-2-2M8 4V3h8v1M9 10h6M9 14h6M9 17h3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
};

export const headOffice = (B) => B.branches.find((b) => /head office/i.test(b.name)) || B.branches[0];

export default function header({ B, fmt, btn }) {
  const ho = headOffice(B);
  const tel = ho.phones[0];
  const links = (cls) => NAV.map(([t, h]) => `<li><a class="${cls}" href="${h}">${t}</a></li>`).join("");
  const bookAttrs = 'data-booking-open';

  return `<header class="hdr" data-header>
  <div class="hdr__bg" aria-hidden="true"></div>
  <div class="hdr__bar container">
    <a class="hdr__logo" href="#top" aria-label="${fmt.esc(B.name)}, back to top">${logoSVG({ className: "hdr__logo-svg" })}</a>
    <nav class="hdr__nav" aria-label="Primary">
      <ul class="hdr__links">${links("hdr__link")}</ul>
    </nav>
    <div class="hdr__actions">
      <a class="icon-btn hdr__icon hdr__call" href="${fmt.telHref(tel)}" data-hdr-call aria-label="Call ${fmt.esc(ho.name)}, ${fmt.phoneDisplay(tel)}">${ICON.phone}</a>
      <a class="icon-btn hdr__icon hdr__basket" href="#quote" data-hdr-basket aria-label="Your quote">${ICON.quote}<span class="hdr__count tnum" data-hdr-count hidden>0</span></a>
      ${btn("Book a free site visit", { href: "#contact", className: "hdr__cta", attrs: bookAttrs, arrow: false })}
      <button type="button" class="icon-btn hdr__icon hdr__burger" data-hdr-burger aria-expanded="false" aria-controls="hdr-sheet" aria-label="Open menu">${ICON.menu}</button>
    </div>
  </div>
</header>
<dialog class="hdr-sheet" id="hdr-sheet" aria-label="Menu" data-lenis-prevent>
  <div class="hdr-sheet__panel">
    <div class="hdr-sheet__top">
      <span class="hdr-sheet__logo">${logoSVG({ className: "hdr__logo-svg" })}</span>
      <button type="button" class="icon-btn hdr__icon" data-dialog-close aria-label="Close menu">${ICON.close}</button>
    </div>
    <nav aria-label="Menu">
      <ul class="hdr-sheet__links">${links("hdr-sheet__link")}</ul>
    </nav>
    <div class="hdr-sheet__actions">
      ${btn("Book a free site visit", { href: "#contact", attrs: bookAttrs })}
      <a class="btn btn--glass" href="${fmt.telHref(tel)}" data-hdr-call>${ICON.phone}<span class="btn__label">Call ${fmt.phoneDisplay(tel)}</span></a>
    </div>
  </div>
</dialog>`;
}
