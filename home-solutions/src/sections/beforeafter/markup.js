// Section 06 "Before / After" (BRIEF §4.06).
// Build-time markup. Without JS the comparison renders at the 50% state (CSS --ba-pos default).
// index.js enhances: pointer/touch drag anywhere on the frame, keyboard on the handle
// (arrows, PageUp/PageDown, Home/End), a one-time "nudge" hint when scrolled in.

// PLACEHOLDER: replace with real before/after pair from business
// TODO(business): supply a true before/after photo pair of the same opening (same angle). Remove the "Sample" badge
// and set SAMPLE = false once replaced.
const PAIR = {
  before: { img: "oldsite-house-two-storey", alt: "Sample “before” photo: a two-storey house" },
  after: { img: "project-storefront-glazing", alt: "Sample “after” photo: a storefront with aluminium-framed glazing" },
};
const SAMPLE = true;

export default function beforeafter(ctx) {
  const { picture, sectionHead } = ctx;
  const sizes = "(min-width: 1024px) 880px, 100vw";

  return `<section id="before-after" class="section section--light ba" aria-labelledby="ba-title">
  <div class="container">
    ${sectionHead({
      num: "06",
      eyebrow: "Before / After",
      title: "Drag to see the difference",
      intro: SAMPLE
        ? "Slide the handle to compare. The photos below are a sample pairing while we gather true before-and-after shots of our installs."
        : "Slide the handle to compare the opening before and after our install.",
      id: "ba-title",
    })}
    <figure class="ba-figure" data-reveal>
      <div class="ba-frame" style="--ba-pos:50%">
        <div class="ba-layer ba-layer--after">
          ${picture(PAIR.after.img, { alt: PAIR.after.alt, sizes, className: "ba-pic", imgClass: "ba-img", attrs: 'draggable="false"' })}
        </div>
        <div class="ba-layer ba-layer--before">
          ${picture(PAIR.before.img, { alt: PAIR.before.alt, sizes, className: "ba-pic", imgClass: "ba-img", attrs: 'draggable="false"' })}
        </div>
        <span class="ba-tag ba-tag--before" aria-hidden="true">Before</span>
        <span class="ba-tag ba-tag--after" aria-hidden="true">After</span>
        ${SAMPLE ? '<span class="badge-sample ba-sample">Sample</span>' : ""}
        <div class="ba-track">
          <span class="ba-line" aria-hidden="true"></span>
          <div class="ba-handle" role="slider" tabindex="0" aria-label="Before and after comparison: amount of the before photo shown"
            aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-valuetext="50% before, 50% after" aria-orientation="horizontal">
            <span class="ba-grip" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
          </div>
        </div>
      </div>
      <figcaption class="ba-cap">${SAMPLE ? "Sample pairing for illustration, not the same property. " : ""}Use the handle, or focus it and press the arrow keys.</figcaption>
    </figure>
  </div>
</section>`;
}
