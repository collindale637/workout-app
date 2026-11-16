#!/usr/bin/env node
// Copies every exercise picture from free-exercise-db into the Supabase Storage bucket
// "exercise-images" (created by the schema migration), so the app doesn't depend on GitHub.
//
//   npm run images:upload     (reads .env.local: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY)
//
// Then set NEXT_PUBLIC_EXERCISE_IMAGE_BASE=<url>/storage/v1/object/public/exercise-images in Vercel.
// Safe to re-run: files already in the bucket are skipped.

import { createClient } from "@supabase/supabase-js";
import { SOURCE_COMMIT } from "./catalog-data.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const SRC = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${SOURCE_COMMIT}/exercises`;

const { data: rows, error } = await supabase.from("exercises").select("images").not("images", "eq", "{}");
if (error) throw error;
const paths = [...new Set(rows.flatMap((r) => r.images))];
console.log(`${paths.length} images to check`);

let uploaded = 0, skipped = 0, failed = 0;
const queue = [...paths];
async function worker() {
  while (queue.length) {
    const path = queue.shift();
    const [folder, file] = path.split("/");
    const { data: existing } = await supabase.storage.from("exercise-images").list(folder, { search: file });
    if (existing?.some((f) => f.name === file)) { skipped++; continue; }
    const res = await fetch(`${SRC}/${path}`);
    if (!res.ok) { failed++; console.warn("missing", path); continue; }
    const body = new Uint8Array(await res.arrayBuffer());
    const { error: upErr } = await supabase.storage.from("exercise-images").upload(path, body, {
      contentType: "image/jpeg", cacheControl: "31536000", upsert: false,
    });
    if (upErr) { failed++; console.warn(path, upErr.message); } else uploaded++;
    if ((uploaded + skipped) % 100 === 0) console.log(`${uploaded} uploaded, ${skipped} skipped`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`Done: ${uploaded} uploaded, ${skipped} already there, ${failed} failed.`);
