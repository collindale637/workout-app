/**
 * True if the previous accepted tap was less than `ms` ago (a double tap to ignore); otherwise records this tap.
 * Used by Log set so a quick double tap can't log the same set twice.
 */
export function isDoubleTap(last: { current: number }, ms = 700, now = Date.now()) {
  if (now - last.current < ms) return true;
  last.current = now;
  return false;
}
