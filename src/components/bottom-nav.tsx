"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Today", icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></> },
  { href: "/plan", label: "Plan", icon: <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" /> },
  { href: "/recovery", label: "Recovery", icon: <path d="M3 12h4l3-8 4 16 3-8h4" /> },
  { href: "/progress", label: "Progress", icon: <path d="M4 20V11M10 20V5M16 20v-6M21 20H3" /> },
  { href: "/more", label: "More", icon: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} /> },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-20 mx-auto grid w-full max-w-md grid-cols-5 border-t border-line bg-bg/95 px-1 pt-2.5 backdrop-blur"
    >
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`display flex min-h-11 flex-col items-center gap-1 text-xs tracking-[0.08em] ${
              active ? "font-extrabold text-accent" : "font-bold text-muted"
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.25 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {tab.icon}
            </svg>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
