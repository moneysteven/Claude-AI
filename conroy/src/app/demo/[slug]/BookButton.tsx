"use client";

/** Opens the Conroy widget straight on its Book tab (the widget exposes window.Conroy). */
export function BookButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => (window as unknown as { Conroy?: { open: (tab?: string) => void } }).Conroy?.open("book")}
    >
      {children}
    </button>
  );
}
