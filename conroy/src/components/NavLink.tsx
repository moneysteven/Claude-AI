"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A menu link that shows (and announces) when it is the current page.
 * `match` is a regular expression for the paths that count as this page;
 * by default the link's own path and anything below it.
 */
export function NavLink({ href, match, className, children }: { href: string; match?: string; className?: string; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const active = match ? new RegExp(match).test(pathname) : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className={className} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
