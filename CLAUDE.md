# Reps (workout app): notes for Claude

A family-only "personal trainer in your pocket" PWA for Collin and close family (under 5 people, non-commercial).
Next.js 16 (App Router, Cache Components on, `src/proxy.ts` instead of middleware) + Tailwind 4 on Vercel; Supabase
(email + password auth, Postgres with row level security). Read `AGENTS.md`: this Next.js version differs from older docs.

- Plan (source of truth): https://claude.ai/artifact/YQJCg18ubSMnsEAoVgyLo4
- Design inspiration (dark 4B-1 home + 4B live workout, not a spec): https://claude.ai/artifact/TBC2EfQtU2hLsa3Z47pCNe

## Shipping: what "push it" means

Same as the macro tracker. When Collin says **"push it"**: push the branch, open a pull request into `main`, and
**merge it**. Merging deploys to production on Vercel; "push it" is his approval for that.
Before pushing: `npm run lint`, `npm test`, `npm run test:db` and `npm run build` must pass.

## Conventions

- New branch per change (e.g. `phase-1-log-it`); never commit straight to `main`.
- Database changes: a dated, re-runnable migration in `supabase/migrations/`, added to `supabase/tests/rls.test.mjs`,
  and noted under "Database updates" in the README. Additive changes go out before the code that needs them.
- Offline first: screens read and write the phone's IndexedDB (`src/lib/db/`), never Supabase directly. Every write
  goes through `markDirty`/`markDeleted` so it syncs. Weights are stored in pounds, distances in miles.
- Pages are static shells (client components inside `DataProvider`), which is what lets the service worker serve them
  offline. Add new routes to `ROUTES` in `public/sw.js`.
- Exercise catalog changes: edit `scripts/catalog-data.mjs`, run `npm run seed:build`, bump `CATALOG_VERSION` in
  `src/lib/db/catalog.ts` so phones re-download it.
- Style: dark "4B Cobalt" tokens in `src/app/globals.css`; Barlow Condensed (caps) for headings/numbers/buttons, Barlow
  for body; 44px minimum touch targets.
- Brand: the app is called **Reps**. Logo = the italic cobalt "gym tag" (four white tally notches, gold slash, white
  REPS) in `src/components/logo.tsx` (`RepsLogo`, `RepsMark`); SVG copies and PNG icons are in `public/icons/`. Icons
  are cache-first in the service worker, so bump `VERSION` in `public/sw.js` whenever they change.
- Gold (`--gold`, the logo's slash) means "earned": PR badges, trophies, record counts, the best-ever number and
  chart dot, and the live "New PR" toast. Keep it off buttons, links, tabs and warnings (orange). `--gold-bright` is
  for fills and text on cobalt (same in light mode); `--gold` darkens in light mode for text on white. The recovery
  map's "recovering" amber stays for now (Collin's call, Nov 2026).
- Collin wants to learn the technical terms (PR, PWA, RLS…): use them, with a short plain explanation the first time.
