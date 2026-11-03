// Site-visit booking modal behaviour.
import { modal } from "../header/dialog.js";
import { submitForm, waLink, whatsappEnabled } from "../../lib/contact.js";
import { phoneDisplay } from "../../lib/format.js";

const KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function initBooking(ctx) {
  const dlg = document.getElementById("booking");
  if (!dlg) return;
  const { B, gsap, reduced } = ctx;
  const form = dlg.querySelector("[data-bk-form]");
  const done = dlg.querySelector("[data-bk-done]");
  const err = dlg.querySelector("[data-bk-error]");
  const date = form.elements.date;
  const dateErr = dlg.querySelector("#bk-date-err");
  const closedDays = KEYS.map((k, i) => (B.hours[k] ? -1 : i)).filter((i) => i >= 0);

  // Today in Jamaica time as YYYY-MM-DD (en-CA formats ISO-like).
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: B.hours.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  const m = modal(dlg, ctx, {
    panel: dlg.querySelector(".bk__panel"),
    from: { y: 40 },
    onOpen: (detail) => {
      if (!done.hidden) reset();
      date.min = today();
      const need = String(detail?.need || "").toLowerCase();
      if (need) form.querySelectorAll("input[name=needs]").forEach((c) => {
        if (need === c.value || need.startsWith(c.value) || need === c.dataset.label.toLowerCase()) c.checked = true;
      });
      requestAnimationFrame(() => form.elements.name.focus({ preventScroll: true }));
    },
  });

  // Openers: any [data-booking-open] (capture phase so the "#contact" no-JS
  // fallback href doesn't also trigger the anchor scroll) + the event.
  document.addEventListener("click", (e) => {
    const t = e.target.closest?.("[data-booking-open]");
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    m.open({ need: t.dataset.need });
  }, true);
  window.addEventListener("booking:open", (e) => m.open(e.detail));

  // Closed-day check (native date inputs can't disable weekdays).
  function checkDate() {
    let msg = "";
    if (date.value) {
      const d = new Date(date.value + "T12:00:00Z");
      if (date.min && date.value < date.min) msg = "Please choose today or a later date.";
      else if (closedDays.includes(d.getUTCDay())) msg = `We don't do visits on ${DAY[d.getUTCDay()]}s, please pick another day.`;
    }
    date.setCustomValidity(msg);
    dateErr.textContent = msg;
    date.setAttribute("aria-invalid", msg ? "true" : "false");
    return !msg;
  }
  date.addEventListener("change", checkDate);
  date.addEventListener("input", checkDate);

  function collect() {
    const f = form.elements;
    const branch = B.branches.find((b) => b.id === f.branch.value);
    const needs = [...form.querySelectorAll("input[name=needs]:checked")].map((c) => c.dataset.label);
    const when = date.value ? new Date(date.value + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
    const fields = {
      name: f.name.value.trim(), phone: f.phone.value.trim(), branch: branch?.name || "",
      date: date.value, time: f.slot.value, needs: needs.join(", "), notes: f.notes.value.trim(),
    };
    const text = [
      `Hi ${B.name}, I'd like to book a free site visit.`,
      "",
      `Name: ${fields.name}`,
      `Phone: ${fields.phone}`,
      `Branch: ${fields.branch}`,
      `Preferred date: ${when} (${fields.time.toLowerCase()})`,
      needs.length ? `I need: ${fields.needs}` : "",
      fields.notes ? `Notes: ${fields.notes}` : "",
    ].filter((l, i) => l || i === 1).join("\n");
    return { fields, text };
  }

  function validate() {
    err.textContent = "";
    checkDate();
    let ok = true;
    for (const el of form.querySelectorAll("input[name=name],input[name=phone],select,input[name=date]")) {
      const bad = !el.checkValidity();
      el.setAttribute("aria-invalid", bad ? "true" : "false");
      if (bad && ok) { ok = false; el.focus(); }
    }
    if (!ok) err.textContent = dateErr.textContent || "Please fill in your name, phone, branch and a preferred date.";
    return ok;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const { fields, text } = collect();
    const btn = form.querySelector(".bk__submit");
    btn.disabled = true;
    const res = await submitForm(B, { subject: `Site visit request: ${fields.name} (${fields.branch})`, fields, text });
    btn.disabled = false;
    success(res, fields);
  });

  const waBtn = dlg.querySelector("[data-bk-wa]");
  if (waBtn && whatsappEnabled(B)) waBtn.addEventListener("click", () => {
    if (!validate()) return;
    const { fields, text } = collect();
    window.open(waLink(B, text), "_blank", "noopener");
    success({ method: "whatsapp" }, fields);
  });

  function success(res, fields) {
    const branch = B.branches.find((b) => b.name === fields.branch);
    const phone = branch?.phones[0] ? ` or call ${branch.name} on ${phoneDisplay(branch.phones[0])}` : "";
    const textEl = dlg.querySelector("[data-bk-done-text]");
    const mail = dlg.querySelector("[data-bk-mail]");
    if (res.method === "formspree") {
      dlg.querySelector("[data-bk-done-title]").textContent = "Request sent";
      textEl.textContent = `Thanks, ${fields.name}. We'll contact you on ${fields.phone} to confirm your visit.`;
      mail.hidden = true;
    } else if (res.method === "whatsapp") {
      dlg.querySelector("[data-bk-done-title]").textContent = "Request ready";
      textEl.textContent = `Thanks, ${fields.name}. Press send in WhatsApp to share your request${phone}.`;
      mail.hidden = true;
    } else {
      dlg.querySelector("[data-bk-done-title]").textContent = "Request ready";
      textEl.textContent = `Thanks, ${fields.name}. Your email app should open with your request to ${B.email}; press send to finish. If it didn't open, use the button below${phone}.`;
      mail.href = res.href;
      mail.hidden = false;
    }
    form.hidden = true;
    done.hidden = false;
    done.querySelector("[data-bk-done-title]").focus({ preventScroll: true });
    const ring = done.querySelector(".bk__ring");
    const reveal = done.querySelector(".bk__reveal");
    if (reduced) { gsap.fromTo(ring, { opacity: 0 }, { opacity: 1, duration: 0.2 }); gsap.set(reveal, { x: 0 }); return; }
    gsap.timeline()
      .fromTo(ring, { opacity: 0, scale: 0.6, rotation: -30, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, rotation: 0, duration: 0.7, ease: "back.out(1.6)" })
      .fromTo(reveal, { x: -96 }, { x: 0, duration: 0.55, ease: ctx.EASE.out }, "-=0.25")
      .fromTo(done.querySelectorAll(".bk__title,.bk__done-text,.bk__actions"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.07, ease: ctx.EASE.out }, "-=0.4");
  }

  function reset() {
    form.reset();
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    date.setCustomValidity("");
    dateErr.textContent = err.textContent = "";
    form.hidden = false;
    done.hidden = true;
  }
}
