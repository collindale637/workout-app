"use client";

import type { MuscleRecovery, RecoveryState } from "@/lib/recovery";
import type { Sex } from "@/lib/db/types";

/*
  Front and back body drawn in SVG (left half drawn, right half mirrored), one or more shapes per tracked muscle:
  quads have three heads, abs are four blocks, hamstrings and calves two heads each.
  Colors: fresh = cobalt, recovering = amber, fatigued = warning orange.
  `highlight` dims every muscle not in the list (used when you tap a readiness tile).
*/

export const STATE_COLOR: Record<RecoveryState, string> = {
  fresh: "#3D63FF",
  recovering: "#F5B54A",
  fatigued: "#FF8A3D",
};

export const STATE_LABEL: Record<RecoveryState, string> = { fresh: "Fresh", recovering: "Recovering", fatigued: "Fatigued" };

/** A path, or a rounded block [x, y, width, height]. */
type Shape = { muscle: string; d: string | [number, number, number, number] };
const s = (muscle: string, d: Shape["d"]): Shape => ({ muscle, d });

const FRONT: Shape[] = [
  s("traps", "M56 32 C53 35 48 37 43 39 C48 40.5 53 40 57 37.5 Z"),
  s("side_delts", "M31 46 C28 50 27 55 28 61 C30.5 60 32.5 57 33.5 53 Z"),
  s("front_delts", "M45 40 C38 40 33 43.5 31.5 50 C32.5 55 35.5 57 38 56 C40 51 42.5 46 46.5 42 Z"),
  s("chest", "M58.6 42 C53 40 47.5 41 45 44.5 C42.5 49 42.5 56 44.5 60.5 C48.5 64.5 54.5 65 58.6 63 Z"),
  s("biceps", "M33.5 58 C29.5 62 28.5 71 29.5 79 C31 82 34.5 82 36 79 C38 71 38 63 36.5 58 Z"),
  s("forearms", "M29 83.5 C26 91 24.2 101 24.2 110 C26 112 29 112 30 110 C32 101 35 92 35.2 84.5 Z"),
  s("obliques", "M50.5 66.5 C46.5 74 45.5 90 47.5 103.5 C49 106.5 51 107.5 52 107.5 C51 96 51 80 51.6 66.5 Z"),
  s("abs", [52.8, 66.5, 5.6, 10.4]),
  s("abs", [52.8, 78.6, 5.6, 10.4]),
  s("abs", [53.1, 90.7, 5.3, 10.4]),
  s("abs", [53.7, 102.8, 4.7, 7.2]),
  s("abductors", "M45.5 108.5 C42.5 112 41.5 119 42 126 C44.2 122 46.2 116.5 48.5 112 Z"),
  s("quads", "M47.5 115.5 C43.5 122 42.3 134 43 148 C43.8 158 45.8 164 48.8 167 C50 158 49.4 140 51.2 124 Z"),
  s("quads", "M54.2 117.5 C50.5 120.5 49.6 134 50.3 150 C50.8 160 52.2 166 53.6 166 C55.2 160 56.2 140 56.1 126 Z"),
  s("quads", "M56.6 149.5 C54.8 153.5 54.3 160.5 55.2 165.5 C57 166 57.8 163 57.8 158 Z"),
  s("adductors", "M59.2 128 C56.6 130.5 56 138 56.5 147.5 C57.8 145.5 58.8 140 59.4 134 Z"),
  s("calves", "M44.2 181.5 C42.7 191.5 43.6 205 45.6 214 C47.2 216 49.1 215 50 212 C51 203 51 191 49.6 182 Z"),
];

const BACK: Shape[] = [
  s("upper_back", "M47 44.5 C43.2 47.5 42.2 53.5 44.2 58.5 C48 60.5 52 58.5 54.2 54.5 C52.2 50.5 50.2 47.5 47 44.5 Z"),
  s("traps", "M60 27 C57 33 52 37 45 40 C50.5 43 55.5 50 60 67 Z"),
  s("side_delts", "M31 46 C28 50 27 55 28 61 C30.5 60 32.5 57 33.5 53 Z"),
  s("rear_delts", "M44.5 41 C38 41 33 44.5 32 50.5 C34 54.5 38 55.5 41 54.5 C42.8 50.5 44.8 46.5 47 43.5 Z"),
  s("triceps", "M33.5 57.5 C29.5 62 28.5 71 29.5 79 C31 82 34.5 82 36 79 C38 71 38 63 36.5 57.5 Z"),
  s("forearms", "M29 83.5 C26 91 24.2 101 24.2 110 C26 112 29 112 30 110 C32 101 35 92 35.2 84.5 Z"),
  s("lats", "M44 60.5 C41 67.5 42 80 46 91.5 C50 95.5 54.5 96.5 57.4 95.5 C57.6 86 56.4 76 54.8 68.5 C51 64.5 47.2 61.5 44 60.5 Z"),
  s("lower_back", "M55.2 70 C56.6 78 58.2 90 58.8 98 L58.8 110.5 L55.3 110.5 C55 104 55 98 54.6 95 C56.6 92 57.2 82 55.2 70 Z"),
  s("abductors", "M46 105.5 C43 108.5 42.2 113.5 43 117.5 C46 113 50 111 54.2 110.2 C52 107 49 105.5 46 105.5 Z"),
  s("glutes", "M58.8 112 C52 110.5 45.5 113.5 44.3 121 C43.6 129.5 50 135.6 58.8 134 Z"),
  s("hamstrings", "M50.2 138 C45.2 141 43.4 150 44.2 160 C45 166 47 169 49 169 C51 160 51.3 148 52.2 139 Z"),
  s("hamstrings", "M57.6 138 C54.2 140 53.2 150 53.6 160 C54 166 55.4 169 56.4 168 C57.4 160 58 148 57.6 138 Z"),
  s("calves", "M44.2 178 C42.2 186 42.2 198 44.6 205 C47 207 48.8 204 49.4 198 C50 190 48.6 182 46.2 178 Z"),
  s("calves", "M51 178 C49.8 186 49.8 196 50.8 203 C52.8 206 54.3 203 54.8 197 C55.2 189 53.8 182 51 178 Z"),
];

/** Decorative separations (chest line, ab lines, knees, spine) drawn on top, not tappable. */
const FRONT_LINES = "M58.6 52 C53 51 48 52 44 55 M53 76.8 h5.4 M53 88.8 h5.4 M53.4 100.9 h5 M45 171 C47 173 50 173 52 171 M45.5 189 C47 196 47 203 46.5 210";
const BACK_LINES = "M60 67 L60 112 M46 96 C50 100 54 101 58 100 M48.5 127 C51 129 55 130 58.5 129.5";

/** Neutral body outline the muscles sit on. */
const SILHOUETTE =
  "M60 6 C53 6 49 11 49 18 C49 25 53 30 56 31 L56 35 C50 37 42 38 36 41 C30 44 28 50 28 58 C27 70 26 82 26 90 " +
  "C24 100 22 110 22 118 C22 122 26 124 28 121 C31 112 34 102 37 92 C39 84 40 76 41 70 C42 82 42 96 41 108 " +
  "C39 120 40 136 41 150 C42 164 43 176 42 190 C41 204 42 218 44 230 C44 236 50 238 53 235 C54 222 55 206 55 190 " +
  "C56 176 57 160 58 146 L60 130 L62 146 C63 160 64 176 65 190 C65 206 66 222 67 235 C70 238 76 236 76 230 " +
  "C78 218 79 204 78 190 C77 176 78 164 79 150 C80 136 81 120 79 108 C78 96 78 82 79 70 C80 76 81 84 83 92 " +
  "C86 102 89 112 92 121 C94 124 98 122 98 118 C98 110 96 100 94 90 C94 82 93 70 92 58 C92 50 90 44 84 41 " +
  "C78 38 70 37 64 35 L64 31 C67 30 71 25 71 18 C71 11 67 6 60 6 Z";

const MIRROR = "translate(120 0) scale(-1 1)";

/* ---- Female figure: the same muscles, reshaped ----
   Rather than a second hand-drawn body, every point is moved sideways toward or away from the centre line (x = 60)
   by a factor that depends on height: narrower shoulders and arms, a narrower waist, wider hips. Each muscle keeps its
   shape, tap area and colour; only the proportions change. The chest gets its own rounder shape. */

/** Width factor by height (y): [y, factor] stops, straight lines between. An hourglass: smaller head, slim neck,
    narrow shoulders and waist, wide hips and upper thighs. */
const FEMALE_WIDTH: [number, number][] = [
  [0, 0.92], [26, 0.92], [31, 0.8], [37, 0.84], [44, 0.84], [60, 0.85], [74, 0.79], [88, 0.77], [98, 0.84], [106, 1.0],
  [116, 1.15], [130, 1.16], [146, 1.09], [166, 1.0], [190, 0.95], [244, 0.93],
];
/** Arms follow the shoulders in and get slimmer around their own centre line. Measured from the body's centre because
    the outline is drawn whole (both arms), unlike the mirrored muscles. Below the elbow the arm hangs further out, so
    the hip outline (about 21 from the centre at y ≈ 120) isn't mistaken for it. */
const ARM_Y: [number, number] = [44, 126];
const ARM_SHIFT = 0.85;
const ARM_SLIM = 0.82;
/** Distance of the arm's centre line from the body's centre, by height (left arm). */
const ARM_MID: [number, number][] = [[44, 27], [60, 27.5], [80, 27.5], [100, 30], [126, 33]];
const isArm = (x: number, y: number) => y > ARM_Y[0] && y < ARM_Y[1] && Math.abs(60 - x) > (y > 100 ? 23 : 19.5);

function lerp(stops: [number, number][], y: number) {
  for (let i = 1; i < stops.length; i++) {
    const [y1, k1] = stops[i];
    const [y0, k0] = stops[i - 1];
    if (y <= y1) return k0 + ((k1 - k0) * (y - y0)) / (y1 - y0);
  }
  return stops[stops.length - 1][1];
}
const widthAt = (y: number) => (y <= FEMALE_WIDTH[0][0] ? FEMALE_WIDTH[0][1] : lerp(FEMALE_WIDTH, y));
function morphX(x: number, y: number) {
  if (!isArm(x, y)) return 60 - (60 - x) * widthAt(y);
  const side = x < 60 ? -1 : 1;
  const mid = lerp(ARM_MID, y);
  const off = Math.abs(60 - x) - mid; // + outside the arm's centre line, − inside
  return 60 + side * (mid * ARM_SHIFT + off * ARM_SLIM);
}
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Reshapes a path made of absolute M / L / C points (plus relative h for short lines). */
function morphPath(d: string): string {
  const out: string[] = [];
  let cx = 0;
  let cy = 0;
  for (const [, cmd, args] of d.matchAll(/([MLCZhz])([^MLCZhz]*)/g)) {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    if (cmd === "Z" || cmd === "z") out.push("Z");
    else if (cmd === "h") {
      const x = cx + n[0];
      out.push(`L${r1(morphX(x, cy))} ${cy}`);
      cx = x;
    } else {
      const pts: string[] = [];
      for (let i = 0; i < n.length; i += 2) {
        pts.push(`${r1(morphX(n[i], n[i + 1]))} ${n[i + 1]}`);
        cx = n[i];
        cy = n[i + 1];
      }
      out.push(`${cmd}${pts.join(" ")}`);
    }
    if (cmd === "M") {
      cx = n[0];
      cy = n[1];
    }
  }
  return out.join(" ");
}
function morphShape(sh: Shape): Shape {
  if (!Array.isArray(sh.d)) return { ...sh, d: morphPath(sh.d) };
  const [x, y, w, h] = sh.d;
  const left = morphX(x, y + h / 2);
  return { ...sh, d: [r1(left), y, r1(morphX(x + w, y + h / 2) - left), h] };
}

/** Female chest: one rounded shape per side with a gap at the centre line (drawn before reshaping, like the rest). */
const FEMALE_CHEST = "M57.6 46.9 C54 44.9 47.5 45.2 44.2 48.9 C41.4 52.4 41.8 59.4 46 63.6 C50 67 55.8 66.4 57.6 62.4 C58.7 57.9 58.7 51.4 57.6 46.9 Z";
const FEMALE_FRONT_LINES = FRONT_LINES.replace("M58.6 52 C53 51 48 52 44 55 ", "M57.2 63 C55 66 50 66.4 46.4 64 ");
const FIGURES: Record<Sex, { front: Shape[]; back: Shape[]; frontLines: string; backLines: string; silhouette: string }> = {
  male: { front: FRONT, back: BACK, frontLines: FRONT_LINES, backLines: BACK_LINES, silhouette: SILHOUETTE },
  female: {
    front: FRONT.map((sh) => (sh.muscle === "chest" ? { ...sh, d: FEMALE_CHEST } : sh)).map(morphShape),
    back: BACK.map(morphShape),
    frontLines: morphPath(FEMALE_FRONT_LINES),
    backLines: morphPath(BACK_LINES),
    silhouette: morphPath(SILHOUETTE),
  },
};

function Figure({
  shapes,
  lines,
  silhouette,
  label,
  recovery,
  selected,
  highlight,
  onSelect,
}: {
  shapes: Shape[];
  lines: string;
  silhouette: string;
  label: string;
  recovery: Map<string, MuscleRecovery>;
  selected: string | null;
  highlight: Set<string> | null;
  onSelect: (muscle: string) => void;
}) {
  const half = (side: "l" | "r") =>
    shapes.map((sh, i) => {
      const r = recovery.get(sh.muscle);
      const dimmed = highlight ? !highlight.has(sh.muscle) : selected ? selected !== sh.muscle : false;
      const isSel = selected === sh.muscle;
      const props = {
        fill: r ? STATE_COLOR[r.state] : "var(--border)",
        opacity: dimmed ? 0.22 : 1,
        stroke: isSel ? "#fff" : "var(--bg)",
        strokeWidth: isSel ? 1.4 : 0.7,
        onClick: () => onSelect(sh.muscle),
        style: { cursor: "pointer", transition: "opacity .2s" },
      };
      const key = `${sh.muscle}-${i}-${side}`;
      const title = side === "l" && r ? <title>{`${sh.muscle.replace("_", " ")}: ${r.score}%`}</title> : null;
      return Array.isArray(sh.d) ? (
        <rect key={key} x={sh.d[0]} y={sh.d[1]} width={sh.d[2]} height={sh.d[3]} rx={1.6} {...props}>{title}</rect>
      ) : (
        <path key={key} d={sh.d} {...props}>{title}</path>
      );
    });
  return (
    <figure className="flex flex-1 flex-col items-center gap-1">
      <svg viewBox="16 0 88 244" className="h-auto w-full max-w-[170px]" role="group" aria-label={`${label} of body`}>
        <path d={silhouette} fill="var(--card-2)" stroke="var(--border)" strokeWidth="0.8" />
        <g strokeLinejoin="round">
          {half("l")}
          <g transform={MIRROR}>{half("r")}</g>
        </g>
        <g fill="none" stroke="var(--bg)" strokeWidth="0.6" opacity="0.55" pointerEvents="none">
          <path d={lines} />
          <path d={lines} transform={MIRROR} />
        </g>
      </svg>
      <figcaption className="display text-sm font-bold tracking-[0.1em] text-muted">{label}</figcaption>
    </figure>
  );
}

export function BodyMap({
  recovery,
  selected,
  highlight = null,
  onSelect,
  sex = null,
}: {
  recovery: Map<string, MuscleRecovery>;
  selected: string | null;
  highlight?: string[] | null;
  onSelect: (muscle: string) => void;
  /** The account's sex (Profile). Female gets the female figure; male or not set keeps the original. */
  sex?: Sex | null;
}) {
  const hl = highlight ? new Set(highlight) : null;
  const f = FIGURES[sex === "female" ? "female" : "male"];
  return (
    <div className="flex gap-2">
      <Figure shapes={f.front} lines={f.frontLines} silhouette={f.silhouette} label="Front" recovery={recovery} selected={selected} highlight={hl} onSelect={onSelect} />
      <Figure shapes={f.back} lines={f.backLines} silhouette={f.silhouette} label="Back" recovery={recovery} selected={selected} highlight={hl} onSelect={onSelect} />
    </div>
  );
}
