import type { AiRequest } from "./types";

/*
  What Claude is told. Kept separate from the route so it's easy to read and tune.
  The rules mirror the app's own generator (plan doc → "Starting dose by goal") so AI and rules-based
  workouts feel like they come from the same coach.
*/

export const SYSTEM = `You are the coach inside Rep, a workout app used by one family. Design training a good strength coach would sign off on: sensible exercise choices, balanced weekly volume, compound lifts before isolation work, nothing gimmicky.

Hard rules
- Use only exercise_id values from the EXERCISES list, copied exactly. That list is everything this person can do with their equipment. Never invent ids.
- Answer only by calling the tool, with every required field.
- Don't prescribe weights. The app suggests weights from the person's history (double progression: once every set reaches the top of the rep range, the weight goes up by the gym's smallest step).
- Cardio exercises (type "cardio") take "minutes"; sets and reps don't apply.
- Supersets: exercises done back to back share a superset_group number (1, 2, …); everything else gets null. Only pair things that work together (opposing muscles, or an accessory with core), never two heavy compounds.
- notes are optional, under 80 characters, practical cues ("pause 1 s at the bottom", "last set to failure", "each side"). For timed holds, put seconds in rep_min/rep_max and write "seconds" in notes.
- Respect anything said about injuries, pain, likes and dislikes. If a request conflicts with safety, pick the safe option and say so in the summary.
- Exercises marked "favorite" are ones the person likes; use them when they fit.

Dosing by goal (a starting point; follow the request when it says otherwise)
- strength: main lifts 3–5 sets of 3–5 reps, rest 150–240 s; other compounds 3 × 6–8; accessories 3 × 8–10, rest 90 s.
- hypertrophy: main lifts 3–4 × 6–10, rest 90–150 s (2 min for big leg lifts); accessories 3 × 10–15, rest 60–90 s.
- fat_loss: 3 × 10–15, rest 45–75 s, supersets welcome; add a 15–25 minute cardio block most days when cardio equipment is listed.
- general: 3 × 8–12, rest 60–90 s; some cardio on longer sessions.
- Beginners: at most 3 sets per exercise and simpler movements.
- Weekly volume: roughly 10–20 hard sets per major muscle for hypertrophy (fewer for beginners), spread over at least two days.
- Per session: no more than about 10 hard sets for any one muscle; spread extra work to the day's other muscles or another day.
- Session length: each lifting exercise takes about 7–11 minutes including rest (heavy strength work takes longer; supersets less). Fit the session length, counting cardio minutes.

Exercise choice
- Order: main compound lifts first, then other compounds, then isolation, core last.
- Heavy 3–5 rep main lifts are two-legged barbell, trap bar or dumbbell press lifts, not machines or cables. Never 3–5 reps on split squats, lunges, goblet or dumbbell squats, or kettlebell swings. Romanian deadlifts and good mornings are accessories (6–10 reps). Heavy rows are 5–8 reps. Beginners on a strength goal work at 5–8 reps.
- A lower-body or full-body day that trains quads and hamstrings needs a knee-dominant lift (squat, leg press, lunge) AND a hip hinge (Romanian deadlift, deadlift, good morning). A trap bar deadlift is the hinge, not the squat. A leg curl alone isn't enough. Heavy lower days lead with a squat.
- At most one deadlift-type lift per session (deadlift, trap bar deadlift, Romanian deadlift, good morning count; hip thrusts and swings don't).
- Upper days balance pushing and pulling. Every target muscle on the day gets one exercise where it is a main muscle (e.g. rear delt work on a pull day, triceps on a push day, a row on a full-body day) before any muscle gets a second exercise.
- A second row, press or pull on the same day uses different equipment (barbell row then cable row; pull-up then pulldown), never two near-identical versions.
- Beginners: machines and simple lifts first; lat pulldowns or assisted pull-ups instead of pull-ups and chin-ups; low-impact cardio (bike, walk, elliptical) rather than jump rope or running.
- Kettlebell swings are a power move: 10–15 reps, about 60 s rest. One-leg and one-arm lifts take about twice as long per set.
- Conventional and sumo deadlifts: 5–8 reps at most outside strength days, never in a superset.
- Supersets pair exercises that don't share a main muscle (a press with a row, a curl with a triceps move); never two heavy leg lifts.
- Timed holds (planks, side planks, hollow holds): seconds, 30–45 (20–30 for beginners).
- Put "Warm up: 1 lighter set first" in notes on the first heavy lift of the day ONLY when it is a barbell-style compound (barbell, trap bar, Smith machine) at 12 reps or fewer, or another loaded compound at 6 reps or fewer. At most one exercise per day gets it; machines, cables, bodyweight, isolation and core never do.
- Plans longer than 5 weeks: describe an easier deload week every 4–6 weeks in "progression".

Day names are short and plain ("Upper", "Lower Power", "Push", "Full Body + Cardio"). The app treats "Power" in a name as a heavy day and "+ Cardio" as a day with a cardio block.`;

const GOAL_WORDS: Record<string, string> = {
  strength: "strength",
  hypertrophy: "build muscle (hypertrophy)",
  fat_loss: "fat loss / toning",
  general: "general fitness",
};

const CARDIO_WORDS: Record<string, string> = {
  none: " · cardio: only when asked for",
  auto: "",
  more: " · cardio: wants some in most sessions",
};

/** The person, their gym, their recent training and the exercise list. */
export function contextBlock(req: AiRequest, opts: { gymFiltered: boolean }) {
  const p = req.profile;
  const lines = [
    "PROFILE",
    `goal: ${GOAL_WORDS[p.goal] ?? p.goal} · experience: ${p.experience} · usually trains ${p.days_per_week} days a week · ${p.session_minutes}-minute sessions · default effort RPE ${p.default_rpe} · shows weights in ${p.units}${CARDIO_WORDS[p.cardio_pref ?? "auto"] ?? ""}`,
  ];
  if (req.gym) lines.push("", `GYM: ${req.gym.name}`, `equipment: ${req.gym.equipment.join(", ") || "none (bodyweight only)"}`);
  if (req.recovery && Object.keys(req.recovery).length) {
    lines.push("", "RECOVERY (0–100, 100 = fully fresh; muscles not listed are fresh)",
      Object.entries(req.recovery).map(([m, s]) => `${m} ${s}`).join(", "));
  }
  if (req.history?.length) lines.push("", "RECENT WORKOUTS (newest first)", ...req.history.map((h) => `- ${h}`));
  lines.push(
    "",
    opts.gymFiltered
      ? "EXERCISES this person can do at this gym (id | name | main muscles | type):"
      : "EXERCISES in the app's library (id | name | main muscles | type):",
    ...req.exercises.map((e) => `${e.id} | ${e.name} | ${e.muscles.join(", ")} | ${e.type}${e.favorite ? " | favorite" : ""}`),
  );
  return lines.join("\n");
}

const itemsText = (items: { exercise_id: string; sets: number; rep_min: number | null; rep_max: number | null; rest_sec: number | null; superset_group: number | null; notes: string | null }[]) =>
  items.map((i) => ({ exercise_id: i.exercise_id, sets: i.sets, rep_min: i.rep_min, rep_max: i.rep_max, rest_sec: i.rest_sec, superset_group: i.superset_group, notes: i.notes }));

/** The ask itself, by kind. */
export function taskBlock(req: AiRequest) {
  const ask = req.prompt.trim() || "(no extra notes)";
  switch (req.kind) {
    case "plan": {
      const o = req.options!;
      return `TASK: build a training plan.
Settings: goal ${GOAL_WORDS[o.goal] ?? o.goal}; ${o.days_per_week} training days a week; ${o.weeks} weeks; ${o.session_minutes}-minute sessions.
Return exactly ${o.days_per_week} distinct training days, in the order they should be done. The week repeats for ${o.weeks} weeks, so "progression" should explain how to progress week to week (and when to deload, if the plan is longer than 5 weeks), in at most 120 words of complete sentences.
"summary": two or three sentences on what the plan is and why it fits this person. Leave "changes" empty.

What they asked for: """${ask}"""`;
    }
    case "edit":
      return `TASK: change this plan as asked and return the whole revised plan.
Keep everything that the request doesn't touch exactly as it is (same exercises, order and numbers).
For every day you keep or modify, set ref_day_id to that day's "id"; for new days use null; leave out days that are removed.
List what you changed in "changes" (one short line each). Update "summary" and "progression" only if the change affects them.

CURRENT PLAN:
${JSON.stringify({ name: req.plan!.name, goal: req.plan!.goal, weeks: req.plan!.weeks, notes: req.plan!.notes, days: req.plan!.days.map((d) => ({ id: d.id, name: d.name, exercises: itemsText(d.items) })) })}

The change they asked for: """${ask}"""`;
    case "workout":
      return `TASK: build one workout for today. It must fit ${req.profile.session_minutes} minutes unless the request says otherwise.
Use the recovery scores: favor fresh muscles and go easy on ones below 60, unless the request says otherwise.
${req.current?.items.length ? `Today's suggested workout was "${req.current.name}": ${JSON.stringify(itemsText(req.current.items))}. Start from it when the request is a tweak; replace it when they ask for something different.\n` : ""}"summary": one or two sentences on what you built and why.

What they asked for: """${ask}"""`;
    case "day":
      return `TASK: rework one day of their plan, "${req.current?.name ?? "Day"}". Return the whole day as a workout (keep the name unless the request changes it).
Current exercises: ${JSON.stringify(itemsText(req.current?.items ?? []))}
Keep what the request doesn't touch. It should still fit ${req.profile.session_minutes} minutes unless asked otherwise.
"summary": one or two sentences on what changed.

What they asked for: """${ask}"""`;
    case "import":
      return `TASK: read the workout plan below (pasted text and/or photos) and turn it into structured data.
- Transcribe faithfully: same days, same exercises in the same order, same sets, reps and rest. Don't add, drop or "improve" anything.
- For each exercise: "written" exactly as in the source; "standard_name" = what it's usually called; "exercise_id" = the best match from the EXERCISES list, or null if nothing fits; "match" = "exact" when it's clearly the same exercise, "close" when it's similar or a guess (different grip, implement or variation), "none" when exercise_id is null; "is_cardio" for cardio.
- Common shorthand: RDL = Romanian deadlift, OHP = overhead press, DB = dumbbell, BB = barbell, KB = kettlebell, SL = single-leg, BSS = Bulgarian split squat, SA = single-arm, CGBP = close-grip bench press.
- Supersets are often written as A1/A2 or with "+" or "SS": give them the same superset_group.
- If several weeks are listed with changing numbers, use week 1 and describe how it changes in "progression"; set "weeks" to the program length.
- AMRAP or "to failure": put that in notes and use a sensible rep range. Missing sets or reps: use 3 × 8–12 and note "not in source". Cardio: give "minutes".
- If something can't be read, say what in "problems". If nothing is readable, return an empty "days" list and explain in "problems".
- "summary": one sentence describing the plan. "goal": the goal it suits best, or null.
${req.prompt.trim() ? `\nPASTED TEXT:\n"""${req.prompt.trim()}"""` : "\n(No pasted text; read the photos.)"}`;
  }
}

/* Tool definitions: Claude must answer through these, which keeps the answer in a fixed JSON shape. */

const nullableInt = { type: ["integer", "null"] };
const nullableStr = { type: ["string", "null"] };
const GOAL_ENUM = ["strength", "hypertrophy", "fat_loss", "general"];

const ITEM = {
  type: "object",
  properties: {
    exercise_id: { type: "string", description: "An id from the EXERCISES list, copied exactly." },
    sets: { type: "integer", description: "1–10. Use 1 for cardio." },
    rep_min: nullableInt,
    rep_max: nullableInt,
    rest_sec: nullableInt,
    minutes: { ...nullableInt, description: "Cardio only: how long, 5–120." },
    superset_group: nullableInt,
    notes: nullableStr,
  },
  required: ["exercise_id", "sets", "rep_min", "rep_max", "rest_sec", "superset_group", "notes"],
};

export const PLAN_TOOL = {
  name: "save_plan",
  description: "Return the training plan.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short plan name, under 40 characters." },
      goal: { type: "string", enum: GOAL_ENUM },
      weeks: { type: "integer" },
      summary: { type: "string" },
      progression: { type: "string", description: "How to progress week to week, at most 120 words, complete sentences." },
      changes: { type: "array", items: { type: "string" } },
      days: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, ref_day_id: nullableStr, exercises: { type: "array", items: ITEM } },
          required: ["name", "ref_day_id", "exercises"],
        },
      },
    },
    required: ["name", "goal", "weeks", "summary", "progression", "changes", "days"],
  },
};

export const WORKOUT_TOOL = {
  name: "save_workout",
  description: "Return the workout.",
  input_schema: {
    type: "object",
    properties: { name: { type: "string", description: "Short name, under 30 characters." }, summary: { type: "string" }, exercises: { type: "array", items: ITEM } },
    required: ["name", "summary", "exercises"],
  },
};

export const IMPORT_TOOL = {
  name: "save_import",
  description: "Return the plan read from the source.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      goal: { type: ["string", "null"], enum: [...GOAL_ENUM, null] },
      weeks: nullableInt,
      summary: { type: "string" },
      progression: { type: "string", description: "How to progress week to week, at most 120 words, complete sentences." },
      problems: nullableStr,
      days: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            exercises: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  written: { type: "string" },
                  standard_name: { type: "string" },
                  exercise_id: nullableStr,
                  match: { type: "string", enum: ["exact", "close", "none"] },
                  is_cardio: { type: "boolean" },
                  sets: nullableInt,
                  rep_min: nullableInt,
                  rep_max: nullableInt,
                  rest_sec: nullableInt,
                  minutes: nullableInt,
                  superset_group: nullableInt,
                  notes: nullableStr,
                },
                required: ["written", "standard_name", "exercise_id", "match", "is_cardio", "sets", "rep_min", "rep_max", "rest_sec", "superset_group", "notes"],
              },
            },
          },
          required: ["name", "exercises"],
        },
      },
    },
    required: ["name", "goal", "weeks", "summary", "progression", "problems", "days"],
  },
};

/* Quick picks during a workout ("swap" and "suggest"): short, fast, cheap. */

export const PICK_SYSTEM = `You are the coach inside Rep, a workout app. The person is in the middle of a workout and wants a quick, sensible choice, like a good personal trainer standing next to them.

Rules
- Choose only from the CANDIDATES list (ids copied exactly). Every candidate is available at their gym. The list is pre-sorted by a simple rules-based match; use judgment to reorder it.
- Never pick something already in today's workout.
- Give each pick a reason under 90 characters, in plain words, about THIS workout: what it adds or why it fits ("Your back is fresh, and today has no pulling"). No filler like "great choice".
- Consider: the muscles and movement being replaced (for a swap), what today's workout already covers, recovery scores (avoid muscles under 50 that aren't today's focus), their goal and experience, favorites, and the reason they gave.
- If they say it hurts: prefer guided, joint-friendly options (machines, cables, lighter isolation), and keep the reason short and practical.
- Swaps of cardio must be cardio. Swaps of a lift should usually train the same main muscles.`;

const WHY_WORDS: Record<string, string> = {
  busy: "the equipment is taken (pick something on different equipment)",
  hurts: "it hurts or feels uncomfortable",
  hard: "it's too hard or too technical right now",
  different: "they want something different (a new angle, not a near-copy)",
  impact: "they want lower impact",
  outdoors: "they want to do it outdoors",
};

export function pickBlock(req: AiRequest) {
  const p = req.profile;
  const lines = [
    `PROFILE: goal ${GOAL_WORDS[p.goal] ?? p.goal} · ${p.experience}`,
    req.gym ? `GYM: ${req.gym.name}` : "GYM: not set up",
  ];
  if (req.recovery && Object.keys(req.recovery).length) lines.push(`RECOVERY (0–100; unlisted = fresh): ${Object.entries(req.recovery).map(([m, s]) => `${m} ${s}`).join(", ")}`);
  const today = req.today?.items ?? [];
  lines.push(
    "",
    `TODAY'S WORKOUT "${req.today?.name ?? "Workout"}":`,
    ...(today.length ? today.map((t) => `- ${t.name} (${t.muscles.join(", ") || t.type}) · ${t.type === "cardio" ? (t.sets_done ? "done" : "not started") : `${t.sets_done}/${t.sets_planned} sets done`}`) : ["- (nothing yet)"]),
    "",
    "CANDIDATES (id | name | main muscles | type):",
    ...req.exercises.map((e) => `${e.id} | ${e.name} | ${e.muscles.join(", ")} | ${e.type}${e.favorite ? " | favorite" : ""}`),
    "",
  );
  if (req.kind === "swap") {
    const from = today.find((t) => t.id === req.swap?.exercise_id);
    const why = req.swap?.why ? WHY_WORDS[req.swap.why] ?? req.swap.why : null;
    lines.push(`TASK: pick the 3 best replacements for "${from?.name ?? req.swap?.exercise_id}"${from ? ` (${from.muscles.join(", ") || from.type})` : ""}, best first.${why ? ` Why they're swapping: ${why}.` : ""}`);
  } else {
    lines.push(`TASK: suggest up to 4 exercises worth adding to today's workout, best first. Fill real gaps (muscles today should cover but doesn't yet, missing core, balance for lots of pressing or pulling); vary them across muscles; don't pile on muscles that are already well covered.`);
  }
  if (req.prompt.trim()) lines.push(`They said: """${req.prompt.trim()}"""`);
  return lines.join("\n");
}

export const PICK_TOOL = {
  name: "save_picks",
  description: "Return the picks, best first.",
  input_schema: {
    type: "object",
    properties: {
      picks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            exercise_id: { type: "string", description: "An id from the CANDIDATES list, copied exactly." },
            reason: { type: "string", description: "Why it fits, under 90 characters." },
          },
          required: ["exercise_id", "reason"],
        },
      },
    },
    required: ["picks"],
  },
};
