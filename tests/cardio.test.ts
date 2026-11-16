import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { cardioElapsedSec, cardioSummary, cardioTypeFor, isCardioExercise } from "@/lib/cardio";
import { clearCardioTimer } from "@/lib/cardio-timer";
import { LocalDB } from "@/lib/db/dexie";
import type { CardioTimer } from "@/lib/cardio";

describe("cardioTypeFor", () => {
  it.each([
    ["Running_Treadmill", "Treadmill Run", "run"],
    ["Jogging_Treadmill", "Jogging, Treadmill", "run"],
    ["Trail_Running_Walking", "Outdoor Run / Walk", "run"],
    ["Walking_Treadmill", "Treadmill Walk", "walk"],
    ["Bicycling", "Outdoor Bike Ride", "bike"],
    ["Bicycling_Stationary", "Stationary Bike", "bike"],
    ["Recumbent_Bike", "Recumbent Bike", "bike"],
    ["Spin_Bike", "Spin Bike", "bike"],
    ["Air_Bike_Cardio", "Air Bike", "bike"],
    ["Rowing_Stationary", "Rowing Machine", "row"],
    ["Elliptical_Trainer", "Elliptical", "elliptical"],
    ["Stairmaster", "Stair Climber", "stairs"],
    ["Step_Mill", "Step Mill", "stairs"],
    ["Rope_Jumping", "Jump Rope", "other"],
    ["Ski_Erg", "Ski Erg", "other"],
    ["Skating", "Skating", "other"],
    ["Prowler_Sprint", "Prowler Sprint", "other"],
  ])("%s → %s", (id, name, type) => {
    expect(cardioTypeFor({ id, name })).toBe(type);
  });

  it("falls back to other for a custom cardio exercise it can't place", () => {
    expect(cardioTypeFor({ id: "abc", name: "Battle ropes finisher" })).toBe("other");
  });
});

describe("isCardioExercise", () => {
  it("is true only for the cardio category", () => {
    expect(isCardioExercise({ category: "cardio" })).toBe(true);
    expect(isCardioExercise({ category: "strength" })).toBe(false);
    expect(isCardioExercise(undefined)).toBe(false);
  });
});

describe("cardio timer clock", () => {
  it("counts from the start time, so leaving the screen doesn't lose time", () => {
    expect(cardioElapsedSec({ startedAt: 1_000_000, stoppedAt: null }, 1_000_000 + 754_900)).toBe(754);
  });
  it("freezes at the moment Done was tapped", () => {
    expect(cardioElapsedSec({ startedAt: 1_000_000, stoppedAt: 1_000_000 + 60_000 }, 1_000_000 + 999_000)).toBe(60);
  });
  it("never goes negative if the phone clock moves back", () => {
    expect(cardioElapsedSec({ startedAt: 5_000, stoppedAt: null }, 1_000)).toBe(0);
  });
});

describe("cardioSummary", () => {
  it("shows time and distance in the person's units", () => {
    expect(cardioSummary({ duration_sec: 1800, distance: 3.1 }, "lb")).toBe("30:00 · 3.1 mi");
    expect(cardioSummary({ duration_sec: 1800, distance: 3.1 }, "kg")).toBe("30:00 · 4.99 km");
    expect(cardioSummary({ duration_sec: 605, distance: null }, "lb")).toBe("10:05");
  });
});

describe("clearCardioTimer", () => {
  let db: LocalDB;
  const timer: CardioTimer = { type: "run", startedAt: 1, stoppedAt: null, workoutId: "w1", wexId: "we1" };
  beforeEach(async () => {
    db = new LocalDB(`cardio-${Math.random()}`);
    await db.open();
    await db.setMeta("cardio_timer", timer);
  });

  it("leaves a timer that belongs to a different workout or exercise alone", async () => {
    await clearCardioTimer(db, { workoutId: "other" });
    await clearCardioTimer(db, { wexId: "other" });
    expect(await db.getMeta("cardio_timer")).toEqual(timer);
  });

  it("clears the timer when its workout or exercise goes away", async () => {
    await clearCardioTimer(db, { wexId: "we1" });
    expect(await db.getMeta("cardio_timer")).toBeNull();
    await db.setMeta("cardio_timer", timer);
    await clearCardioTimer(db, { workoutId: "w1" });
    expect(await db.getMeta("cardio_timer")).toBeNull();
  });
});
