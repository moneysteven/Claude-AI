// Small isomorphic markup helpers shared by sections (Node + browser safe).
import { esc } from "./format.js";

export const ARROW = `<svg class="btn__arrow" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Pill button/link. variant: "primary" | "glass" | "link". Pass href for <a>, else <button>. */
export function btn(label, { href, variant = "primary", attrs = "", arrow = variant !== "link", className = "" } = {}) {
  const cls = `btn btn--${variant}${className ? " " + className : ""}`;
  const inner = `<span class="btn__label">${esc(label)}</span>${arrow ? ARROW : ""}`;
  return href
    ? `<a class="${cls}" href="${esc(href)}" ${attrs}>${inner}</a>`
    : `<button type="button" class="${cls}" ${attrs}>${inner}</button>`;
}

/**
 * Section heading block: outlined aluminium number, eyebrow with hairline,
 * H2, optional intro. `id` is the H2 id for aria-labelledby on the <section>.
 */
export function sectionHead({ num, eyebrow, title, intro = "", id, align = "left" }) {
  return `<header class="section-head section-head--${align}" data-reveal>
  <span class="section-num" aria-hidden="true" data-drift>${esc(num)}</span>
  <p class="eyebrow">${esc(eyebrow)}</p>
  <h2 id="${id}">${title}</h2>
  ${intro ? `<p class="section-intro">${intro}</p>` : ""}
</header>`;
}

/** Star rating as accessible SVG row. */
export function stars(n, max = 5) {
  const star = (on) => `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.7L10 14.8 4.9 17.5l1-5.7-4.1-4 5.7-.8z" fill="${on ? "#F5B301" : "none"}" stroke="${on ? "#F5B301" : "#C9CED6"}" stroke-width="1.2"/></svg>`;
  return `<span class="stars" role="img" aria-label="${n} out of ${max} stars">${Array.from({ length: max }, (_, i) => star(i < n)).join("")}</span>`;
}
