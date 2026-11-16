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
| Invite-only sign-in with an emailed code | `src/app/login/`, `src/proxy.ts`, `src/app/auth/confirm/` |
| Profile (name, goal, units, default RPE…) | More tab, `src/lib/profile.ts` |
| Schema: 20 tables, RLS on every personal table | `supabase/migrations/20261115000100_schema.sql` |
| Catalog: 19 muscles, 86 equipment items, 889 exercises, 9 splits | `supabase/migrations/20261115000200_catalog_seed.sql` (generated) |
| Spot-check of the ~200 common lifts | `supabase/catalog-report.md` |
| DB tests (RLS with two users) | `npm run test:db` |

## One-time setup

### 1. Supabase (new, separate project)

1. Create a project at supabase.com.
2. **SQL Editor:** run `supabase/migrations/20261115000100_schema.sql`, then
   `supabase/migrations/20261115000200_catalog_seed.sql` (or `supabase db push` with the CLI).
3. **Authentication → Sign In / Providers → Email:** keep Email on, turn **"Allow new users to sign up" off**.
4. **Authentication → Emails → Magic Link** template: make sure it shows the code, e.g.

   ```html
   <h2>Your sign-in code</h2>
   <p style="font-size:32px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
   <p>Or <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">tap here</a> (opens in Safari).</p>
   ```

5. **Authentication → URL Configuration:** Site URL = your Vercel URL; add
   `https://<your-app>.vercel.app/auth/confirm` to Redirect URLs.
6. **Add family members:** Authentication → Users → Add user → *Create new user* (tick auto-confirm).
   Their profile row is created automatically. They sign in with the code.

Why a code instead of a link: on iPhone, links in Mail open in Safari, not the home-screen app, so a
magic link would sign you in to the wrong place. Typing the 6-digit code signs in the app itself.

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
