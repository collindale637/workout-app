# Rep — workout coach (working name)

A family-only "personal trainer in your pocket": plans built from your goals and the equipment at
whichever gym you're in, live workout logging with RPE on every set, muscle recovery, and progress.
It's a Next.js web app installed to the iPhone home screen (PWA).

- **Plan (source of truth):** https://claude.ai/artifact/YQJCg18ubSMnsEAoVgyLo4
- **Design inspiration (dark 4B-1 home + 4B live workout):** https://claude.ai/artifact/TBC2EfQtU2hLsa3Z47pCNe
  — inspiration, not a spec.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind 4) on Vercel · Supabase (Postgres + RLS, Auth, Storage)
· PWA (manifest + service worker). Workout generation runs on the phone; AI (Claude API) is server-only
and arrives in Phase 3.

> This Next.js version has breaking changes from older docs (e.g. `middleware.ts` is now
> `src/proxy.ts`, Cache Components is on). Check `node_modules/next/dist/docs/` before changing
> framework-level code.

## What's built

**Phase 0 (live):** app shell, dark theme, PWA, email + password sign-in, profile, 20-table schema with RLS,
exercise catalog (19 muscles, 86 equipment items, 889 exercises, 9 splits; 11 from Phase 2).

**Phase 1 (log it):**

| Feature | Where |
|---|---|
| Welcome flow (name, goal, experience, days, session length, units, first gym) | `src/app/(focus)/welcome/` |
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
| `npm test` | Unit tests (units, equipment matching, sync, recovery, generator, weight suggestions) |
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
