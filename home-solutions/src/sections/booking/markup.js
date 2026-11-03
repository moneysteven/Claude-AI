// Site-visit booking modal (BRIEF §4). Opened by any [data-booking-open]
// click (event delegation) or window 'booking:open' {detail:{need}}.
// Formspree id is TBC -> contact.submitForm falls back to a prefilled email.
// TODO(business): WhatsApp button renders only once BUSINESS.whatsapp is confirmed; Formspree id still TBC.
import { ICON } from "../header/markup.js";

export const NEEDS = [
  ["windows", "Windows"], ["doors", "Doors"], ["showers", "Showers & glass"],
  ["railings", "Railings"], ["blinds", "Blinds"], ["commercial", "Commercial"],
];
const DAY = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };

/** "Nonpariel Road, Negril, Westmoreland" -> "Westmoreland" */
const parish = (b) => b.address.split(",").pop().trim();

export default function booking({ B, fmt, contact }) {
  const closed = Object.keys(DAY).filter((k) => !B.hours[k]).map((k) => DAY[k]);
  const wa = contact.whatsappEnabled(B);
  const viaEmail = !contact.formspreeEndpoint(B);

  return `<dialog class="bk" id="booking" aria-labelledby="bk-title" data-lenis-prevent>
  <div class="bk__panel">
    <button type="button" class="icon-btn bk__close" data-dialog-close aria-label="Close booking form">${ICON.close}</button>

    <form class="bk__form" data-bk-form novalidate action="mailto:${fmt.esc(B.email)}?subject=${encodeURIComponent("Site visit request")}" method="post" enctype="text/plain">
      <header class="bk__head">
        <p class="eyebrow">Free site visit</p>
        <h2 class="bk__title" id="bk-title">Book a free site visit</h2>
        <p class="bk__intro">Tell us what you need and when suits you, and we'll contact you to confirm.</p>
      </header>

      <div class="bk__grid">
        <label class="field">
          <span>Name</span>
          <input name="name" type="text" autocomplete="name" required maxlength="80">
        </label>
        <label class="field">
          <span>Phone</span>
          <input name="phone" type="tel" inputmode="tel" autocomplete="tel" required minlength="7" maxlength="20">
        </label>
        <label class="field bk__wide">
          <span>Parish / nearest branch</span>
          <select name="branch" required>
            <option value="">Choose a branch</option>
            ${B.branches.map((b) => `<option value="${fmt.esc(b.id)}">${fmt.esc(b.name)}, ${fmt.esc(parish(b))}</option>`).join("")}
          </select>
        </label>
        <div class="field">
          <label for="bk-date">Preferred date</label>
          <input id="bk-date" name="date" type="date" required aria-describedby="bk-date-hint bk-date-err">
          <span class="hint" id="bk-date-hint">${closed.length ? `We're closed on ${closed.map((d) => d + "s").join(" and ")}.` : ""}</span>
          <span class="form-error" id="bk-date-err" aria-live="polite"></span>
        </div>
        <fieldset class="field bk__seg">
          <legend>Time of day</legend>
          <div class="bk__seg-row">
            <label class="bk__pill"><input type="radio" name="slot" value="Morning" required checked><span>Morning</span></label>
            <label class="bk__pill"><input type="radio" name="slot" value="Afternoon"><span>Afternoon</span></label>
          </div>
        </fieldset>
        <fieldset class="field bk__wide bk__needs">
          <legend>What you need <span class="bk__opt">(choose any)</span></legend>
          <div class="bk__chips">
            ${NEEDS.map(([id, label]) => `<label class="bk__pill"><input type="checkbox" name="needs" value="${id}" data-label="${fmt.esc(label)}"><span>${fmt.esc(label)}</span></label>`).join("")}
          </div>
        </fieldset>
        <div class="field bk__wide">
          <label for="bk-notes">Notes <span class="bk__opt">(optional)</span></label>
          <textarea id="bk-notes" name="notes" rows="3" maxlength="1000" aria-describedby="bk-notes-hint"></textarea>
          <span class="hint" id="bk-notes-hint">Sizes, number of openings, anything we should know.</span>
        </div>
      </div>

      <p class="form-error" data-bk-error aria-live="assertive"></p>
      <div class="bk__actions">
        <button type="submit" class="btn btn--primary bk__submit"><span class="btn__label">Request site visit</span></button>
        ${wa ? `<button type="button" class="btn btn--glass" data-bk-wa><span class="btn__label">Send via WhatsApp</span></button>` : ""}
      </div>
      ${viaEmail ? `<p class="bk__note">Sending opens your email app with your details filled in, addressed to ${fmt.esc(B.email)}.</p>` : ""}
    </form>

    <div class="bk__done" data-bk-done hidden>
      <svg class="bk__ring" viewBox="0 0 96 96" width="96" height="96" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="bk-alu" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7F8FA"/><stop offset=".38" stop-color="#C9CED6"/><stop offset=".52" stop-color="#FFFFFF"/><stop offset=".7" stop-color="#9AA1AB"/><stop offset="1" stop-color="#EEF0F3"/></linearGradient>
          <clipPath id="bk-reveal"><rect class="bk__reveal" x="0" y="0" width="96" height="96"/></clipPath>
        </defs>
        <circle class="bk__ring-o" cx="48" cy="48" r="42" fill="#fff" stroke="url(#bk-alu)" stroke-width="7"/>
        <circle cx="48" cy="48" r="38.5" fill="none" stroke="#9AA1AB" stroke-opacity=".45" stroke-width="1"/>
        <path class="bk__check" clip-path="url(#bk-reveal)" d="M30 49.5 42.5 61 66 36" fill="none" stroke="#1C8FC2" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <h2 class="bk__title" tabindex="-1" data-bk-done-title>Request ready</h2>
      <p class="bk__done-text" data-bk-done-text></p>
      <div class="bk__actions">
        <a class="btn btn--glass" data-bk-mail hidden href="mailto:${fmt.esc(B.email)}"><span class="btn__label">Open email again</span></a>
        <button type="button" class="btn btn--primary" data-dialog-close><span class="btn__label">Done</span></button>
      </div>
    </div>
  </div>
</dialog>`;
}
