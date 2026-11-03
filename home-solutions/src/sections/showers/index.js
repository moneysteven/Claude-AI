// Section 08 behaviour: "Add to quote" on the shower/railing lines (shared quote
// basket, src/lib/quote.js -> 'quote:change'), and a ±6% scrubbed inset parallax.
export default function init(ctx) {
  const root = document.getElementById("showers");
  if (!root) return;
  const { B, gsap, quote, reduced } = ctx;
  const live = root.querySelector("[data-shw-live]");

  root.querySelectorAll("[data-shw-add]").forEach((b) => {
    const p = B.products.find((x) => x.id === b.dataset.shwAdd);
    if (!p) return;
    b.hidden = false;
    const label = b.querySelector(".shw-add__label");
    const html = label.innerHTML;
    let t = 0;
    b.addEventListener("click", () => {
      quote.add({ productId: p.id, name: p.name, material: p.material || "", cat: p.cat, priceJMD: p.priceJMD, qty: 1 });
      const n = quote.count();
      if (live) live.textContent = `${p.name} added to your quote. ${n} item${n === 1 ? "" : "s"} in your quote.`;
      b.classList.add("is-added");
      label.innerHTML = `Added<span class="visually-hidden"> ${p.name.replace(/[<&]/g, "")}</span>`;
      clearTimeout(t);
      t = setTimeout(() => { b.classList.remove("is-added"); label.innerHTML = html; }, 1800);
    });
  });

  const img = root.querySelector(".shw-inset__img");
  if (!img) return;
  if (reduced) { gsap.set(img, { scale: 1 }); return; }
  gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: "none",
    scrollTrigger: { trigger: root.querySelector(".shw-inset__frame"), start: "top bottom", end: "bottom top", scrub: true } });
}
