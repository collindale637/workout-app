import type { SetType } from "./db/types";

/**
 * One row of the live workout's set list. Planned sets are numbered slots (1, 2, 3…). Logged working and drop
 * sets fill the slots you didn't skip, in order; warm-ups don't use a slot.
 */
export type SlotRow<T> =
  | { kind: "logged"; set: T; slot: number | null } // slot null = warm-up
  | { kind: "skipped"; slot: number }
  | { kind: "next"; slot: number; extra: boolean } // extra = past the planned sets
  | { kind: "planned"; slot: number };

export function slotRows<T extends { type: SetType }>(logged: T[], target: number, skipped: number[] = []): SlotRow<T>[] {
  const skip = new Set(skipped);
  const rows: SlotRow<T>[] = [];
  let slot = 1;
  for (const s of logged) {
    if (s.type === "warmup") {
      rows.push({ kind: "logged", set: s, slot: null });
      continue;
    }
    while (skip.has(slot) && slot <= target) rows.push({ kind: "skipped", slot: slot++ });
    rows.push({ kind: "logged", set: s, slot: slot++ });
  }
  let next = false;
  for (; slot <= target || !next; slot++) {
    if (skip.has(slot) && slot <= target) rows.push({ kind: "skipped", slot });
    else if (!next) {
      rows.push({ kind: "next", slot, extra: slot > target });
      next = true;
    } else rows.push({ kind: "planned", slot });
  }
  return rows;
}

/** Sets that count toward finishing an exercise: logged working/drop sets plus skipped planned sets. */
export function filledSets(logged: { type: SetType }[], target: number, skipped: number[] = []) {
  return logged.filter((s) => s.type !== "warmup").length + skipped.filter((n) => n >= 1 && n <= target).length;
}

/** The number of the next set to log (past `target` means an extra set). */
export function nextSlot(logged: { type: SetType }[], target: number, skipped: number[] = []) {
  const n = slotRows(logged, target, skipped).find((r) => r.kind === "next");
  return n ? n.slot : target + 1;
}

/**
 * Superset hand-off after skipping a set: the next partner (in order, wrapping round) that still has sets to do, or
 * undefined when none has. `members` is the superset in plan order.
 */
export function supersetPartner<T extends { id: string }>(members: T[], currentId: string, hasSetsLeft: (w: T) => boolean): T | undefined {
  const pos = members.findIndex((m) => m.id === currentId);
  if (pos < 0) return undefined;
  return [...members.slice(pos + 1), ...members.slice(0, pos)].find(hasSetsLeft);
}
