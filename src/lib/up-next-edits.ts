import type { GenItem } from "@/lib/generator";

/**
 * Changes made on Today's list before starting (reorder, swap, notes, remove). `base` is the signature of the list they
 * were made to, so they quietly drop away when that list changes (Regenerate, Change, a gym switch…).
 */
export type UpNextEdits = { base: string; items: GenItem[] };

/** Identifies a generated list, so edits are only applied to the list they were made on. */
export const itemsSignature = (items: GenItem[]) => items.map((i) => `${i.exercise_id}:${i.sets}`).join("|");

/** Puts your Today-list edits on top of the generated workout, if they were made to this same list. */
export function applyEdits<T extends { items: GenItem[] }>(gen: T, edits: UpNextEdits | undefined): T & { baseSig: string; edited: boolean } {
  const baseSig = itemsSignature(gen.items);
  if (edits && edits.base === baseSig) return { ...gen, items: edits.items, baseSig, edited: true };
  return { ...gen, baseSig, edited: false };
}
