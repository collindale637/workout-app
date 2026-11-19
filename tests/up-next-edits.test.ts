import { describe, expect, it } from "vitest";
import { applyEdits, itemsSignature } from "@/lib/up-next-edits";
import type { GenItem } from "@/lib/generator";

const item = (exercise_id: string, sets = 3): GenItem => ({ exercise_id, sets, rep_min: 8, rep_max: 12, rest_sec: 90, superset_group: null, notes: null });
const gen = { title: "Pull", items: [item("row"), item("pulldown"), item("curl")] };

describe("Today list edits", () => {
  it("applies edits made to the same list", () => {
    const edited = [item("curl"), item("row")];
    const out = applyEdits(gen, { base: itemsSignature(gen.items), items: edited });
    expect(out.items).toEqual(edited);
    expect(out.edited).toBe(true);
    expect(out.title).toBe("Pull");
  });

  it("drops edits once the generated list changes (Regenerate, Change, gym switch)", () => {
    const old = { base: itemsSignature([item("row"), item("pulldown")]), items: [item("pulldown")] };
    const out = applyEdits(gen, old);
    expect(out.items).toEqual(gen.items);
    expect(out.edited).toBe(false);
  });

  it("no edits: the generated list as is, with its signature", () => {
    const out = applyEdits(gen, undefined);
    expect(out.items).toBe(gen.items);
    expect(out.baseSig).toBe("row:3|pulldown:3|curl:3");
  });

  it("set counts are part of the signature (Go lighter is a different list)", () => {
    expect(itemsSignature([item("row", 2)])).not.toBe(itemsSignature([item("row", 3)]));
  });
});
