import { describe, expect, it } from "vitest";
import { syncFraction, syncLine } from "@/lib/sync-status";

const base = { pending: 0, total: 0, lastSynced: null };

describe("sync status text", () => {
  it("says what's waiting while offline", () => {
    expect(syncLine({ ...base, status: "offline", pending: 3 })).toBe("Offline · 3 changes waiting");
    expect(syncLine({ ...base, status: "offline", pending: 1 })).toBe("Offline · 1 change waiting");
    expect(syncLine({ ...base, status: "offline" })).toBe("Offline · nothing waiting");
  });
  it("counts up while syncing", () => {
    expect(syncLine({ ...base, status: "syncing", pending: 9, total: 12 })).toBe("Syncing 3 of 12…");
    expect(syncLine({ ...base, status: "syncing" })).toBe("Syncing…");
  });
  it("reports failure and up-to-date", () => {
    expect(syncLine({ ...base, status: "error", pending: 2 })).toBe("Last sync failed · 2 changes waiting");
    expect(syncLine({ ...base, status: "idle" })).toBe("Up to date");
    expect(syncLine({ ...base, status: "idle", pending: 1 })).toBe("1 change waiting");
  });
  it("gives a progress fraction only while syncing a known backlog", () => {
    expect(syncFraction({ status: "syncing", pending: 3, total: 12 })).toBe(0.75);
    expect(syncFraction({ status: "syncing", pending: 0, total: 0 })).toBeNull();
    expect(syncFraction({ status: "idle", pending: 3, total: 12 })).toBeNull();
    expect(syncFraction({ status: "syncing", pending: 20, total: 12 })).toBe(0);
  });
});
