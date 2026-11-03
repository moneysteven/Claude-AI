// Hero behaviour (the door intro + headline rise are CSS, see style.css):
// pause the video when off-screen, keep it off for reduced motion / Save-Data,
// and a gentle scrubbed parallax on the media as the hero scrolls away.
export default function initHero(ctx) {
  const hero = document.getElementById("top");
  if (!hero) return;
  const { gsap, reduced, saveData } = ctx;
  const video = hero.querySelector(".hero__video");

  if (video) {
    if (reduced || saveData) {
      video.pause();
      video.classList.add("is-off");
    } else if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) video.play().catch(() => {});
        else video.pause();
      }).observe(hero);
    }
  }

  if (reduced) return;
  const st = { trigger: hero, start: "top top", end: "bottom top", scrub: true };
  gsap.to(hero.querySelector(".hero__media"), { yPercent: 12, ease: "none", scrollTrigger: st });
  gsap.to(hero.querySelector(".hero__inner"), { yPercent: -6, opacity: 0.4, ease: "none", scrollTrigger: { ...st, start: "40% top" } });
}
