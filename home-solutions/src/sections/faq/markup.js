// Section 11 FAQ (BRIEF §4.11). Build-time markup from ./data.js (shared with
// the FAQPage JSON-LD). Accordion: <h3><button aria-expanded aria-controls>
// + region panel. Without JS (no html.js class) every answer is visible; with JS,
// CSS collapses closed panels (grid-template-rows 0fr -> 1fr) and index.js toggles.
import { faqItems } from "./data.js";

export default function faq(ctx) {
  const { B, sectionHead, fmt } = ctx;
  const items = faqItems(B);
  const item = (it, i) => `<div class="faq-item${i === 0 ? " is-open" : ""}" data-faq-item>
      <h3 class="faq-q">
        <button type="button" class="faq-btn" id="faq-btn-${it.id}" aria-expanded="true" aria-controls="faq-panel-${it.id}" data-faq-btn>
          <span class="faq-btn__text">${fmt.esc(it.q)}</span>
          <span class="faq-btn__icon" aria-hidden="true"></span>
        </button>
      </h3>
      <div class="faq-panel" id="faq-panel-${it.id}" role="region" aria-labelledby="faq-btn-${it.id}">
        <div class="faq-panel__inner"><div class="faq-a">${it.html}</div></div>
      </div>
    </div>`;

  return `<section id="faq" class="section section--light faq" aria-labelledby="faq-title">
  <div class="container faq-grid">
    ${sectionHead({
      num: "11",
      eyebrow: "Questions",
      title: "Good to know",
      intro: `Quick answers about materials, finishes, prices and where to find us. Still unsure? <a href="#branches">Call your nearest branch</a>.`,
      id: "faq-title",
    })}
    <div class="faq-list alu-card" data-faq data-reveal>
    ${items.map(item).join("\n    ")}
    </div>
  </div>
</section>`;
}
