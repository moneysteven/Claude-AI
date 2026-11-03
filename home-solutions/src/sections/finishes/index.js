// Section 03 Finishes behaviour: tween the frame colour (CSS var --frame),
// crossfade Wood grain / Anodised gradient layers, slide the highlight ring
// (Flip). Native radios give arrow-key navigation inside the radiogroup.
// "Quote in this finish" tells the estimator via 'estimator:prefill'.
export default function init({ gsap, Flip, reduced }) {
  const root = document.getElementById("finishes");
  if (!root) return;
  const stage = root.querySelector(".fin-stage");
  const radios = [...root.querySelectorAll(".fin-sw__input")];
  const ring = root.querySelector(".fin-ring");
  const wood = root.querySelector(".fin-tex--wood");
  const alu = root.querySelector(".fin-tex--alu");
  const nameEl = root.querySelector("[data-fin-name]");
  const whereEl = root.querySelector("[data-fin-where]");
  if (!stage || !radios.length) return;

  const current = () => radios.find((r) => r.checked) || radios[0];

  function apply(input, animate) {
    const { color, tex, where } = input.dataset;
    const d = animate && !reduced ? 0.7 : 0;
    const ease = "power2.inOut";
    gsap.to(stage, { "--frame": color, duration: d, ease, overwrite: "auto" });
    gsap.to(wood, { opacity: tex === "wood" ? 1 : 0, duration: d, ease, overwrite: "auto" });
    gsap.to(alu, { opacity: tex === "alu" ? 0.8 : 0, duration: d, ease, overwrite: "auto" });
    nameEl.textContent = input.value;
    whereEl.textContent = where ? `: available for ${where} frames.` : "";
    const label = input.closest(".fin-sw");
    if (ring && ring.parentElement !== label) {
      const state = Flip.getState(ring);
      label.insertBefore(ring, input.nextSibling);
      if (d) Flip.from(state, { duration: 0.45, ease: "power3.inOut" });
    }
  }

  gsap.set(stage, { "--frame": current().dataset.color });
  apply(current(), false);
  radios.forEach((r) => r.addEventListener("change", () => r.checked && apply(r, true)));

  root.querySelector("[data-fin-quote]")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("estimator:prefill", { detail: { finish: current().value } }));
  });

  // Looking through the glass: the interior photo drifts slower than the frame.
  if (!reduced) {
    gsap.fromTo(root.querySelector(".fin-photo"), { yPercent: -4 }, {
      yPercent: 4, ease: "none", scrollTrigger: { trigger: stage, start: "top bottom", end: "bottom top", scrub: true },
    });
  }
}
