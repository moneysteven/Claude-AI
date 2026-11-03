// Section 04 estimator behaviour: 4-step glass card (product -> material &
// finish -> size & qty with a to-scale SVG preview -> details), a live quote
// summary bound to the shared basket (lib/quote.js), and submission via
// contact.submitForm (Formspree, else a prefilled email). WhatsApp only when
// BUSINESS.whatsapp is confirmed.
import { productIcon, iconTypeFor } from "../../lib/icons.js";
import { esc, moneyJMD, priceLabel, phoneDisplay } from "../../lib/format.js";
import { submitForm, waLink, whatsappEnabled, formspreeEndpoint } from "../../lib/contact.js";
import { groupProducts, finishesFor, fixedSize, defaultSize, displayName, lineText, previewColour, drawPreview, LIMITS } from "./model.js";

const STEP_NAMES = ["Choose a product", "Material and finish", "Size and quantity", "Your details"];
const MAX_PHOTO = 10 * 1024 * 1024;

export default function init(ctx) {
  const root = document.getElementById("quote");
  const app = root?.querySelector("[data-est]");
  if (!app) return;
  const { B, gsap, reduced, EASE, quote, getLenis } = ctx;

  const $ = (s, r = app) => r.querySelector(s);
  const $$ = (s, r = app) => [...r.querySelectorAll(s)];
  const form = $("[data-est-form]");
  const panes = $$(".est-pane");
  const stepBtns = $$(".est-steps__btn");
  const live = $("[data-est-live]");
  const groups = groupProducts(B.products);
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const byId = new Map(B.products.map((p) => [p.id, p]));
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const D = (s) => (reduced ? 0 : s);

  const S = { step: 1, group: null, material: null, product: null, finish: null, prefFinish: null, w: 36, h: 48, qty: 1, sizeFor: null };

  const announce = (msg) => { live.textContent = ""; requestAnimationFrame(() => { live.textContent = msg; }); };
  const err = (n, msg = "") => { const e = $(`[data-est-err="${n}"]`); if (e) e.textContent = msg; };

  // ---------------------------------------------------------------- steps
  const canReach = (n) => n === 1 || (n === 2 && !!S.group) || (n === 3 && !!S.product) || (n === 4 && quote.count() > 0);

  function paintSteps() {
    stepBtns.forEach((b) => {
      const n = Number(b.dataset.goto);
      b.disabled = !canReach(n) && n !== S.step;
      b.classList.toggle("is-done", n < S.step);
      if (n === S.step) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    gsap.to($("[data-est-fill]"), { scaleX: (S.step - 1) / (STEP_NAMES.length - 1), duration: D(0.5), ease: EASE.out });
    $("[data-est-skip]").hidden = !quote.count();
    $("[data-est-tod]").hidden = !quote.count() || S.step === 4;
  }

  function goTo(n, { focus = true } = {}) {
    if (n === S.step) return;
    const from = panes[S.step - 1], to = panes[n - 1];
    const dir = n > S.step ? 1 : -1;
    S.step = n;
    if (n === 3) renderSize(true);
    gsap.killTweensOf([from, to]);
    from.hidden = true;
    gsap.set(from, { clearProps: "opacity,transform" });
    to.hidden = false;
    if (!reduced) gsap.fromTo(to, { opacity: 0, x: 24 * dir }, { opacity: 1, x: 0, duration: 0.45, ease: EASE.out, clearProps: "opacity,transform" });
    paintSteps();
    announce(`Step ${n} of ${STEP_NAMES.length}: ${STEP_NAMES[n - 1]}`);
    if (focus) {
      const card = form.getBoundingClientRect();
      if (card.top < 0) {
        const lenis = getLenis();
        if (lenis) lenis.scrollTo(form, { offset: -88, duration: 0.8 });
        else form.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      }
      $(`#est-h-${n}`)?.focus({ preventScroll: true });
    }
  }

  function validate(n) {
    err(n);
    if (n === 1 && !S.group) { err(1, "Choose a product type to continue."); $(".est-type:not([hidden]) input")?.focus(); return false; }
    if (n === 2 && !S.product) { err(2, "Choose a material and model to continue."); return false; }
    if (n === 2 && finishesFor(S.product, B).list.length && !S.finish) { err(2, "Choose a finish to continue."); return false; }
    if (n === 3) return validSize(true);
    return true;
  }

  function next() {
    if (S.step >= 3 || !validate(S.step)) return;
    goTo(S.step + 1);
  }

  app.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t || !app.contains(t)) return;
    if (t.matches("[data-est-next]")) next();
    else if (t.matches("[data-est-back]")) goTo(Math.max(1, S.step - 1));
    else if (t.matches("[data-goto]")) {
      const n = Number(t.dataset.goto);
      if (canReach(n)) { resetDone(); goTo(n); }
    } else if (t.matches("[data-est-cat]")) filterCat(t.dataset.estCat);
    else if (t.matches("[data-est-qty]")) setQty(S.qty + Number(t.dataset.estQty));
    else if (t.matches("[data-est-add]")) addItem();
    else if (t.matches("[data-est-another]")) { resetDone(); goTo(1); }
    else if (t.matches("[data-line]")) lineAction(t);
    else if (t.matches("[data-est-wa]")) sendWhatsApp();
    else if (t.matches("[data-est-clear]")) { quote.clear(); announce("Your quote is now empty."); }
    else if (t.matches("[data-est-restart]")) { resetDone(); goTo(1); }
  });

  // Enter inside steps 1-3 means "next", not submit.
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && S.step < 4 && e.target.matches("input")) {
      e.preventDefault();
      if (S.step === 3) addItem(); else next();
    }
  });

  // ---------------------------------------------------------------- step 1
  const chips = $$("[data-est-cat]");
  const typeCards = $$(".est-type");
  function filterCat(cat) {
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.estCat === cat)));
    const show = typeCards.filter((c) => cat === "all" || c.dataset.cat === cat);
    typeCards.forEach((c) => { c.hidden = !show.includes(c); });
    if (!reduced) gsap.fromTo(show, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: EASE.ui, stagger: 0.03, clearProps: "opacity,transform" });
    announce(`${plural(show.length, "product type")} shown`);
  }
  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "est-type") selectGroup(t.value);
    else if (t.name === "est-mat") selectMaterial(t.value);
    else if (t.name === "est-model") selectProduct(t.value);
    else if (t.name === "est-finish") { S.finish = t.value; err(2); renderPreview(false); }
  });

  // ---------------------------------------------------------------- step 2
  const matFs = $("[data-est-matfs]"), modelFs = $("[data-est-modelfs]"), finFs = $("[data-est-finfs]");
  const pill = (name, value, label, checked, extra = "") =>
    `<label class="est-pill"${extra}><input type="radio" name="${name}" value="${esc(value)}"${checked ? " checked" : ""}><span>${label}</span></label>`;

  function selectGroup(key, { material, productId } = {}) {
    S.group = byKey.get(key) || null;
    if (!S.group) return;
    err(1);
    const mats = S.group.materials;
    selectMaterial(material && mats.includes(material) ? material : mats.includes(S.material) ? S.material : mats[0], { productId });
    paintSteps();
  }

  function selectMaterial(mat, { productId } = {}) {
    S.material = mat;
    const g = S.group, mats = g.materials;
    matFs.hidden = mats.length < 2 && !mats[0];
    $("[data-est-mats]").innerHTML = mats.map((m) => pill("est-mat", m, esc(m || "Standard"), m === mat)).join("");
    const models = g.products.filter((p) => (p.material || "") === mat);
    const keep = models.find((p) => p.id === productId) || models.find((p) => p.id === S.product?.id) || models[0];
    modelFs.hidden = models.length < 2;
    $("[data-est-models]").innerHTML = models.map((p) => `<label class="est-model"><input type="radio" name="est-model" value="${esc(p.id)}"${p === keep ? " checked" : ""}>
      <span class="est-model__name">${esc(displayName(p))}</span>
      ${p.spec ? `<span class="est-model__spec">${esc(p.spec)}</span>` : ""}
      <span class="est-model__price${typeof p.priceJMD === "number" ? " is-priced tnum" : ""}">${esc(priceLabel(p))}</span></label>`).join("");
    selectProduct(keep.id);
  }

  function selectProduct(id) {
    const p = byId.get(id);
    if (!p) return;
    const changed = S.product?.id !== p.id;
    S.product = p;
    err(2);
    const { kind, list } = finishesFor(p, B);
    if (!list.includes(S.finish)) S.finish = list.includes(S.prefFinish) ? S.prefFinish : list[0] || null;
    finFs.hidden = !list.length;
    $("[data-est-nofinish]").hidden = !!list.length;
    $("[data-est-finlegend]").textContent = kind ? `${kind} finishes` : "Finish";
    $("[data-est-finishes]").innerHTML = list.map((f) => pill("est-finish", f, `<i class="est-dot" style="--sw:${B.finishes.swatches[f] || "#ccc"}"></i>${esc(f)}`, f === S.finish, /wood/i.test(f) ? ' data-tex="wood"' : /anodi/i.test(f) ? ' data-tex="alu"' : "")).join("");
    // Size: fixed-size products use their listed size; otherwise keep the user's size within the same type.
    const fixed = fixedSize(p), type = iconTypeFor(p);
    if (fixed || (changed && S.sizeFor !== type)) { const d = defaultSize(p, type); S.w = d.w; S.h = d.h; }
    S.sizeFor = fixed ? null : type;
    if (S.step === 3) renderSize(false);
    paintSteps();
  }

  window.addEventListener("estimator:prefill", (e) => {
    const f = e.detail?.finish;
    if (!f) return;
    S.prefFinish = f;
    if (S.product && finishesFor(S.product, B).list.includes(f)) { S.finish = f; selectProduct(S.product.id); }
  });

  // ---------------------------------------------------------------- step 3
  const wIn = $("[data-est-w]"), hIn = $("[data-est-h]"), qIn = $("[data-est-qtyin]");
  const cam = $("[data-est-cam]"), win = $("[data-est-win]");
  const ftIn = (n) => { const ft = Math.floor(n / 12), i = +(n - ft * 12).toFixed(2); return `${ft}′ ${i}″`; };
  let drawn = null; // {w,h,k}

  function renderSize(fresh) {
    const p = S.product;
    if (!p) return;
    const fixed = fixedSize(p);
    wIn.value = S.w; hIn.value = S.h;
    wIn.readOnly = hIn.readOnly = !!fixed;
    $("[data-est-sizehint]").textContent = fixed
      ? `${p.name} comes in this listed size.`
      : `Measure the opening. ${LIMITS.w[0]}–${LIMITS.w[1]} in wide, ${LIMITS.h[0]}–${LIMITS.h[1]} in high. Larger? Add a note in step 4.`;
    const sel = [displayName(p), S.finish, typeof p.priceJMD === "number" ? `${moneyJMD(p.priceJMD)} each` : "Price on request"].filter(Boolean);
    $("[data-est-selected]").textContent = sel.join(" · ");
    qIn.value = S.qty;
    renderPreview(!fresh);
  }

  const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));
  function renderPreview(animate = true) {
    const p = S.product;
    if (!p) return;
    const w = clamp(Number(S.w) || 0, LIMITS.w), h = clamp(Number(S.h) || 0, LIMITS.h);
    const type = iconTypeFor(p);
    const k = Math.min(1, 108 / w, 82 / h);
    win.style.setProperty("--est-frame", previewColour(p, S.finish, B));
    win.dataset.tex = /wood/i.test(S.finish || "") ? "wood" : /anodi/i.test(S.finish || "") ? "alu" : "";
    // Current on-screen size (mid-tween aware) so the new drawing grows from where the old one was.
    const sx = drawn ? drawn.w * gsap.getProperty(win, "scaleX") : w, sy = drawn ? drawn.h * gsap.getProperty(win, "scaleY") : h;
    const pk = drawn ? gsap.getProperty(cam, "scaleX") : k;
    gsap.killTweensOf([win, cam]);
    win.innerHTML = drawPreview(type, w, h, p);
    drawn = { w, h };
    const d = animate ? D(0.55) : 0;
    gsap.fromTo(win, { scaleX: sx / w, scaleY: sy / h, svgOrigin: "0 0" }, { scaleX: 1, scaleY: 1, svgOrigin: "0 0", duration: d, ease: EASE.out });
    gsap.fromTo(cam, { scale: pk, svgOrigin: "0 0" }, { scale: k, svgOrigin: "0 0", duration: d, ease: EASE.out });
    $("[data-est-dims]").textContent = `${w}″ × ${h}″ (${ftIn(w)} × ${ftIn(h)})`;
    $("[data-est-scale]").textContent = k < 1 ? "Zoomed out · 1 square = 1 ft" : "1 square = 1 ft";
    $("[data-est-pvdesc]").textContent = `${displayName(p)}, ${w} by ${h} inches${S.finish ? `, ${S.finish} finish` : ""}, drawn to scale`;
  }

  function validSize(focusBad) {
    err(3);
    const checks = [[wIn, "width", LIMITS.w], [hIn, "height", LIMITS.h], [qIn, "quantity", LIMITS.qty]];
    for (const [el, label, [a, b]] of checks) {
      const v = Number(el.value);
      const ok = el.value !== "" && Number.isFinite(v) && v >= a && v <= b && (label !== "quantity" || Number.isInteger(v));
      el.setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok) {
        err(3, `Enter a ${label} between ${a} and ${b}${label === "quantity" ? "" : " inches"}.`);
        if (focusBad) el.focus();
        return false;
      }
    }
    return true;
  }

  let typing = 0;
  const onDim = () => {
    S.w = wIn.value; S.h = hIn.value;
    clearTimeout(typing);
    typing = setTimeout(() => { if (Number(S.w) && Number(S.h)) renderPreview(true); }, 120);
  };
  wIn.addEventListener("input", onDim);
  hIn.addEventListener("input", onDim);
  [wIn, hIn].forEach((el) => el.addEventListener("blur", () => { if (el.value !== "") validSize(false); }));

  function setQty(v) {
    S.qty = clamp(Math.round(Number(v)) || 1, LIMITS.qty);
    qIn.value = S.qty;
  }
  qIn.addEventListener("change", () => setQty(qIn.value));

  function addItem() {
    if (!validate(1) || !validate(2) || !validSize(true)) return;
    const p = S.product;
    S.w = Number(wIn.value); S.h = Number(hIn.value); setQty(qIn.value);
    const line = { productId: p.id, name: p.name, material: p.material || "", cat: p.cat, w: S.w, h: S.h, qty: S.qty };
    if (S.finish) line.finish = S.finish;
    if (typeof p.priceJMD === "number") line.priceJMD = p.priceJMD;
    quote.add(line);
    announce(`Added ${lineText(line).slice(2)}. ${plural(quote.count(), "item")} in your quote.`);
    const sum = $(".est-summary");
    if (!reduced) gsap.fromTo(sum, { scale: 0.985 }, { scale: 1, duration: 0.5, ease: "back.out(3)", clearProps: "transform" });
    setQty(1);
    goTo(4);
  }

  // ---------------------------------------------------------------- summary
  const linesEl = $("[data-est-lines]"), totalEl = $("[data-est-total]");
  const src = String(B.priceSource).replace(/\.\s*$/, "");

  function renderSummary(items = quote.getItems()) {
    const active = document.activeElement;
    const restore = active && linesEl.contains(active) ? { key: active.dataset.key, act: active.dataset.line } : null;
    const n = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    const sub = quote.subtotal(items);
    $("[data-est-count]").textContent = plural(n, "item");
    $("[data-est-empty]").hidden = !!items.length;
    $("[data-est-another]").hidden = !items.length;
    linesEl.innerHTML = items.map((it) => {
      const nm = displayName(it);
      const meta = [it.w && it.h ? `${it.w}″ × ${it.h}″` : "Size to confirm", it.finish].filter(Boolean).join(" · ");
      return `<li class="est-line">
        <span class="est-line__icon">${productIcon(iconTypeFor({ name: it.name, id: it.productId, cat: it.cat }), { size: 44 })}</span>
        <span class="est-line__text"><span class="est-line__name">${esc(nm)}</span><span class="est-line__meta">${esc(meta)}</span></span>
        <span class="est-line__qty">
          <button type="button" class="est-mini" data-line="dec" data-key="${esc(it.key)}" aria-label="Decrease quantity of ${esc(nm)}"${it.qty <= 1 ? " disabled" : ""}>−</button>
          <span class="tnum" aria-label="Quantity ${it.qty}">${it.qty}</span>
          <button type="button" class="est-mini" data-line="inc" data-key="${esc(it.key)}" aria-label="Increase quantity of ${esc(nm)}"${it.qty >= LIMITS.qty[1] ? " disabled" : ""}>+</button>
        </span>
        ${sub !== null ? `<span class="est-line__price tnum">${esc(moneyJMD(it.priceJMD * it.qty))}</span>` : ""}
        <button type="button" class="est-mini est-mini--rm" data-line="rm" data-key="${esc(it.key)}" aria-label="Remove ${esc(nm)} from quote"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </li>`;
    }).join("");
    totalEl.hidden = !items.length;
    totalEl.innerHTML = sub !== null
      ? `<p class="est-total__row"><span>Supply subtotal</span><strong class="tnum">${esc(moneyJMD(sub))}</strong></p><p class="est-total__note">Supply price from ${esc(src)}. Installation, delivery and GCT quoted separately.</p>`
      : `<p class="est-total__tbc"><strong>Estimate: TBC. We'll send your exact price</strong></p>`;
    if (restore) {
      const el = linesEl.querySelector(`[data-key="${CSS.escape(restore.key || "")}"][data-line="${restore.act}"]`);
      (el && !el.disabled ? el : $(".est-summary__title"))?.focus?.({ preventScroll: true });
    }
    if (!items.length && S.step === 4 && $("[data-est-done]").hidden) goTo(1, { focus: false });
    paintSteps();
  }
  $(".est-summary__title").tabIndex = -1;

  function lineAction(b) {
    const it = quote.getItems().find((i) => i.key === b.dataset.key);
    if (!it) return;
    const act = b.dataset.line;
    if (act === "rm") { quote.remove(it.key); announce(`Removed ${displayName(it)}.`); }
    else quote.update(it.key, { qty: clamp(it.qty + (act === "inc" ? 1 : -1), LIMITS.qty) });
  }

  quote.onChange((d) => renderSummary(d?.items));

  // ---------------------------------------------------------------- step 4
  const photo = $("[data-est-photo]");
  function collect() {
    const f = form.elements;
    const branch = B.branches.find((b) => b.id === f.branch.value);
    const items = quote.getItems();
    const sub = quote.subtotal(items);
    const fields = {
      name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(),
      branch: branch?.name || "", notes: f.notes.value.trim(),
      items: items.map(lineText).join("\n"),
      estimate: sub !== null ? `${moneyJMD(sub)} supply subtotal (installation, delivery and GCT quoted separately)` : "TBC",
    };
    const file = photo.files?.[0];
    const text = [
      `Hi ${B.name}, quote request:`,
      fields.items,
      sub !== null ? `Supply subtotal: ${moneyJMD(sub)} (installation, delivery and GCT quoted separately)` : "",
      "",
      `Name: ${fields.name}  Branch: ${fields.branch}`,
      `Phone: ${fields.phone}`,
      fields.email ? `Email: ${fields.email}` : "",
      fields.notes ? `Notes: ${fields.notes}` : "",
    ].filter((l, i, a) => l || (i > 0 && a[i - 1])).join("\n").trimEnd();
    return { fields, text, file };
  }

  function validateDetails() {
    err(4);
    if (!quote.count()) { err(4, "Your quote is empty. Add at least one item first."); return false; }
    const f = form.elements;
    const checks = [
      [f.branch, () => !!f.branch.value, "Choose your nearest branch."],
      [f.name, () => f.name.value.trim().length >= 2, "Enter your name."],
      [f.phone, () => f.phone.value.replace(/\D/g, "").length >= 7, "Enter a phone number we can call."],
      [f.email, () => !f.email.value.trim() || f.email.checkValidity(), "Check your email address, or leave it blank."],
      [photo, () => !photo.files?.[0] || (photo.files[0].size <= MAX_PHOTO && /^image\//.test(photo.files[0].type)), "Photos must be an image up to 10 MB."],
    ];
    for (const [el, ok, msg] of checks) {
      const good = ok();
      el.setAttribute("aria-invalid", good ? "false" : "true");
      if (!good) { err(4, msg); el.focus(); return false; }
    }
    return true;
  }

  async function send({ fields, text, file }) {
    const subject = `Quote request: ${fields.name} (${fields.branch})`;
    const endpoint = formspreeEndpoint(B);
    if (endpoint && file) {
      // Photo uploads need multipart: only possible with Formspree.
      try {
        const fd = new FormData();
        fd.append("_subject", subject);
        Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
        fd.append("photo", file);
        const res = await fetch(endpoint, { method: "POST", body: fd, headers: { Accept: "application/json" } });
        if (res.ok) return { method: "formspree", ok: true };
      } catch { /* fall back below */ }
    }
    const withPhoto = file && !endpoint ? `${text}\n\nPhoto: I'll attach ${file.name} to this email.` : text;
    return submitForm(B, { subject, fields, text: withPhoto });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (S.step !== 4) return;
    if (!validateDetails()) return;
    const data = collect();
    const b = $("[data-est-submit]");
    b.disabled = true;
    const res = await send(data);
    b.disabled = false;
    done(res, data);
  });

  function sendWhatsApp() {
    if (!whatsappEnabled(B) || !validateDetails()) return;
    const data = collect();
    window.open(waLink(B, data.text), "_blank", "noopener");
    done({ method: "whatsapp" }, data);
  }

  function done(res, { fields, file }) {
    const branch = B.branches.find((b) => b.name === fields.branch);
    const call = branch?.phones?.[0] ? ` You can also call ${branch.name} on ${phoneDisplay(branch.phones[0])}.` : "";
    const title = $("[data-est-donetitle]"), txt = $("[data-est-donetext]"), mail = $("[data-est-mail]");
    if (res.method === "formspree") {
      title.textContent = "Request sent";
      txt.textContent = `Thanks, ${fields.name}. ${fields.branch} will contact you on ${fields.phone} with your price.${call}`;
      mail.hidden = true;
      quote.clear();
    } else if (res.method === "whatsapp") {
      title.textContent = "Request ready";
      txt.textContent = `Thanks, ${fields.name}. Press send in WhatsApp to share your quote request.${call}`;
      mail.hidden = true;
    } else {
      title.textContent = "Request ready";
      txt.textContent = `Thanks, ${fields.name}. Your email app should open with your quote request to ${B.email}. Press send to finish${file ? `, and remember to attach your photo (${file.name})` : ""}.${call}`;
      mail.href = res.href || mail.href;
      mail.hidden = false;
    }
    $("[data-est-body]").hidden = true;
    const box = $("[data-est-done]");
    box.hidden = false;
    title.focus({ preventScroll: true });
    if (!reduced) gsap.fromTo(box.querySelector(".est-done__ring"), { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(2)" });
    announce(title.textContent);
  }

  function resetDone() {
    $("[data-est-done]").hidden = true;
    $("[data-est-body]").hidden = false;
  }

  // ---------------------------------------------------------------- boot
  renderSummary();
  paintSteps();
  gsap.set($("[data-est-fill]"), { scaleX: 0 });
}
