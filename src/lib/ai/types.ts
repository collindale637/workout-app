import type { Goal } from "@/lib/db/types";

/*
  Shapes shared by the phone and the AI server route (/api/ai).
  The phone sends the context (what the gym has, your profile, recent training); the server asks Claude,
  checks the answer against that context, and sends back a proposal. Nothing is saved until you accept it.
*/

export type AiKind = "plan" | "edit" | "workout" | "day" | "import";

/** One exercise Claude may use: "id | name | main muscles | type". */
export type AllowedExercise = {
  id: string;
  name: string;
  /** Primary muscle ids, e.g. ["chest", "triceps"]. */
  muscles: string[];
  type: "compound" | "isolation" | "core" | "cardio";
  favorite?: boolean;
};

export type AiProfile = {
  goal: Goal;
  experience: string;
  days_per_week: number;
  session_minutes: number;
  units: "lb" | "kg";
  default_rpe: number;
};

/** An exercise as Claude returns it (and as the phone saves it). Cardio uses minutes instead of sets × reps. */
export type AiItem = {
  exercise_id: string;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  rest_sec: number | null;
  superset_group: number | null;
  notes: string | null;
};

export type AiDay = {
  name: string;
  /** Edits only: the existing day this one replaces (keeps its history link). Null = a new day. */
  ref_day_id: string | null;
  items: AiItem[];
};

export type AiPlan = {
  name: string;
  goal: Goal;
  weeks: number;
  /** Two or three sentences: what the plan is and why it fits. */
  summary: string;
  /** How to progress week to week (and any deload). */
  progression: string;
  days: AiDay[];
  /** Edits only: what changed, one short line each. */
  changes: string[];
};

export type AiWorkout = { name: string; summary: string; items: AiItem[] };

export type ImportMatch = "exact" | "close" | "none";

/** A line read from an imported plan, before it's matched to the exercise library. */
export type ImportLine = {
  /** The exercise as written in the source ("DB RDL"). */
  written: string;
  /** What it's usually called ("Dumbbell Romanian Deadlift"). */
  standard_name: string;
  /** Claude's best pick from the library, if any. */
  exercise_id: string | null;
  match: ImportMatch;
  is_cardio: boolean;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  rest_sec: number | null;
  superset_group: number | null;
  notes: string | null;
};

export type AiImport = {
  name: string;
  goal: Goal | null;
  weeks: number | null;
  summary: string;
  progression: string;
  days: { name: string; lines: ImportLine[] }[];
  /** Set when parts of the source couldn't be read. */
  problems: string | null;
};

/** The current plan, sent when asking for plain-English edits. */
export type PlanSnapshot = {
  name: string;
  goal: Goal;
  weeks: number;
  notes: string | null;
  days: { id: string; name: string; items: AiItem[] }[];
};

export type AiImage = { media_type: "image/jpeg" | "image/png" | "image/webp"; data: string };

export type AiRequest = {
  kind: AiKind;
  /** What you typed. */
  prompt: string;
  profile: AiProfile;
  gym: { name: string; equipment: string[] } | null;
  exercises: AllowedExercise[];
  /** Plan settings for "plan". */
  options?: { goal: Goal; days_per_week: number; weeks: number; session_minutes: number };
  /** Recovery 0–100 for muscles that aren't fully fresh. */
  recovery?: Record<string, number>;
  /** A few lines about recent workouts. */
  history?: string[];
  /** "edit": the plan to change. */
  plan?: PlanSnapshot;
  /** "workout" / "day": what's there now (the starting point), and the day's name. */
  current?: { name: string; items: AiItem[] };
  images?: AiImage[];
};

export type AiUsage = { configured: boolean; household_usd: number; mine_usd: number; cap_usd: number; my_requests: number };

export type AiResponse =
  | { ok: true; kind: "plan" | "edit"; plan: AiPlan; warnings: string[]; usage: AiUsage }
  | { ok: true; kind: "workout" | "day"; workout: AiWorkout; warnings: string[]; usage: AiUsage }
  | { ok: true; kind: "import"; result: AiImport; warnings: string[]; usage: AiUsage }
  | { ok: false; error: string; usage?: AiUsage };

export const MAX_IMAGES = 5;
export const MAX_PROMPT = 4000;
export const MAX_IMPORT_TEXT = 20000;
