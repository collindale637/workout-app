"use client";

import Link from "next/link";
import { useEffect } from "react";

// Small shared building blocks for the dark "4B" look.

export const btn = {
  primary:
    "display flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-xl font-extrabold tracking-[0.04em] text-white shadow-[inset_0_-5px_0_var(--primary-press)] active:translate-y-px disabled:opacity-50",
  secondary:
    "display flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card px-4 text-lg font-extrabold tracking-[0.04em] text-ink active:bg-card-2 disabled:opacity-50",
  ghost: "display flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-base font-extrabold tracking-[0.04em] text-accent disabled:opacity-50",
  danger:
    "display flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-danger/40 px-4 text-lg font-extrabold tracking-[0.04em] text-danger disabled:opacity-50",
};

export const field =
  "h-12 w-full rounded-2xl border-2 border-line bg-card-2 px-4 text-base font-semibold text-ink outline-none placeholder:text-muted/60 focus:border-accent-strong";

export const label = "text-xs font-bold tracking-[0.1em] text-muted";

export function Chip({ active, onClick, children, className = "" }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 shrink-0 rounded-2xl border-2 px-3 text-sm font-bold ${
        active ? "border-accent-strong bg-primary/15 text-accent-soft" : "border-line bg-card-2 text-muted"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Back arrow + title row for inner pages. */
export function PageHeader({ title, back, right }: { title: string; back?: string; right?: React.ReactNode }) {
  return (
    <header className="flex min-h-12 items-center gap-2 pt-2">
      {back && (
        <Link href={back} aria-label="Back" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-accent">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
      )}
      <h1 className="display min-w-0 flex-1 truncate text-3xl font-extrabold">{title}</h1>
      {right}
    </header>
  );
}

/** Bottom sheet. Tap the dimmed area or press Escape to close. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <div className="safe-bottom relative mx-auto max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border-t border-line bg-card px-5 pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        {title && <h2 className="display mb-3 text-2xl font-extrabold">{title}</h2>}
        {children}
        <div className="h-4" />
      </div>
    </div>
  );
}

/** A tappable list row with a chevron. */
export function RowLink({ href, title, detail, right }: { href: string; title: string; detail?: string; right?: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-card-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-bold">{title}</div>
        {detail && <div className="truncate text-sm font-medium text-muted">{detail}</div>}
      </div>
      {right}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="text-muted" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
    </Link>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-line bg-card ${className}`}>{children}</section>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-3xl border border-dashed border-line px-5 py-8 text-center text-base font-medium text-muted">{children}</p>;
}
