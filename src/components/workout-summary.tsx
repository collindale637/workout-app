/** Pieces shared by the Finish sheet and the saved-workout screen (UX spec Part 3). */

/** "PR" badge. onBlue: white with blue text, for the blue result card. */
export function PrBadge({ onBlue = false }: { onBlue?: boolean }) {
  return (
    <span className={`display shrink-0 rounded-md px-1.5 py-0.5 text-[11px] leading-none font-extrabold tracking-[0.1em] ${onBlue ? "bg-white text-primary" : "bg-primary text-white"}`}>
      PR
    </span>
  );
}

/** Dashed orange block listing what's left or wasn't done ("STILL ON TODAY'S LIST" / "NOT DONE"). */
export function NotDoneBlock({ label, rows }: { label: string; rows: { key: string; name: string; right: string }[] }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-warn/50 px-4 py-3">
      <div className="text-xs font-bold tracking-[0.1em] text-warn">{label}</div>
      <ul className="mt-1.5 flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-base font-bold">{r.name}</span>
            <span className="shrink-0 text-sm text-muted">{r.right}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
