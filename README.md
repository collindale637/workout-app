# Reps — workout coach

A family-only "personal trainer in your pocket": plans built from your goals and the equipment at
whichever gym you're in, live workout logging with RPE on every set, muscle recovery, and progress.
It's a Next.js web app installed to the iPhone home screen (PWA).

- **Plan (source of truth):** https://claude.ai/artifact/YQJCg18ubSMnsEAoVgyLo4
- **Design inspiration (dark 4B-1 home + 4B live workout):** https://claude.ai/artifact/TBC2EfQtU2hLsa3Z47pCNe
  — inspiration, not a spec.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind 4) on Vercel · Supabase (Postgres + RLS, Auth, Storage)
· PWA (manifest + service worker). Workout generation runs on the phone; AI (Claude API) runs only on the
server (`/api/ai`), so the API key never reaches the phone.

> This Next.js version has breaking changes from older docs (e.g. `middleware.ts` is now
> `src/proxy.ts`, Cache Components is on). Check `node_modules/next/dist/docs/` before changing
> framework-level code.

## What's built

**Phase 0 (live):** app shell, dark theme, PWA, email + password sign-in, profile, 20-table schema with RLS,
exercise catalog (19 muscles, 86 equipment items, 892 exercises, 9 splits; 11 from Phase 2).

**Phase 1 (log it):**

| Feature | Where |
|---|---|
| Welcome flow (name, goal, experience, days, session length, units, first gym; expanded in Phase 4) | `src/app/(focus)/welcome/` |
| Gyms: templates, categorized equipment checklist, dumbbell/plate/stack details | More → Gyms, `src/lib/gyms.ts` |
| Active gym switcher (header pill on Today and Progress) | `src/components/gym-switcher.tsx` |
| Workout builder: search + muscle filters, defaults to what the active gym has | `src/components/exercise-picker.tsx` |
| Live workout: big weight/reps steppers, RPE on every set (blank = your default), warm-up/working/drop sets, rest timer, supersets, notes, swap/add/reorder/remove, finish summary with PRs | `src/app/(focus)/workout/` |
| Cardio logging (run, walk, bike, row, elliptical, stairs, swim, HIIT, other) | `src/app/(focus)/cardio/` |
| History list and detail; repeat or delete a workout | Progress tab |
| Exercise library + custom exercises | More → Exercise library |
| Offline: every screen saved by the service worker; all data in IndexedDB, synced to Supabase | `src/lib/db/`, `public/sw.js` |

**Phase 2 (smart workouts):**

| Feature | Where |
|---|---|
| Recovery model: per-set fatigue (role × RPE), fading by muscle size; 0–100% per muscle | `src/lib/recovery.ts` |
| Recovery tab: front/back body heat map, every muscle's score, tap for the sets that hit it | `src/app/(app)/recovery/`, `src/components/body-map.tsx` |
| Rules-based generator: target muscles → exercises the active gym supports, scored on coverage, recovery, staples, favorites, variety; dosed by goal; cardio when the goal or day calls for it | `src/lib/generator.ts` |
| Split library (11 splits incl. PHUL and Hybrid lifting + cardio) and plan builder: pick a split, goal and length; every day is filled for your gym | Plan tab, `src/app/(app)/plan/` |
| Plan day editor: sets/reps/rest, swap, add, reorder, superset, regenerate, rename, change muscles, start now | `/plan/day` |
| Today's "Up next": the next plan day, "target fresh muscles", or muscles you pick; Regenerate; suggested weights | `src/app/(app)/up-next-card.tsx`, `src/lib/up-next.ts` |
| Weight suggestions (double progression), using the gym's plate/dumbbell steps; the live workout prefills them | `src/lib/progression.ts` |
| Gym auto-swap: exercises the active gym can't do swap for the closest match (Up next, and an open workout when you switch gyms) | `closestMatch` / `adaptToGym` in `src/lib/generator.ts` |
| Favorites and "never suggest" per exercise | More → Exercise library → an exercise |

Tuning knobs (all starting values): `F_MAX`, thresholds and fresh-day templates in `recovery.ts`; `MUSCLE_PRIORITY`,
`STAPLES`, scoring weights and `dose()` in `generator.ts`. Day names drive two extras: "Power" days use strength dosing,
"+ Cardio" days get a cardio block, and "Cardio + Core" is mostly cardio.

**Phase 3 (AI):**

| Feature | Where |
|---|---|
| One server route for Claude: sign-in check, monthly cap, JSON tool answers, exercise-ID allowlist, problems sent back once to fix | `src/app/api/ai/route.ts`, `src/lib/ai/run.ts`, `src/lib/ai/validate.ts` |
| Build a full plan with AI (goal, days, length, session time, free text), review, then "Use this plan"; ask for changes to the draft | Plan → Build with AI (`/plan/ai`) |
| Plain-English plan edits ("make day 2 shorter"): shows what changed and keeps day links so history and "next day" survive | Plan → Change this plan with AI (`/plan/ai?edit=…`) |
| Customize with AI: today's workout (sparkle button on Up next → use for today or start now) or one plan day (day editor) | `src/components/ai.tsx` |
| Import from pasted text or up to 5 photos; review screen marks every line Matched / Unsure (top 3) / Not found (choose, create custom, or skip) | Plan → Import a plan (`/plan/import`), matching in `src/lib/ai/match.ts` |
| AI usage log + family-wide monthly cap; spend shown under More and on AI screens | `ai_requests`, `ai_log_request()`, `ai_spend_this_month()` |

What Claude sees: your profile, the active gym's equipment, recovery scores, the last two weeks of workouts, and the
exercises that gym can do (id, name, main muscles, type). It must answer through a tool with a fixed JSON shape; every
exercise id and number is checked before you see anything, and nothing is saved until you accept it. Prompts live in
`src/lib/ai/prompts.ts`.

AI settings (Vercel → Project → Settings → Environment Variables, server-only):

| Variable | What |
|---|---|
| `ANTHROPIC_API_KEY` | Required for AI. Without it the AI buttons explain that AI isn't set up; everything else works. |
| `AI_MONTHLY_CAP_USD` | Family-wide monthly spend limit (default `10`). |
| `AI_MODEL` | Claude model (default `claude-sonnet-5-5`). |

**Phase 4 (progress and polish):**

| Feature | Where |
|---|---|
| Progress tab: this week (days vs your goal, hard sets, cardio minutes), consistency calendar (16 weeks, lifting and cardio days, weeks-in-a-row streak), recent PRs, top lifts with trend lines, sets per muscle this/last week against a target band, cardio totals and minutes per week, bodyweight trend | `src/app/(app)/progress/`, numbers in `src/lib/progress.ts` |
| Lift detail: estimated 1-rep max / heaviest / volume over 3M–All, all-time records, every PR, every session's sets | Progress → a lift (`/progress/lift?id=…`); all lifts at `/progress/lift` |
| Bodyweight log: one entry per day (logging again replaces it), 7-day average, 30-day change; edit or delete entries | Progress → Bodyweight, `src/lib/progress-data.ts` |
| Full onboarding: name + units, goal + experience, days + session length, cardio preference, first gym, then a starter plan from the best-fit split | `src/app/(focus)/welcome/`, `src/lib/onboarding.ts` |
| Cardio preference (lifting only / what my goal needs / lots) used by the generator, plan builder and AI | More → Profile; `defaultCardio()` in `generator.ts` |
| Generator tuning: no doubled-up variants (two lateral raises), at most two rows, direct arm work on pull/upper days; three no-equipment moves (Doorframe Row, Pike Push-Up, Prone Y-T-W Raise) so bodyweight-only gyms can fill pull days | `src/lib/generator.ts`, `scripts/catalog-data.mjs` |
| Charts: small hand-built SVG charts (no library), touch for values; series colors checked for color-blind separation | `src/components/charts.tsx`, `--chart-1/2` in `globals.css` |

How the numbers work: estimated 1-rep max is Epley (weight × (1 + reps ÷ 30)) from working sets of 12 reps or fewer; a PR
is a session that beats every earlier one (best estimated max, heaviest weight, or most reps for bodyweight moves), and
the finish summary uses the same rule. Weekly sets count working and drop sets, primary muscle 1, secondary 0.5. Weeks
run Sunday to Saturday, like Today's week strip.

### How offline sync works

The phone keeps its own database (IndexedDB, via Dexie), one per signed-in person. Every change is written there first
and added to an "outbox"; deletes leave a "tombstone". Sync runs on open, a few seconds after changes, when the signal
returns and every minute: it uploads the outbox (parents before children), sends deletes, then downloads anything
changed on the server since the last sync. Changes still waiting to upload win over server copies.
More → Sync shows the status. The exercise library downloads once (about 1 MB) and again only when
`CATALOG_VERSION` changes.

## Database updates

| Migration | What | Applied to Supabase |
|---|---|---|
| `20261115000100_schema.sql` | Phase 0 schema + RLS | ✓ |
| `20261115000200_catalog_seed.sql` | Exercise catalog (generated) | ✓ |
| `20261115000300_lock_trigger_functions.sql` | Security advisor fix | ✓ |
| `20261116000100_phase1_logging.sql` | Workout name; per-exercise targets, rest, notes; onboarding flag; cardio notes | ✓ |
| `20261116000200_cardio_in_workouts.sql` | Cardio results link to the cardio exercise in a workout (Start / Done) | ✓ |
| `20261116000300_phase2_plans.sql` | Plan days remember their target muscles; PHUL and Hybrid splits | ✓ |
| `20261117000100_phase3_ai.sql` | Plan notes; AI usage log written through `ai_log_request()`, spend via `ai_spend_this_month()` | ✓ |
| `20261118000100_phase4_progress.sql` | `profiles.cardio_pref`; three no-equipment exercises | ✓ |
| `20261119000100_outdoor_cardio_gear.sql` | Outdoor Bike Ride needs a bike, Skating needs skates (new equipment items) | ✓ |
| `20261119000200_skipped_sets.sql` | `workout_exercises.skipped_sets`: which planned sets were skipped | ✓ |
| `20261120000100_ai_pick_kinds.sql` | AI usage log accepts `swap` and `suggest` requests | ✓ |
| `20261120000200_recovery_times.sql` | Faster muscle recovery times (30 / 36 / 44 h; lower back 48 h) | ✓ |
| `20261121000100_cardio_incline.sql` | `cardio_sessions.incline`: optional treadmill incline (% grade, 0–40) | ✓ |
| `20261122000100_height_sex.sql` | `profiles.height_in` (inches) and `profiles.sex` (male / female, optional): used to suggest starting weights | ✓ |
| `20261123000100_ai_jobs.sql` | `ai_jobs` table: AI plan builds run on the server and the draft waits for you if you leave the screen | ✓ |
| `20261124000100_injuries.sql` | `profiles.avoid_areas` (knees, lower back…) and `profiles.injury_note`: "Anything to avoid?" steers plans, swaps and AI | ✓ |
| `20261125000100_dev_notes.sql` | `dev_notes` table ("Note to developer", owner-only) + admin inbox: `app_admins` (rows added by hand), `is_app_admin()`, `dev_notes_inbox()`, `dev_note_set_done()` | ✓ |
| `20261126000100_hide_crucifix.sql` | Crucifix hold hidden from the exercise list (inactive) | ✓ |
| `20261127000100_exercise_twins.sql` | Barbell / dumbbell twins (Dumbbell Deadlift, Dumbbell Walking Lunge, Barbell Bulgarian Split Squat…), Assisted Dip, Single-Leg Lying Leg Curl, and more names imported plans use (Cable Fly, Seated Face Pull…) | ✓ |
| `20261127000200_exercise_twins_2.sql` | More barbell / dumbbell twins: Dumbbell Front Squat, Push Press, Sumo Deadlift, Glute Bridge, Preacher Curl; Barbell Overhead Triceps Extension | ✓ |
| `20261127000300_preacher_curl_default.sql` | "Preacher Curl" with no gear named now means the dumbbell version (alternate name moved off the barbell one) | ✓ |
| `20261128000100_catalog_ez_preacher_and_more.sql` | New exercises: EZ-Bar and Close-Grip EZ-Bar Preacher Curl, Twisting Hanging Knee Raise, Prisoner Squat, Bodyweight Reverse Lunge, Single-Leg Calf Raise, Lying Leg Raise; "Cable Tricep Extension(s)" is an alternate name for Tricep Pushdown | ✓ |
| `20261128000200_overhead_cable_extension_names.sql` | "Overhead Cable Tricep Extension" and similar written names now match Overhead Cable Extension | ✓ |
| `20261129000100_plan_weeks.sql` | Plans by week: `plan_days.week` (1–12), and on `plans` the progress fields `current_week`, `week_started_at`, `skipped_day_ids`, `completed_at`, `completion_dismissed_at` | ✓ |
| `20261130000100_ai_request_calls.sql` | `ai_requests.calls`: how many Claude calls each AI request took; `ai_log_request()` gains an optional `p_calls` | ✓ |
| `20261201000100_catalog_batch1_aliases_equipment.sql` | Exercise library batch 1: 40 lifts get the names people search for (Yates Row, Meadows Row, Nordic Curl, V-Up…), kettlebell / EZ-bar / band options on existing lifts, equipment fixes (Drag Curl, Weighted Bench Dip, banded barbell lifts need bands, decline/incline benches), 3 duplicates hidden, Air Bike (floor ab) renamed Bicycle Crunch | ✓ |
| `20261202000100_catalog_batch2_staples.sql` | Exercise library batch 2: 89 staples that were missing (Pendlay Row, Neutral-Grip Pull-Up, Knee and Archer Push-Ups, Pistol and Sissy Squats, Bird Dog, Copenhagen Plank, band and cable versions, mobility stretches, Hiking, Sprints and Swimming). New rows only; nothing existing changes. Safe to re-run. | ✓ |
| `20261202000200_catalog_batch3.sql` | Exercise library batch 3: 65 more exercises (Paused Bench Press, Cossack Squat, Devil Press, Hindu Push-Up, carries, cable and suspension variations, mobility stretches, Rucking / Yoga / Pilates / HIIT logs) and 4 new equipment items (sliders, hand gripper, rotary torso machine, back extension machine). New rows only. Safe to re-run. | ✓ |
| `20261202000300_catalog_batch4.sql` | Exercise library batch 4: 114 more exercises (sports and activity logs like Soccer, Tennis and Rock Climbing; strongman and Olympic variations; paused and tempo lifts; band, cable, sandbag and machine variations) and 6 new equipment items (pullover machine, Viking press, agility ladder, heavy bag, carry frame, Husafell stone). New rows only. Safe to re-run. | ✓ |
| `20261202000400_catalog_photos_matched.sql` | Adds photos to 10 added exercises (Walking Lunge, Air Bike, Spin Bike, EZ-bar Preacher Curl, Neutral-Grip Pull-Up, Alternating DB Bench Press, Single-Arm Machine Curl, Hip CARs, Shoulder CARs, Arc Trainer) that match an existing photo set. Only fills empty photo lists. Safe to re-run. | ✓ |
| `20261203000100_catalog_search_aliases.sql` | Exercise library batch 5: 1,129 alternate names on 504 exercises so search and imported plans find them by the names people use (Gravitron, Skullcrusher, RFESS, Assault Bike, Hex Bar Deadlift, "Squat" = back squat, "Leg Curl" = lying leg curl, foam-roll names for the SMR stretches…). Appends only names an exercise doesn't have yet. Safe to re-run. | ✓ |

## One-time setup

### 1. Supabase (new, separate project)

1. Create a project at supabase.com.
2. **SQL Editor:** run `supabase/migrations/20261115000100_schema.sql`, then
   `supabase/migrations/20261115000200_catalog_seed.sql` (or `supabase db push` with the CLI).
3. **Authentication → Sign In / Providers → Email:** keep Email on and turn **off "Confirm email"**, so new
   accounts work right away without sending email (same setup as the macro tracker).
4. **Adding family:** while "Allow new users to sign up" is on, send them the app's address; they tap
   *New here? Create an account*, enter their first name, email and a password, and their profile is
   created automatically. Once everyone's in, turn **off "Allow new users to sign up"** so nobody else can join.
   Later additions: Authentication → Users → Add user → *Create new user* (tick auto-confirm).
5. **Forgotten password:** Authentication → Users → the person → reset/set a new password, then they can
   change it under More → Change password.

### 2. Environment

Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key. Add the same
`NEXT_PUBLIC_*` values to Vercel → Project → Settings → Environment Variables.

### 3. Exercise pictures (optional, recommended)

Pictures load from the public free-exercise-db repo by default. To host them yourself:
put `SUPABASE_SECRET_KEY` in `.env.local`, run `npm run images:upload`, then set
`NEXT_PUBLIC_EXERCISE_IMAGE_BASE` as described in `.env.example`.

### 4. Install on iPhone

Open the Vercel URL in Safari → Share → **Add to Home Screen**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (units, equipment matching, sync, recovery, generator, weight suggestions, AI checks and import matching, progress numbers, onboarding) |
| `npm run test:db` | Applies the migrations to an in-memory Postgres and checks RLS |
| `npm run seed:build` | Regenerates the catalog seed from free-exercise-db + `scripts/catalog-data.mjs` |
| `npm run images:upload` | Copies exercise pictures into Supabase Storage |

## Catalog notes

- Exercise data comes from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense /
  public domain), pinned to one commit. The generator splits its "shoulders" into front/side/rear delts
  and "abdominals" into abs/obliques, and works out equipment from exercise names.
- `exercise_equipment`: rows sharing an `option_group` are alternatives; every group must be met.
  No rows = no equipment needed.
- `sets.rpe` null means "use the person's default RPE" (8 unless changed).
- To fix a tag, edit `scripts/catalog-data.mjs` (`COMMON`, `MUSCLE_OVERRIDES`, `EXTRA_EXERCISES`) or the
  rules in `scripts/build-seed.mjs`, run `npm run seed:build`, and apply the regenerated seed.
