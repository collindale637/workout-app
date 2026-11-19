import type { Goal } from "@/lib/db/types";

/*
  Shapes shared by the phone and the AI server route (/api/ai).
  The phone sends the context (what the gym has, your profile, recent training); the server asks Claude,
  checks the answer against that context, and sends back a proposal. Nothing is saved until you accept it.
*/

export type AiKind = "plan" | "edit" | "workout" | "day" | "import" | "swap" | "suggest";

/** Quick picks during a workout: "swap" replaces one exercise, "suggest" adds to the workout. */
export const PICK_KINDS: AiKind[] = ["swap", "suggest"];

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
  /** none = only when asked, auto = what the goal calls for, more = cardio most sessions. */
  cardio_pref?: "none" | "auto" | "more";
  /** Body areas to go easy on, and a short note from the person. The exercise list is already filtered for the areas. */
  avoid_areas?: string[];
  injury_note?: string | null;
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

/** A PDF sent as-is (Claude reads its text and its page images). One per import. */
export type AiPdf = { media_type: "application/pdf"; data: string; name?: string };

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
  /** "import": a PDF to read instead of (or along with) photos. */
  pdf?: AiPdf;
  /** "swap" / "suggest": the workout in progress. */
  today?: { name: string; items: TodayItem[] };
  /** "swap": the exercise being replaced, and why (from the chips), if given. */
  swap?: { exercise_id: string; why: string | null };
  /** "plan" / "edit": run on the server and save the answer as a job (see /api/ai/jobs) instead of waiting for it. */
  background?: boolean;
  /** With `background`: which screen asked (the plan being edited, or null for a new plan), so it picks up the right draft. */
  jobRef?: string | null;
};

/** A background AI build, as the phone sees it. */
export type AiJob = { id: string; kind: "plan" | "edit"; ref: string | null; status: "running" | "done" | "failed"; result: AiResponse | null; created_at: string };

/** One exercise in the workout in progress. */
export type TodayItem = { id: string; name: string; muscles: string[]; type: AllowedExercise["type"]; sets_done: number; sets_planned: number };

/** A pick for a swap or an addition, with a short reason shown under it. */
export type AiPick = { exercise_id: string; reason: string };

export type AiUsage = { configured: boolean; household_usd: number; mine_usd: number; cap_usd: number; my_requests: number };

export type AiResponse =
  | { ok: true; kind: "plan" | "edit"; plan: AiPlan; warnings: string[]; usage: AiUsage }
  | { ok: true; kind: "workout" | "day"; workout: AiWorkout; warnings: string[]; usage: AiUsage }
  | { ok: true; kind: "import"; result: AiImport; warnings: string[]; usage: AiUsage }
  | { ok: true; kind: "swap" | "suggest"; picks: AiPick[]; warnings: string[]; usage: AiUsage }
  | { ok: false; error: string; usage?: AiUsage };

export const MAX_IMAGES = 5;
/** Vercel caps a request body at about 4.5 MB and base64 adds a third, so keep the PDF itself under 3 MB. */
export const MAX_PDF_BYTES = 3_000_000;
export const MAX_PROMPT = 4000;
export const MAX_IMPORT_TEXT = 20000;
