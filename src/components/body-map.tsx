"use client";

import type { MuscleRecovery, RecoveryState } from "@/lib/recovery";

/*
  A simple front/back body drawn in SVG, one shape per tracked muscle (left side drawn, right side mirrored).
  Colors: fresh = cobalt, recovering = amber, fatigued = warning orange.
*/

export const STATE_COLOR: Record<RecoveryState, string> = {
  fresh: "#3D63FF",
  recovering: "#F5B54A",
  fatigued: "#FF8A3D",
};

export const STATE_LABEL: Record<RecoveryState, string> = { fresh: "Fresh", recovering: "Recovering", fatigued: "Fatigued" };

type Shape = { muscle: string; d: string };

const FRONT: Shape[] = [
  { muscle: "front_delts", d: "M47 41 C41 40 35 43 34 50 C35 54 39 56 42 55 C45 50 47 46 47 41 Z" },
  { muscle: "side_delts", d: "M34 50 C31 51 29 56 30 62 C32 61 34 58 35 55 Z" },
  { muscle: "chest", d: "M59 44 C53 41 47 42 45 47 C43 53 43 59 47 63 C51 65 56 65 59 63 Z" },
  { muscle: "biceps", d: "M34 58 C30 62 29 72 30 80 C32 83 36 83 37 80 C39 72 39 63 37 58 Z" },
  { muscle: "forearms", d: "M30 84 C27 92 25 102 25 112 C27 114 30 114 31 112 C33 102 36 92 36 85 Z" },
  { muscle: "abs", d: "M51 67 L58.5 67 L58.5 108 L53 108 C51 100 51 80 51 67 Z" },
  { muscle: "obliques", d: "M49 68 C46 76 45 92 47 106 L51.5 108 C50 96 50 80 50.5 67 Z" },
  { muscle: "adductors", d: "M58.5 118 C55 124 53 136 54 150 L58.5 152 Z" },
  { muscle: "quads", d: "M53 114 C46 116 43 126 43 140 C43 152 45 162 49 167 C52 168 55 166 55 162 C53 150 52 132 56 118 Z" },
  { muscle: "calves", d: "M45 182 C43 192 44 206 46 216 C48 218 50 217 51 214 C52 204 52 192 50 182 Z" },
];

const BACK: Shape[] = [
  { muscle: "traps", d: "M60 30 C56 34 50 37 44 40 C49 43 55 46 60 52 Z" },
  { muscle: "rear_delts", d: "M45 41 C40 41 35 44 34 50 C36 54 40 55 43 54 C45 50 46 45 45 41 Z" },
  { muscle: "side_delts", d: "M34 50 C31 51 29 56 30 62 C32 61 34 58 35 55 Z" },
  { muscle: "upper_back", d: "M59 53 C55 49 50 46 45 45 C44 50 45 56 47 60 C51 63 55 66 59 68 Z" },
  { muscle: "lats", d: "M46 61 C42 66 42 78 46 90 C50 94 55 95 58 94 L58.5 70 C54 67 50 64 46 61 Z" },
  { muscle: "triceps", d: "M34 58 C30 62 29 72 30 80 C32 83 36 83 37 80 C39 72 39 63 37 58 Z" },
  { muscle: "forearms", d: "M30 84 C27 92 25 102 25 112 C27 114 30 114 31 112 C33 102 36 92 36 85 Z" },
  { muscle: "lower_back", d: "M51 95 L58.5 96 L58.5 110 L52 110 C51 105 51 100 51 95 Z" },
  { muscle: "glutes", d: "M58.5 112 C52 110 45 113 44 121 C43 130 50 136 58.5 134 Z" },
  { muscle: "abductors", d: "M44 113 C41 118 41 126 43 132 L45 124 Z" },
  { muscle: "hamstrings", d: "M57 138 C50 137 45 144 45 156 C45 164 48 168 51 169 C54 168 56 164 56 158 C55 150 55 144 57 138 Z" },
  { muscle: "calves", d: "M45 180 C42 188 42 200 45 208 C48 211 51 209 52 205 C53 196 52 186 50 180 Z" },
];

/** Neutral body outline the muscles sit on. */
const SILHOUETTE =
  "M60 6 C53 6 49 11 49 18 C49 25 53 30 56 31 L56 35 C50 37 42 38 36 41 C30 44 28 50 28 58 C27 70 26 82 26 90 " +
  "C24 100 22 110 22 118 C22 122 26 124 28 121 C31 112 34 102 37 92 C39 84 40 76 41 70 C42 82 42 96 41 108 " +
  "C39 120 40 136 41 150 C42 164 43 176 42 190 C41 204 42 218 44 230 C44 236 50 238 53 235 C54 222 55 206 55 190 " +
  "C56 176 57 160 58 146 L60 130 L62 146 C63 160 64 176 65 190 C65 206 66 222 67 235 C70 238 76 236 76 230 " +
  "C78 218 79 204 78 190 C77 176 78 164 79 150 C80 136 81 120 79 108 C78 96 78 82 79 70 C80 76 81 84 83 92 " +
  "C86 102 89 112 92 121 C94 124 98 122 98 118 C98 110 96 100 94 90 C94 82 93 70 92 58 C92 50 90 44 84 41 " +
  "C78 38 70 37 64 35 L64 31 C67 30 71 25 71 18 C71 11 67 6 60 6 Z";

function Figure({
  shapes,
  label,
  recovery,
  selected,
  onSelect,
}: {
  shapes: Shape[];
  label: string;
  recovery: Map<string, MuscleRecovery>;
  selected: string | null;
  onSelect: (muscle: string) => void;
}) {
  return (
    <figure className="flex flex-1 flex-col items-center gap-1">
      <svg viewBox="16 0 88 244" className="h-auto w-full max-w-[170px]" role="group" aria-label={`${label} of body`}>
        <path d={SILHOUETTE} fill="var(--card-2)" stroke="var(--border)" strokeWidth="1" />
        {shapes.flatMap((s) => {
          const r = recovery.get(s.muscle);
          const fill = r ? STATE_COLOR[r.state] : "var(--border)";
          const isSel = selected === s.muscle;
          const common = {
            d: s.d,
            fill,
            fillOpacity: r?.state === "fresh" ? 0.55 + (0.4 * (r.score - 85)) / 15 : 1,
            stroke: isSel ? "#fff" : "var(--bg)",
            strokeWidth: isSel ? 1.6 : 0.8,
            onClick: () => onSelect(s.muscle),
            style: { cursor: "pointer" },
          };
          return [
            <path key={`${s.muscle}-l`} {...common}>
              <title>{r ? `${s.muscle.replace("_", " ")}: ${r.score}%` : s.muscle}</title>
            </path>,
            <path key={`${s.muscle}-r`} {...common} transform="translate(120 0) scale(-1 1)" />,
          ];
        })}
      </svg>
      <figcaption className="display text-sm font-bold tracking-[0.1em] text-muted">{label}</figcaption>
    </figure>
  );
}

export function BodyMap({
  recovery,
  selected,
  onSelect,
}: {
  recovery: Map<string, MuscleRecovery>;
  selected: string | null;
  onSelect: (muscle: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <Figure shapes={FRONT} label="Front" recovery={recovery} selected={selected} onSelect={onSelect} />
      <Figure shapes={BACK} label="Back" recovery={recovery} selected={selected} onSelect={onSelect} />
    </div>
  );
}
