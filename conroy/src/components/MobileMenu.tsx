"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * Phone-sized screens: a slim top bar with the business name and a Menu
 * button that opens the full menu. The menu closes by itself after moving to
 * another page. Hidden on larger screens, where the sidebar shows instead.
 */
export function MobileMenu({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  // Remember which page the menu was opened on; navigating anywhere else closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  return (
    <div className="mobilebar">
      <div className="mobilebar-top">
        <div className="mobilebar-title">
          <span className="brand">{title}</span>
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
        <button
          type="button"
          className="secondary small"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpenOn(open ? null : pathname)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      <div id="mobile-menu" className="mobile-menu" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
