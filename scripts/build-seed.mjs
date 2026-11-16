#!/usr/bin/env node
// Builds supabase/migrations/20261115000200_catalog_seed.sql from free-exercise-db
// (public domain, https://github.com/yuhonas/free-exercise-db) plus scripts/catalog-data.mjs.
//
//   node scripts/build-seed.mjs            # fetches the pinned dataset
//   node scripts/build-seed.mjs data.json  # or uses a local copy
//
// It maps the dataset's 17 muscle names onto our 19 tracked muscles (splitting shoulders into
// front/side/rear delts and abs into abs/obliques) and works out equipment needs from the
// exercise name, since the dataset only has one coarse equipment field.

import { readFileSync, writeFileSync } from "node:fs";
import { COMMON, EQUIPMENT, EXTRA_EXERCISES, INACTIVE, MUSCLE_OVERRIDES, MUSCLES, SOURCE_URL, SPLITS } from "./catalog-data.mjs";

const OUT = new URL("../supabase/migrations/20261115000200_catalog_seed.sql", import.meta.url);
const REPORT = new URL("../supabase/catalog-report.md", import.meta.url);

const raw = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], "utf8"))
  : await (await fetch(SOURCE_URL)).json();

const muscleIds = new Set(MUSCLES.map((m) => m[0]));
const equipmentIds = new Set(EQUIPMENT.map((e) => e[0]));

// ---------------------------------------------------------------------------
// Muscles
// ---------------------------------------------------------------------------

const has = (name, re) => re.test(name);

function deltFor(name) {
  if (has(name, /rear|reverse fl|reverse machine fl|face pull|back fl|pull apart|bent.over.*(raise|lateral|fly)|rear delt|sled reverse|external rotation/)) return "rear_delts";
  if (has(name, /\brow|pulldown|pull.?ups?\b|pullup|\bchin/) && !has(name, /upright|row to neck/)) return "rear_delts";
  if (has(name, /lateral|side lateral|deltoid raise|upright|iron cross|crucifix|scaption|lu raise|y raise|cuban|side laterals|power partials/)) return "side_delts";
  return "front_delts";
}

function mapMuscle(m, name) {
  switch (m) {
    case "abdominals":
      return has(name, /oblique|twist|side bend|wood ?chop|russian|side bridge|side plank|windmill|judo|landmine 180|pallof|figure 8|cable lift|side jackknife|spell caster|plate twist/) ? "obliques" : "abs";
    case "shoulders": return deltFor(name);
    case "middle back": return "upper_back";
    case "lower back": return "lower_back";
    case "quadriceps": return "quads";
    case "neck": return "traps";
    default: return m; // chest, biceps, triceps, forearms, lats, traps, glutes, hamstrings, calves, adductors, abductors
  }
}

function musclesFor(ex, name) {
  const override = MUSCLE_OVERRIDES[ex.id];
  if (override) {
    return new Map([...override.p.map((m) => [m, "primary"]), ...(override.s ?? []).map((m) => [m, "secondary"])]);
  }
  const roles = new Map();
  for (const m of ex.primaryMuscles) roles.set(mapMuscle(m, name), "primary");
  for (const m of ex.secondaryMuscles) {
    const id = mapMuscle(m, name);
    if (!roles.has(id)) roles.set(id, "secondary");
  }
  const add2 = (id) => { if (!roles.has(id)) roles.set(id, "secondary"); };
  // Fill in what the dataset leaves out.
  if (roles.get("chest") === "primary" && has(name, /press|push|dip/)) { add2("front_delts"); add2("triceps"); }
  if (roles.get("front_delts") === "primary" && has(name, /press|jerk|push.up/)) { add2("side_delts"); add2("triceps"); }
  if (roles.get("upper_back") === "primary" && has(name, /row/)) { add2("lats"); add2("rear_delts"); add2("biceps"); }
  if (roles.get("lats") === "primary" && has(name, /pull.?up|chin|pulldown|row/)) { add2("upper_back"); add2("biceps"); }
  if (roles.get("side_delts") === "primary" && has(name, /upright/)) add2("traps");
  if (has(name, /deadlift|rack pull/) && !roles.has("glutes")) add2("glutes");
  if (has(name, /squat|leg press|lunge|split squat|step.?up/) && !has(name, /jump|hop/)) { add2("glutes"); }
  for (const id of roles.keys()) if (!muscleIds.has(id)) throw new Error(`unknown muscle ${id} on ${ex.id}`);
  return roles;
}

// ---------------------------------------------------------------------------
// Equipment. Returns groups: every group must be met by one of its items.
// ---------------------------------------------------------------------------

const BENCH_FLAT = ["flat_bench", "adjustable_bench"];
const BENCH_INCLINE = ["adjustable_bench"];
const BENCH_DECLINE = ["decline_bench", "adjustable_bench"];
const RACK = ["power_rack", "squat_stand"];
const CABLE = ["cable_crossover", "cable_pulley"];

function equipmentFor(ex, name) {
  const groups = [];
  const add = (...items) => groups.push(items);
  const eq = ex.equipment;

  // Whole-name machines and stations first.
  const rules = [
    [/smith/, () => {
      add("smith_machine");
      if (/incline/.test(name)) add(...BENCH_INCLINE);
      else if (/decline/.test(name)) add(...BENCH_DECLINE);
      else if (/bench|seated|overhead shoulder press|hip raise/.test(name)) add(...BENCH_FLAT);
    }],
    [/leg press|calf press/, () => add("leg_press")],
    [/hack squat/, () => (eq === "machine" ? add("hack_squat_machine") : add("barbell"))],
    [/leg extension/, () => add("leg_extension")],
    [/lying leg curl/, () => add("lying_leg_curl")],
    [/seated leg curl/, () => add("seated_leg_curl")],
    [/standing leg curl/, () => add("standing_leg_curl")],
    [/thigh abductor/, () => add("hip_abductor")],
    [/thigh adductor/, () => add("hip_adductor")],
    [/^butterfly|reverse machine fl/, () => add("pec_deck")],
    [/machine bench press|leverage (incline |decline )?chest press/, () => add("chest_press_machine")],
    [/machine shoulder|leverage shoulder/, () => add("shoulder_press_machine")],
    [/leverage (high|iso) row/, () => add("seated_row_machine")],
    [/lying \bt.bar row/, () => add("t_bar_row_machine")],
    [/\bt.bar row|long bar row/, () => { add("barbell"); add("landmine", "t_bar_row_machine"); }],
    [/landmine/, () => { add("barbell"); add("landmine"); }],
    [/machine (bicep|preacher)/, () => add("bicep_curl_machine")],
    [/machine triceps/, () => add("tricep_extension_machine")],
    [/^dip machine/, () => add("dip_machine", "assisted_pullup_machine")],
    [/ab crunch machine/, () => add("ab_crunch_machine")],
    [/reverse hyper/, () => add("reverse_hyper")],
    [/seated calf raise/, () => add("seated_calf_machine")],
    [/standing calf raises|calf.machine shoulder shrug/, () => add("standing_calf_machine")],
    [/glute ham raise/, () => (eq === "machine" ? add("ghd") : null)],
    [/hyperextensions back/, () => add("back_extension_bench", "ghd")],
    [/treadmill/, () => add("treadmill")],
    [/bicycling stationary/, () => add("stationary_bike")],
    [/recumbent bike/, () => add("recumbent_bike")],
    [/rowing stationary/, () => add("rower")],
    [/elliptical/, () => add("elliptical")],
    [/stairmaster|step mill/, () => add("stair_climber")],
    [/rope jumping/, () => add("jump_rope")],
    [/battling ropes/, () => add("battle_ropes")],
    [/rope climb/, () => add("climbing_rope")],
    [/sled|prowler|drag/, () => add("sled")],
    [/chain (handle|press)/, () => add("chains")],
    [/crucifix/, () => add("dumbbells", "weight_plates")],
    [/svend/, () => add("weight_plates", "dumbbells")],
    [/one handed hang/, () => add("pull_up_bar")],
    [/band hamstring curl|sit.ups . with bands/, () => add("resistance_bands")],
    [/^weighted squat/, () => add("dip_belt", "weight_vest")],
    [/bench sprint|drop push|power stairs/, () => add("plyo_box", "flat_bench", "adjustable_bench")],
    [/atlas stone/, () => add("atlas_stone")],
    [/log lift/, () => add("log_bar")],
    [/axle/, () => add("axle_bar")],
    [/yoke/, () => add("yoke")],
    [/farmer.?s walk/, () => add("farmers_handles", "dumbbells", "kettlebells", "trap_bar")],
    [/goblet/, () => add("kettlebells", "dumbbells")],
    [/plate (raise|twist|pinch|curl|hand squeeze)|plate curls|olympic plate/, () => add("weight_plates", "barbell")],
    [/keg/, () => add("keg")],
    [/tire flip/, () => add("tire")],
    [/sledgehammer/, () => add("sledgehammer")],
    [/sandbag/, () => add("sandbag")],
    [/trap bar/, () => add("trap_bar")],
    [/wrist roller/, () => add("wrist_roller")],
    [/ab roller/, () => add("ab_wheel")],
    [/balance board/, () => add("balance_board")],
    [/suspended|inverted row with straps/, () => add("suspension_trainer", "gymnastic_rings")],
    [/ring dips/, () => add("gymnastic_rings")],
    [/muscle up/, () => add("pull_up_bar", "gymnastic_rings")],
    [/knee hip raise on parallel bars/, () => add("captains_chair", "dip_station")],
    [/hanging|pull.?ups?\b|pullup|\bchin|scapular pull|london bridges|gironda|side to side chins/, () => add("pull_up_bar")],
    [/^inverted row/, () => add("smith_machine", "power_rack", "suspension_trainer", "gymnastic_rings")],
    [/parallel bar dip|dips . (chest|triceps)|weighted bench dip/, () => add("dip_station")],
    [/bench dips/, () => add(...BENCH_FLAT)],
    [/box (jump|skip|squat|shuffle)|depth jump|step.?ups?|bench jump|box jump|high box/, () => (eq === "barbell" && /box squat/.test(name) ? null : add("plyo_box", ...BENCH_FLAT))],
    [/cone|hurdle/, () => add("agility_cones")],
  ];
  let matched = false;
  for (const [re, fn] of rules) {
    if (re.test(name)) {
      fn();
      matched = true;
      break;
    }
  }

  // The dataset's own equipment field, unless a station rule already covered it.
  const stationOnly = matched && groups.length && ["machine", "other", null, "body only"].includes(eq);
  // Skip the dataset's item when a name rule already offered it as an option.
  const covered = (item) => groups.some((g) => g.includes(item));
  const baseAdd = add;
  const addDefault = (...items) => { if (!covered(items[0])) baseAdd(...items); };
  if (!stationOnly) {
    switch (eq) {
      case "barbell":
        if (!/smith|trap bar|landmine|\bt.bar\b|long bar/.test(name)) addDefault("barbell");
        break;
      case "e-z curl bar": addDefault("ez_bar", "barbell"); break;
      case "dumbbell": if (!/smith/.test(name)) addDefault("dumbbells"); break;
      case "kettlebells": addDefault("kettlebells"); break;
      case "bands": addDefault("resistance_bands"); break;
      case "medicine ball": addDefault("medicine_ball"); break;
      case "exercise ball": addDefault("stability_ball"); break;
      case "foam roll": addDefault("foam_roller"); break;
      case "cable":
        if (/pulldown|pull.?down/.test(name) && !/straight.arm|rope straight/.test(name)) addDefault("lat_pulldown", "cable_crossover");
        else if (/seated cable rows|seated one.arm cable|elevated cable rows/.test(name)) addDefault("cable_row_station", ...CABLE);
        else if (/crossover|iron cross|cable fly|flyes|rear delt fly/.test(name)) addDefault("cable_crossover");
        else addDefault(...CABLE);
        break;
      case "machine":
        if (!matched) addDefault("__unmapped_machine");
        break;
      default:
        break; // body only / other / null: only what the name rules found
    }
  }

  // Benches and racks for free-weight work.
  const freeWeight = ["barbell", "dumbbell", "e-z curl bar", "kettlebells"].includes(eq) && !/smith/.test(name);
  if (freeWeight) {
    if (/preacher/.test(name)) add("preacher_bench", "adjustable_bench");
    else if (/decline/.test(name)) add(...BENCH_DECLINE);
    else if (/incline/.test(name) && !/standing.*incline/.test(name)) add(...BENCH_INCLINE);
    else if (/bench press|chest press|flye?s?\b|pullover|skull|lying|tate press|jm press|bench|seated|hip thrust|spider curl|close.grip (barbell|dumbbell|ez.bar) press/.test(name)
      && !/floor|wrist curl over a bench|standing|lying (face|supine) /.test(name)) {
      add(...BENCH_FLAT);
    }
    if (eq === "barbell" && /(back |front |full |overhead |box |wide stance |narrow stance |olympic |speed |zercher |^barbell )?squat|bench press|military|shoulder press|behind neck|press behind|rack|good morning|pin press|board press|jerk|push press|lunge|split squat/.test(name)
      && !/jump|kneeling|hack|step|floor/.test(name)) {
      add(...RACK);
    }
  }
  if (eq === "barbell" && /bench press|board press|pin press/.test(name) && !groups.some((g) => g.includes("flat_bench") || g.includes("adjustable_bench") || g.includes("decline_bench"))) {
    add(...BENCH_FLAT);
  }
  if (/with chains/.test(name)) add("chains");
  if (/weighted (pull|dip)|weighted bench dip/.test(name)) add("dip_belt", "weight_vest", "dumbbells");

  // De-duplicate groups.
  const seen = new Set();
  return groups.filter((g) => {
    const key = [...new Set(g)].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((g) => [...new Set(g)]);
}

// ---------------------------------------------------------------------------
// Movement pattern
// ---------------------------------------------------------------------------

function patternFor(ex, name, roles) {
  if (ex.category === "cardio") return "cardio";
  if (ex.category === "stretching") return "mobility";
  if (/carry|farmer.?s walk|yoke|rickshaw/.test(name)) return "carry";
  if (/side bridge|plank/.test(name)) return "core";
  if (/calf|calves/.test(name)) return "isolation";
  if (/fl(y|ye|yes)\b|crossover|butterfly|pec deck/.test(name)) return "isolation";
  if (/lunge|split squat|step.?up|pistol/.test(name)) return "lunge";
  if (/squat|leg press|hack/.test(name) && !/jump/.test(name)) return "squat";
  if (/deadlift|rdl|good morning|hip thrust|bridge|swing|hyperextension|back extension|pull through|rack pull|clean|snatch|glute ham/.test(name)) return "hinge";
  if (/pulldown|pull.?up|pullup|\bchin|muscle up/.test(name)) return "vertical_pull";
  if (/press/.test(name) && /incline|decline|bench|chest|floor/.test(name)) return "horizontal_push";
  if (/row/.test(name) && !/upright|throw/.test(name)) return "horizontal_pull";
  if (/military|shoulder press|overhead press|push press|jerk|handstand|pike push|arnold|dumbbell press$|seated dumbbell press|standing dumbbell press|landmine linear jammer/.test(name)) return "vertical_push";
  if (/bench press|push.?ups?|pushups|chest press|dip|floor press|svend/.test(name) && ex.mechanic !== "isolation") return "horizontal_push";
  const prim = [...roles].filter(([, r]) => r === "primary").map(([m]) => m);
  if (prim.some((m) => m === "abs" || m === "obliques")) return "core";
  if (ex.category === "plyometrics") return "other";
  if (ex.mechanic === "isolation") return "isolation";
  return "other";
}

// ---------------------------------------------------------------------------
// Build rows
// ---------------------------------------------------------------------------

const CATEGORY = {
  strength: "strength", powerlifting: "powerlifting", "olympic weightlifting": "olympic_weightlifting",
  strongman: "strongman", plyometrics: "plyometrics", stretching: "stretching", cardio: "cardio",
};

const exercises = [];
const exMuscles = [];
const exEquip = [];
const unmapped = [];

for (const ex of raw) {
  const name = ex.name.toLowerCase().replace(/[_,()/]/g, " ").replace(/\s+/g, " ").trim();
  const roles = musclesFor(ex, name);
  const groups = equipmentFor(ex, name);
  if (groups.some((g) => g.includes("__unmapped_machine"))) {
    if (INACTIVE.has(ex.id)) groups.splice(0, groups.length, ...groups.filter((g) => !g.includes("__unmapped_machine")));
    else unmapped.push(ex.id);
  }
  const display = COMMON[ex.id];
  exercises.push({
    id: ex.id,
    name: display ?? ex.name,
    aliases: display && display !== ex.name ? [ex.name] : [],
    category: CATEGORY[ex.category] ?? "strength",
    movement_pattern: patternFor(ex, name, roles),
    mechanic: ex.mechanic,
    force: ex.force,
    level: ex.level,
    instructions: ex.instructions,
    images: ex.images,
    is_common: Boolean(display),
    is_active: !INACTIVE.has(ex.id),
    source: "free-exercise-db",
  });
  for (const [muscle, role] of roles) exMuscles.push([ex.id, muscle, role]);
  groups.forEach((g, i) => g.forEach((item) => exEquip.push([ex.id, i + 1, item])));
}

for (const ex of EXTRA_EXERCISES) {
  const name = ex.name.toLowerCase();
  const roles = new Map([...ex.primary.map((m) => [m, "primary"]), ...ex.secondary.map((m) => [m, "secondary"])]);
  exercises.push({
    id: ex.id, name: ex.name, aliases: [], category: ex.category ?? "strength",
    movement_pattern: patternFor({ category: ex.category ?? "strength", mechanic: ex.mechanic }, name, roles),
    mechanic: ex.mechanic, force: ex.force, level: ex.level, instructions: ex.instructions, images: [],
    is_common: true, is_active: true, source: "catalog",
  });
  for (const [muscle, role] of roles) exMuscles.push([ex.id, muscle, role]);
  ex.equipment.forEach((g, i) => g.forEach((item) => exEquip.push([ex.id, i + 1, item])));
}

// Sanity checks.
const ids = new Set();
for (const e of exercises) {
  if (ids.has(e.id)) throw new Error(`duplicate exercise ${e.id}`);
  ids.add(e.id);
}
for (const id of Object.keys(COMMON)) if (!ids.has(id)) throw new Error(`COMMON id not in dataset: ${id}`);
for (const [, , item] of exEquip) {
  if (item === "__unmapped_machine") continue;
  if (!equipmentIds.has(item)) throw new Error(`unknown equipment ${item}`);
}
if (unmapped.length) {
  console.error(`Unmapped machine exercises (fix the rules):\n  ${unmapped.join("\n  ")}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => (a.length ? `array[${a.map(q).join(", ")}]::text[]` : "'{}'::text[]");
const b = (v) => (v ? "true" : "false");

const sql = [];
sql.push(`-- GENERATED by scripts/build-seed.mjs — do not edit by hand.
-- Exercise data: free-exercise-db (public domain / Unlicense), ${SOURCE_URL}
-- ${exercises.length} exercises (${exercises.filter((e) => e.is_common).length} common), ${EQUIPMENT.length} equipment items, ${MUSCLES.length} muscles, ${SPLITS.length} splits.
-- Safe to re-run: catalog rows are upserted.
`);

sql.push(`insert into public.muscles (id, name, region, size_class, recovery_tau_hours, sort_order) values\n` +
  MUSCLES.map(([id, name, region, size, tau], i) => `  (${q(id)}, ${q(name)}, ${q(region)}, ${q(size)}, ${tau}, ${i})`).join(",\n") +
  `\non conflict (id) do update set name = excluded.name, region = excluded.region, size_class = excluded.size_class,\n  recovery_tau_hours = excluded.recovery_tau_hours, sort_order = excluded.sort_order;`);

sql.push(`insert into public.equipment (id, name, category, sort_order, common_at_home) values\n` +
  EQUIPMENT.map(([id, name, cat, home], i) => `  (${q(id)}, ${q(name)}, ${q(cat)}, ${i}, ${b(home)})`).join(",\n") +
  `\non conflict (id) do update set name = excluded.name, category = excluded.category,\n  sort_order = excluded.sort_order, common_at_home = excluded.common_at_home;`);

const exCols = "id, name, aliases, category, movement_pattern, mechanic, force, level, instructions, images, is_common, is_active, source";
for (let i = 0; i < exercises.length; i += 150) {
  const rows = exercises.slice(i, i + 150).map((e) =>
    `  (${q(e.id)}, ${q(e.name)}, ${arr(e.aliases)}, ${q(e.category)}, ${q(e.movement_pattern)}, ${q(e.mechanic)}, ${q(e.force)}, ${q(e.level)}, ${arr(e.instructions)}, ${arr(e.images)}, ${b(e.is_common)}, ${b(e.is_active)}, ${q(e.source)})`);
  sql.push(`insert into public.exercises (${exCols}) values\n${rows.join(",\n")}\non conflict (id) do update set name = excluded.name, aliases = excluded.aliases, category = excluded.category,
  movement_pattern = excluded.movement_pattern, mechanic = excluded.mechanic, force = excluded.force, level = excluded.level,
  instructions = excluded.instructions, images = excluded.images, is_common = excluded.is_common,
  is_active = excluded.is_active, source = excluded.source;`);
}

sql.push(`-- Replace catalog tags wholesale (custom exercises are untouched).
delete from public.exercise_muscles where exercise_id in (select id from public.exercises where owner_id is null);
delete from public.exercise_equipment where exercise_id in (select id from public.exercises where owner_id is null);`);

for (let i = 0; i < exMuscles.length; i += 500) {
  sql.push(`insert into public.exercise_muscles (exercise_id, muscle_id, role) values\n` +
    exMuscles.slice(i, i + 500).map(([e, m, r]) => `  (${q(e)}, ${q(m)}, ${q(r)})`).join(",\n") + ";");
}
for (let i = 0; i < exEquip.length; i += 500) {
  sql.push(`insert into public.exercise_equipment (exercise_id, option_group, equipment_id) values\n` +
    exEquip.slice(i, i + 500).map(([e, g, it]) => `  (${q(e)}, ${g}, ${q(it)})`).join(",\n") + ";");
}

sql.push(`insert into public.splits (id, name, days_per_week, description, sort_order) values\n` +
  SPLITS.map((s, i) => `  (${q(s.id)}, ${q(s.name)}, ${s.days}, ${q(s.description)}, ${i})`).join(",\n") +
  `\non conflict (id) do update set name = excluded.name, days_per_week = excluded.days_per_week,\n  description = excluded.description, sort_order = excluded.sort_order;`);
sql.push(`delete from public.split_days where split_id in (${SPLITS.map((s) => q(s.id)).join(", ")});
insert into public.split_days (split_id, day_order, name, target_muscle_ids) values\n` +
  SPLITS.flatMap((s) => s.dayList.map(([n, t], i) => {
    for (const m of t) if (!muscleIds.has(m)) throw new Error(`split ${s.id} unknown muscle ${m}`);
    return `  (${q(s.id)}, ${i + 1}, ${q(n)}, ${arr(t)})`;
  })).join(",\n") + ";");

// Debug list: exercises with no equipment whose dataset equipment isn't bodyweight.
if (process.env.SHOW_NO_EQUIP) {
  const tagged = new Set(exEquip.map((r) => r[0]));
  console.log(raw.filter((x) => !tagged.has(x.id) && !['body only', null].includes(x.equipment) && !INACTIVE.has(x.id)).map((x) => `${x.id} [${x.equipment}]`).join('\n'));
}

writeFileSync(OUT, sql.join("\n\n") + "\n");

// A readable report of the common lifts for spot-checking.
const byId = new Map(exercises.map((e) => [e.id, e]));
const musclesOf = (id) => exMuscles.filter(([e]) => e === id);
const equipOf = (id) => {
  const g = new Map();
  for (const [e, grp, it] of exEquip) if (e === id) g.set(grp, [...(g.get(grp) ?? []), it]);
  return [...g.values()].map((items) => items.join(" or ")).join(" + ") || "none";
};
const commonIds = [...Object.keys(COMMON), ...EXTRA_EXERCISES.map((e) => e.id)];
const report = [
  "# Common lifts — muscles and equipment (generated)",
  "",
  "Spot-check list for the most-used exercises. Regenerate with `node scripts/build-seed.mjs`.",
  "",
  "| Exercise | Pattern | Primary | Secondary | Needs |",
  "|---|---|---|---|---|",
  ...commonIds.map((id) => {
    const e = byId.get(id);
    const m = musclesOf(id);
    return `| ${e.name} | ${e.movement_pattern} | ${m.filter((x) => x[2] === "primary").map((x) => x[1]).join(", ")} | ${m.filter((x) => x[2] === "secondary").map((x) => x[1]).join(", ")} | ${equipOf(id)} |`;
  }),
];
writeFileSync(REPORT, report.join("\n") + "\n");

console.log(`Wrote ${exercises.length} exercises, ${exMuscles.length} muscle tags, ${exEquip.length} equipment tags.`);
