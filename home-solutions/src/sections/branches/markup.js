// Section 10 Branch finder (BRIEF §4.10, §6.8). Build-time markup: the full branch
// list (name, address, tap-to-call per phone, fax, Directions) renders without JS.
// index.js adds: lazy Leaflet map (+ Jamaica outline fallback), open-now badges,
// "Use my location" distance sort, card <-> pin selection and 'branches:focus'.
// The map column is hidden without JS (html.js class).
import { directionsUrl } from "./util.js";

const PIN = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M10 18s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="10" cy="8" r="2.2" fill="currentColor"/></svg>`;
const PHONE = `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M6.6 2.5 8.4 6 6.9 7.6a10 10 0 0 0 5.5 5.5L14 11.6l3.5 1.8-.6 3a1.6 1.6 0 0 1-1.7 1.3A14 14 0 0 1 2.3 4.8a1.6 1.6 0 0 1 1.3-1.7Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const NAV = `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M17 3 3 9l6 2 2 6 6-14Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const LOC = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="3" fill="currentColor"/><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 1v3M10 16v3M1 10h3M16 10h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;


export default function branches(ctx) {
  const { B, picture, sectionHead, fmt } = ctx;
  const { esc, telHref, phoneDisplay } = fmt;

  // TODO(business): branches with approx:true have town-level pins only; confirm exact locations.
  const card = (b) => `<li class="br-card alu-card" data-br-card="${esc(b.id)}" data-light>
        <div class="br-card__top">
          <h3 class="br-card__name" id="br-name-${esc(b.id)}">${esc(b.name)}</h3>
          <span class="br-status" data-br-status hidden></span>
        </div>
        <p class="br-card__addr">${esc(b.address)}<span class="br-dist tnum" data-br-dist hidden></span></p>
        <div class="br-card__phones">
          ${b.phones.map((p) => `<a class="br-tel" href="${telHref(p)}" aria-label="Call ${esc(b.name)}, ${phoneDisplay(p)}">${PHONE}<span class="tnum">${phoneDisplay(p)}</span></a>`).join("\n          ")}
        </div>
        ${b.fax ? `<p class="br-card__fax">Fax <span class="tnum">${esc(b.fax)}</span></p>` : ""}
        <div class="br-card__actions">
          <a class="br-link" href="${esc(directionsUrl(b))}" target="_blank" rel="noopener">${NAV}<span>Directions<span class="visually-hidden"> to ${esc(b.name)} (opens Google Maps)</span></span></a>
          <button type="button" class="br-link br-show" data-br-show aria-pressed="false" aria-describedby="br-name-${esc(b.id)}" hidden>${PIN}<span>Show on map</span></button>
        </div>
      </li>`;

  return `<section id="branches" class="section br" aria-labelledby="br-title">
  <div class="br-hero" aria-hidden="true">
    ${picture("photo-tropical-villa-aerial", { alt: "", sizes: "100vw", className: "br-hero__pic", imgClass: "br-hero__img" })}
  </div>
  <div class="container">
    ${sectionHead({
      num: "10",
      eyebrow: "Branch finder",
      title: `${B.branches.length} branches across western &amp; central Jamaica`,
      intro: "Find the branch nearest you, tap to call, or get directions. Our head office is in Negril.",
      id: "br-title",
    })}
    <div class="br-tools" data-br-tools hidden>
      <button type="button" class="btn btn--glass br-locate" data-br-locate>${LOC}<span class="btn__label">Use my location</span></button>
      <p class="br-msg" data-br-msg role="status" aria-live="polite"></p>
    </div>
    <div class="br-layout">
      <div class="br-map-wrap" data-br-map-wrap>
        <div class="br-map" data-br-map role="region" aria-label="Map of ${B.branches.length} branch locations"></div>
        <p class="br-map__note">Pins marked with a dashed ring are approximate (town level).</p>
      </div>
      <ul class="br-list" role="list" data-br-list data-reveal-stagger>
      ${B.branches.map(card).join("\n      ")}
      </ul>
    </div>
  </div>
</section>`;
}
