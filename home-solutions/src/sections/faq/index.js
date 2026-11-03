// Section 11 FAQ accordion: toggles .is-open (CSS animates grid-template-rows),
// keeps aria-expanded in sync, ↑/↓/Home/End move between questions (APG).
export default function init() {
  const root = document.querySelector("#faq [data-faq]");
  if (!root) return;
  const items = [...root.querySelectorAll("[data-faq-item]")];
  const btns = items.map((it) => it.querySelector("[data-faq-btn]"));
  const set = (it, open) => {
    it.classList.toggle("is-open", open);
    it.querySelector("[data-faq-btn]").setAttribute("aria-expanded", String(open));
  };
  items.forEach((it) => set(it, it.classList.contains("is-open")));
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-faq-btn]");
    if (!b) return;
    const it = b.closest("[data-faq-item]");
    set(it, !it.classList.contains("is-open"));
  });
  root.addEventListener("keydown", (e) => {
    const i = btns.indexOf(e.target);
    if (i < 0) return;
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: btns.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    btns[(to + btns.length) % btns.length].focus();
  });
}
