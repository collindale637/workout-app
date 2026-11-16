/**
 * Exercise pictures. Paths in the database are relative (e.g. "Barbell_Squat/0.jpg").
 * By default they load from the public free-exercise-db repo; once copied to Supabase Storage
 * (scripts/upload-exercise-images.mjs), set NEXT_PUBLIC_EXERCISE_IMAGE_BASE to the bucket URL.
 */
const DEFAULT_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises";

export const EXERCISE_IMAGE_BASE = (process.env.NEXT_PUBLIC_EXERCISE_IMAGE_BASE || DEFAULT_BASE).replace(/\/$/, "");

export function exerciseImageUrl(path: string) {
  return `${EXERCISE_IMAGE_BASE}/${path}`;
}
