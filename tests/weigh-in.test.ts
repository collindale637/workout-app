import { describe, expect, it } from "vitest";
import { agoLabel, daysBetween, weighInDue } from "@/lib/weigh-in";

describe("weigh-in reminder", () => {
  const today = "2026-11-16";

  it("counts whole calendar days, across month and year ends and daylight saving", () => {
    expect(daysBetween("2026-11-16", "2026-11-16")).toBe(0);
    expect(daysBetween("2026-11-13", "2026-11-16")).toBe(3);
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2); // US clocks change on Mar 8, 2026
  });

  it("words the gap", () => {
    expect(agoLabel(0)).toBe("today");
    expect(agoLabel(1)).toBe("yesterday");
    expect(agoLabel(3)).toBe("3 days ago");
  });

  it("daily: due until you've logged today", () => {
    expect(weighInDue({ mode: "daily", today, last: "2026-11-15", skippedOn: null })).toBe(true);
    expect(weighInDue({ mode: "daily", today, last: today, skippedOn: null })).toBe(false);
    expect(weighInDue({ mode: "daily", today, last: null, skippedOn: null })).toBe(true);
  });

  it("weekly: due once a week has passed", () => {
    expect(weighInDue({ mode: "weekly", today, last: "2026-11-10", skippedOn: null })).toBe(false); // 6 days
    expect(weighInDue({ mode: "weekly", today, last: "2026-11-09", skippedOn: null })).toBe(true); // 7 days
    expect(weighInDue({ mode: "weekly", today, last: null, skippedOn: null })).toBe(true);
  });

  it("off never shows; skipping hides it for that day only", () => {
    expect(weighInDue({ mode: "off", today, last: null, skippedOn: null })).toBe(false);
    expect(weighInDue({ mode: "daily", today, last: "2026-11-01", skippedOn: today })).toBe(false);
    expect(weighInDue({ mode: "daily", today, last: "2026-11-01", skippedOn: "2026-11-15" })).toBe(true);
  });
});
