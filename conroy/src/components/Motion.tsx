"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Small touches of motion for the dashboard, all switched off when the
 * person's device asks for reduced motion:
 * - numbers in stat tiles count up when a page opens;
 * - a soft light follows the pointer across cards.
 * Renders nothing.
 */
export function Motion() {
  const pathname = usePathname();

  // Count-up for ".stat" numbers (J$, commas and decimals kept).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frames: number[] = [];
    const restore: (() => void)[] = [];
    document.querySelectorAll<HTMLElement>("main .stat").forEach((el, idx) => {
      const node = Array.from(el.childNodes).find((n): n is Text => n.nodeType === Node.TEXT_NODE && /\d/.test(n.textContent ?? ""));
      if (!node) return;
      const original = node.textContent ?? "";
      const match = original.match(/(\d[\d,]*)(\.\d+)?/);
      if (!match) return;
      const target = Number(match[1].replace(/,/g, "") + (match[2] ?? ""));
      if (!Number.isFinite(target) || target === 0) return;
      const decimals = match[2] ? match[2].length - 1 : 0;
      const format = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      const begin = performance.now() + idx * 70;
      const duration = 1100;
      const tick = (now: number) => {
        const p = Math.min(1, Math.max(0, (now - begin) / duration));
        const eased = 1 - Math.pow(1 - p, 4);
        node.textContent = original.replace(match[0], format(target * eased));
        if (p < 1) frames.push(requestAnimationFrame(tick));
        else node.textContent = original;
      };
      restore.push(() => {
        node.textContent = original;
      });
      frames.push(requestAnimationFrame(tick));
    });
    return () => {
      frames.forEach(cancelAnimationFrame);
      restore.forEach((r) => r());
    };
  }, [pathname]);

  // Pointer spotlight on cards (fine pointers only, e.g. a mouse).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const card = (e.target as Element | null)?.closest?.<HTMLElement>(".card, .table-wrap");
      if (!card) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
