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

## Phase 0 status

| Item | Where |
|---|---|
| App shell, dark theme tokens, 5-tab nav | `src/app/(app)/`, `src/app/globals.css` |
| PWA: manifest, icons, service worker | `src/app/manifest.ts`, `public/icons/`, `public/sw.js` |
| Email + password sign-in (family creates accounts, then sign-ups close) | `src/app/login/`, `src/proxy.ts` |
| Profile (name, goal, units, default RPE…) and change password | More tab, `src/lib/profile.ts` |
| Schema: 20 tables, RLS on every personal table | `supabase/migrations/20261115000100_schema.sql` |
| Catalog: 19 muscles, 86 equipment items, 889 exercises, 9 splits | `supabase/migrations/20261115000200_catalog_seed.sql` (generated) |
| Spot-check of the ~200 common lifts | `supabase/catalog-report.md` |
| DB tests (RLS with two users) | `npm run test:db` |

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
