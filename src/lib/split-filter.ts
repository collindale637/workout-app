/** The days-per-week filter on "Start a new plan": "all", or one number of days that exactly matches some splits. */
export type SplitFilter = "all" | number;

/** The day counts that have at least one split, lowest first. */
export const dayOptions = (splits: { days_per_week: number }[]) => [...new Set(splits.map((s) => s.days_per_week))].sort((a, b) => a - b);

/**
 * Which filter to show. A saved choice wins ("all", or a day count that still has splits); otherwise the person's usual
 * days a week; if no split has exactly that many days, the closest count that does (the lower one on a tie).
 */
export function resolveFilter(saved: unknown, usual: number, options: number[]): SplitFilter {
  if (saved === "all") return "all";
  if (typeof saved === "number" && options.includes(saved)) return saved;
  if (!options.length) return "all";
  if (options.includes(usual)) return usual;
  return options.reduce((best, d) => (Math.abs(d - usual) < Math.abs(best - usual) ? d : best), options[0]);
}

export type SplitRow<T> = { kind: "header"; days: number } | { kind: "split"; split: T };

/** Exact matches only. "All" lists every split under a header per day count. */
export function splitRows<T extends { days_per_week: number }>(splits: T[], filter: SplitFilter): SplitRow<T>[] {
  if (filter !== "all") return splits.filter((s) => s.days_per_week === filter).map((split) => ({ kind: "split", split }));
  const rows: SplitRow<T>[] = [];
  for (const days of dayOptions(splits)) {
    rows.push({ kind: "header", days });
    for (const split of splits.filter((s) => s.days_per_week === days)) rows.push({ kind: "split", split });
  }
  return rows;
}
