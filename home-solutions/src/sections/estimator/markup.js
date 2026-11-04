// Section 04 "Build your window": quote estimator (BRIEF §4.04, §6.5).
// Build-time markup for the multi-step glass card (enhanced by index.js) plus
// a no-JS fallback (simple mailto form + call/email) shown only without JS.
import { groupProducts, LIMITS } from "./model.js";

const CHEV_L = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M12 5 7 10l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const PLUS = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const MINUS = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 10h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export const STEPS = ["Product", "Material & finish", "Size & quantity", "Your details"];

export default function estimator({ B, sectionHead, btn, fmt, icons, contact, picture }) {
  const { esc } = fmt;
  const groups = groupProducts(B.products);
  const cats = fmt.CATEGORIES.filter((c) => groups.some((g) => g.cat === c.id));
  const catLabel = Object.fromEntries(fmt.CATEGORIES.map((c) => [c.id, c.label]));
  const ho = B.branches.find((b) => /head office/i.test(b.name)) || B.branches[0];
  const viaEmail = !contact.formspreeEndpoint(B);
  const wa = contact.whatsappEnabled(B);
  const branchOptions = B.branches.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join("");

  const steps = STEPS.map((s, i) => `<li class="est-steps__item">
          <button type="button" class="est-steps__btn" data-goto="${i + 1}"${i ? " disabled" : ' aria-current="step"'}>
            <span class="est-steps__num tnum" aria-hidden="true">${i + 1}</span><span class="est-steps__label"><span class="visually-hidden">Step ${i + 1}: </span>${esc(s)}</span>
          </button>
        </li>`).join("\n        ");

  const typeCard = (g) => {
    const mats = g.materials.filter(Boolean);
    const meta = mats.length ? mats.join(" · ") : `${g.products.length} option${g.products.length === 1 ? "" : "s"}`;
    // Branded product photo for the group when one exists (client request); line illustration otherwise.
    const withImg = g.products.find((p) => p.img);
    const photo = withImg ? picture(withImg.img.split("/").pop().replace(/\.(jpe?g|png)$/i, ""), { alt: "", sizes: "160px", imgClass: "est-type__img" }) : "";
    return `<label class="est-type" data-cat="${esc(g.cat)}">
            <input class="est-type__input" type="radio" name="est-type" value="${esc(g.key)}">
            <span class="est-type__icon${photo ? " est-type__icon--photo" : ""}">${photo || icons.productIcon(g.type, { size: 64 })}</span>
            <span class="est-type__text"><span class="est-type__name">${esc(g.label)}</span><span class="est-type__meta">${esc(catLabel[g.cat] || g.cat)} · ${esc(meta)}</span></span>
          </label>`;
  };

  const head = (n, title) => `<header class="est-pane__head">
          <p class="est-pane__kicker">Step ${n} of ${STEPS.length}</p>
          <h3 class="est-pane__title" id="est-h-${n}" tabindex="-1">${esc(title)}</h3>
        </header>`;

  const back = `<button type="button" class="btn btn--link est-back" data-est-back>${CHEV_L}<span class="btn__label">Back</span></button>`;

  // TODO(business): create the Formspree form (BUSINESS.forms.formspreeId) so photos upload with the request;
  // until then requests go by prefilled email and the customer attaches the photo themselves.
  const photoHint = viaEmail
    ? "Optional. Photos can't be sent from this form yet: when your email opens, attach the photo before you press send."
    : "Optional. A photo of the opening helps us quote. JPG or PNG, up to 10 MB.";

  return `<section id="quote" class="section section--light est" aria-labelledby="est-title">
  <div class="container">
    ${sectionHead({
      num: "04",
      eyebrow: "Quote estimator",
      title: "Build your window",
      id: "est-title",
      intro: "Pick a product, finish and size and watch it drawn to scale. Add everything you need, then send the list to your nearest branch for an exact price.",
    })}

    <div class="est-nojs glass">
      <h3 class="est-nojs__title">Request a quote</h3>
      <p>Tell us the products, sizes (width × height in inches), quantities and finishes you need, and we'll send your exact price. You can also email <a href="mailto:${esc(B.email)}">${esc(B.email)}</a> or call ${esc(ho.name)} on <a href="${fmt.telHref(ho.phones[0])}">${fmt.phoneDisplay(ho.phones[0])}</a>. Every branch's number is listed in our <a href="#branches">branch finder</a>.</p>
      <form class="est-nojs__form" action="mailto:${esc(B.email)}?subject=${encodeURIComponent("Quote request")}" method="post" enctype="text/plain">
        <label class="field"><span>Name</span><input name="name" type="text" autocomplete="name" required maxlength="80"></label>
        <label class="field"><span>Phone</span><input name="phone" type="tel" autocomplete="tel" required maxlength="20"></label>
        <label class="field"><span>Nearest branch</span><select name="branch" required><option value="">Choose a branch</option>${branchOptions}</select></label>
        <label class="field est-nojs__wide"><span>What you need</span><textarea name="request" required rows="4" placeholder="For example: 2 × uPVC Friction Casement, 36 × 48 in, White"></textarea></label>
        <button type="submit" class="btn btn--primary est-nojs__wide"><span class="btn__label">Email my request</span></button>
      </form>
    </div>

    <div class="est-app" data-est>
      <form class="est-card glass" data-est-form novalidate aria-labelledby="est-title">
        <nav class="est-steps-wrap" aria-label="Estimator steps">
          <ol class="est-steps">
        ${steps}
          </ol>
          <span class="est-steps__bar" aria-hidden="true"><span class="est-steps__fill" data-est-fill></span></span>
        </nav>
        <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-est-live></p>

        <div class="est-pane" data-pane="1" role="group" aria-labelledby="est-h-1">
          ${head(1, "Choose a product")}
          <div class="est-chips" role="group" aria-label="Show product types for">
            <button type="button" class="est-chip" data-est-cat="all" aria-pressed="true">All</button>
            ${cats.map((c) => `<button type="button" class="est-chip" data-est-cat="${c.id}" aria-pressed="false">${esc(c.label)}</button>`).join("\n            ")}
          </div>
          <fieldset class="est-fs">
            <legend class="visually-hidden">Product type</legend>
            <div class="est-types">
          ${groups.map(typeCard).join("\n          ")}
            </div>
          </fieldset>
          <p class="form-error" data-est-err="1" aria-live="polite"></p>
          <div class="est-pane__foot">
            <button type="button" class="btn btn--link" data-goto="4" data-est-skip hidden><span class="btn__label">Skip to your details</span></button>
            <button type="button" class="btn btn--primary" data-est-next><span class="btn__label">Next: material &amp; finish</span></button>
          </div>
        </div>

        <div class="est-pane" data-pane="2" role="group" aria-labelledby="est-h-2" hidden>
          ${head(2, "Material & finish")}
          <fieldset class="est-fs" data-est-matfs>
            <legend class="est-legend">Material</legend>
            <div class="est-pills" data-est-mats></div>
          </fieldset>
          <fieldset class="est-fs" data-est-modelfs>
            <legend class="est-legend">Model</legend>
            <div class="est-models" data-est-models></div>
          </fieldset>
          <fieldset class="est-fs" data-est-finfs>
            <legend class="est-legend" data-est-finlegend>Finish</legend>
            <div class="est-pills" data-est-finishes></div>
          </fieldset>
          <p class="est-muted" data-est-nofinish hidden>No frame finish to choose for this product.</p>
          <p class="form-error" data-est-err="2" aria-live="polite"></p>
          <div class="est-pane__foot">${back}<button type="button" class="btn btn--primary" data-est-next><span class="btn__label">Next: size</span></button></div>
        </div>

        <div class="est-pane" data-pane="3" role="group" aria-labelledby="est-h-3" hidden>
          ${head(3, "Size & quantity")}
          <p class="est-selected" data-est-selected></p>
          <div class="est-size">
            <figure class="est-pv-fig">
              <svg class="est-pv" viewBox="0 0 120 96" role="img" aria-labelledby="est-pv-t" focusable="false">
                <title id="est-pv-t" data-est-pvdesc>Preview drawn to scale</title>
                <defs>
                  <pattern id="est-grid" patternUnits="userSpaceOnUse" width="12" height="12"><path d="M12 0H0V12" fill="none" stroke="#C9CED6" stroke-width=".3"/></pattern>
                  <linearGradient id="est-glassg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#E8F6FC"/><stop offset=".5" stop-color="#CFEAF7"/><stop offset="1" stop-color="#F2FAFE"/>
                  </linearGradient>
                  <linearGradient id="est-alu" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#F7F8FA"/><stop offset=".38" stop-color="#D9DEE4"/><stop offset=".52" stop-color="#FFFFFF"/><stop offset=".70" stop-color="#C9CED6"/><stop offset="1" stop-color="#EEF0F3"/>
                  </linearGradient>
                  <pattern id="est-wood" patternUnits="userSpaceOnUse" width="3" height="40">
                    <rect width="3" height="40" fill="#8A5A3B"/><path d="M.6 0C1.1 10 .2 22 .8 40M2.1 0C1.8 14 2.5 26 2.2 40" fill="none" stroke="#3B2314" stroke-opacity=".35" stroke-width=".25"/>
                  </pattern>
                </defs>
                <g transform="translate(60 90)">
                  <g data-est-cam>
                    <rect x="-1200" y="-1200" width="2400" height="1200" fill="url(#est-grid)"/>
                    <g class="est-pv-win" data-est-win></g>
                  </g>
                  <path d="M-70 0H70" class="est-pv-ground"/>
                </g>
              </svg>
              <figcaption class="est-pv-cap"><span class="tnum" data-est-dims></span><span class="est-muted" data-est-scale>1 square = 1 ft</span></figcaption>
            </figure>
            <div class="est-size__fields">
              <div class="est-dims">
                <label class="field"><span>Width (inches)</span><input type="number" inputmode="decimal" name="w" min="${LIMITS.w[0]}" max="${LIMITS.w[1]}" step="0.25" required data-est-w aria-describedby="est-size-hint est-size-err"></label>
                <span class="est-dims__x" aria-hidden="true">×</span>
                <label class="field"><span>Height (inches)</span><input type="number" inputmode="decimal" name="h" min="${LIMITS.h[0]}" max="${LIMITS.h[1]}" step="0.25" required data-est-h aria-describedby="est-size-hint est-size-err"></label>
              </div>
              <p class="hint est-hint" id="est-size-hint" data-est-sizehint>Measure the opening. ${LIMITS.w[0]}–${LIMITS.w[1]} in wide, ${LIMITS.h[0]}–${LIMITS.h[1]} in high. Larger? Add a note in step 4.</p>
              <div class="field">
                <label for="est-qty">Quantity</label>
                <div class="est-stepper">
                  <button type="button" class="est-stepper__btn" data-est-qty="-1" aria-label="Decrease quantity">${MINUS}</button>
                  <input id="est-qty" class="tnum" type="number" inputmode="numeric" name="qty" min="${LIMITS.qty[0]}" max="${LIMITS.qty[1]}" step="1" value="1" data-est-qtyin>
                  <button type="button" class="est-stepper__btn" data-est-qty="1" aria-label="Increase quantity">${PLUS}</button>
                </div>
              </div>
              <p class="form-error" id="est-size-err" data-est-err="3" aria-live="polite"></p>
            </div>
          </div>
          <div class="est-pane__foot">${back}<button type="button" class="btn btn--primary" data-est-add>${PLUS}<span class="btn__label">Add this item</span></button></div>
        </div>

        <div class="est-pane" data-pane="4" role="group" aria-labelledby="est-h-4" hidden>
          ${head(4, "Your details")}
          <div class="est-form-body" data-est-body>
            <div class="est-grid">
              <label class="field est-wide"><span>Nearest branch</span><select name="branch" required data-est-req><option value="">Choose a branch</option>${branchOptions}</select></label>
              <label class="field"><span>Name</span><input name="name" type="text" autocomplete="name" required maxlength="80" data-est-req></label>
              <label class="field"><span>Phone</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" required minlength="7" maxlength="20" data-est-req></label>
              <label class="field est-wide"><span>Email <span class="est-opt">(optional)</span></span><input name="email" type="email" autocomplete="email" maxlength="120" data-est-req></label>
              <label class="field est-wide"><span>Notes <span class="est-opt">(optional)</span></span><textarea name="notes" rows="3" maxlength="1000"></textarea></label>
              <div class="field est-wide">
                <label for="est-photo">Photo of the opening <span class="est-opt">(optional)</span></label>
                <input id="est-photo" class="est-file" name="photo" type="file" accept="image/*" aria-describedby="est-photo-hint" data-est-photo>
                <span class="hint" id="est-photo-hint">${esc(photoHint)}</span>
              </div>
            </div>
            <p class="form-error" data-est-err="4" aria-live="polite"></p>
            <div class="est-pane__foot">${back}
              <div class="est-send">
                ${wa ? `<button type="button" class="btn btn--glass" data-est-wa><span class="btn__label">Send on WhatsApp</span></button>` : ""}
                <button type="submit" class="btn btn--primary" data-est-submit><span class="btn__label">Send quote request</span></button>
              </div>
            </div>
          </div>
          <div class="est-done" data-est-done hidden>
            <span class="est-done__ring" aria-hidden="true"><svg viewBox="0 0 48 48" width="48" height="48"><path d="M14 25l7 7 13-15" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            <h3 class="est-done__title" tabindex="-1" data-est-donetitle>Request ready</h3>
            <p data-est-donetext></p>
            <div class="est-done__actions">
              <a class="btn btn--glass" data-est-mail hidden href="mailto:${esc(B.email)}"><span class="btn__label">Open the email again</span></a>
              <button type="button" class="btn btn--link" data-est-clear><span class="btn__label">Clear my quote</span></button>
              <button type="button" class="btn btn--link" data-est-restart><span class="btn__label">Start a new quote</span></button>
            </div>
          </div>
        </div>
      </form>

      <aside class="est-summary glass" aria-labelledby="est-sum-title" data-light>
        <div class="est-summary__head">
          <h3 class="est-summary__title" id="est-sum-title">Your quote</h3>
          <span class="est-summary__count tnum" data-est-count>0 items</span>
        </div>
        <p class="est-muted est-summary__empty" data-est-empty>No items yet. Build one here, or tap + on any product above.</p>
        <ul class="est-lines" role="list" data-est-lines></ul>
        <div class="est-total" data-est-total hidden></div>
        <div class="est-summary__actions">
          <button type="button" class="btn btn--link" data-est-another hidden><span class="btn__label">Add another item</span></button>
          <button type="button" class="btn btn--glass" data-goto="4" data-est-tod hidden><span class="btn__label">Continue to your details</span></button>
        </div>
      </aside>
    </div>
  </div>
</section>`;
}
