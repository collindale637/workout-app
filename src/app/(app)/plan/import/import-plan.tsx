"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/db/provider";
import { useGeneratorInputs } from "@/lib/smart";
import { usePlanActions } from "@/lib/plans";
import { useUpNextChoice } from "@/lib/up-next";
import { GOAL_LABELS } from "@/lib/profile";
import { isAvailable } from "@/lib/availability";
import { isCardioExercise } from "@/lib/cardio";
import { createCustomExercise } from "@/lib/custom-exercise";
import { aiProfile, askAI, libraryForImport, prepareImage, preparePdf, useAiUsage } from "@/lib/ai/client";
import { buildMatchIndex, matchLine, type MatchStatus } from "@/lib/ai/match";
import { planNotes, targetsFor } from "@/lib/ai/apply";
import { normalizeSupersets } from "@/lib/ai/validate";
import { MAX_IMAGES, type AiImage, type AiImport, type AiPdf, type ImportLine } from "@/lib/ai/types";
import { AiProblem, AiThinking, AiUsageNote, Sparkle } from "@/components/ai";
import { ExercisePicker } from "@/components/exercise-picker";
import { repsLabel } from "@/components/planned";
import { Chip, PageHeader, Sheet, btn, field, label } from "@/components/ui/kit";
import type { GenItem } from "@/lib/generator";
import type { Goal } from "@/lib/db/types";

type Photo = { id: string; url: string; image: AiImage };
/** Where each imported line stands on the review screen. */
type Resolution = { status: MatchStatus; exerciseId: string | null; candidates: string[]; confirmed: boolean; skipped: boolean };
type LineRef = { day: number; line: number };

const key = (r: LineRef) => `${r.day}:${r.line}`;

/** Import a plan from pasted text or screenshots, then match every exercise before saving. */
export function ImportScreen() {
  const router = useRouter();
  const { db, userId } = useData();
  const inputs = useGeneratorInputs();
  const actions = usePlanActions();
  const { setChoice } = useUpNextChoice();
  const { usage, setUsage } = useAiUsage();
  const fileInput = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pdf, setPdf] = useState<AiPdf | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: AiImport; warnings: string[] } | null>(null);
  const [res, setRes] = useState<Map<string, Resolution>>(new Map());
  const [name, setName] = useState("");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [weeks, setWeeks] = useState(8);
  const [pickFor, setPickFor] = useState<LineRef | null>(null);
  const [createFor, setCreateFor] = useState<LineRef | null>(null);
  const [saving, setSaving] = useState(false);

  const { catalog, profile, prefs, gym, gymEquipment } = inputs;
  const index = useMemo(() => (catalog ? buildMatchIndex(catalog.exercises) : null), [catalog]);
  if (!inputs.ready || !catalog || !profile || !index) return null;

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const all = [...files];
    const pdfs = all.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (pdfs.length) {
      if (pdfs.length > 1) setError("One PDF at a time.");
      try {
        setPdf(await preparePdf(pdfs[0]));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read that PDF.");
      }
    }
    await addPhotos(all.filter((f) => !pdfs.includes(f)));
  }

  async function addPhotos(files: File[]) {
    if (!files.length) return;
    const room = MAX_IMAGES - photos.length;
    const list = files.slice(0, room);
    if (files.length > room) setError(`Up to ${MAX_IMAGES} photos at a time.`);
    try {
      const added = await Promise.all(list.map(async (f) => ({ id: crypto.randomUUID(), url: URL.createObjectURL(f), image: await prepareImage(f) })));
      setPhotos((p) => [...p, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that photo.");
    }
  }

  async function read() {
    if (!catalog || !profile || !index) return;
    setBusy(true);
    setError(null);
    const r = await askAI({
      kind: "import",
      prompt: text,
      profile: aiProfile(profile),
      gym: null,
      exercises: libraryForImport(catalog, prefs),
      images: photos.map((p) => p.image),
      pdf: pdf ?? undefined,
    });
    setBusy(false);
    if (r.usage) setUsage(r.usage);
    if (!r.ok) return setError(r.error);
    if (r.kind !== "import") return;
    if (!r.result.days.length) return setError(r.result.problems ?? "Couldn't find a workout plan in that. Try a clearer photo or PDF, or paste the text.");
    const next = new Map<string, Resolution>();
    r.result.days.forEach((d, di) =>
      d.lines.forEach((l, li) => {
        const m = matchLine(index, l);
        next.set(key({ day: di, line: li }), { ...m, confirmed: m.status === "matched", skipped: false });
      }),
    );
    setRes(next);
    setResult({ data: r.result, warnings: r.warnings });
    setName(r.result.name);
    setGoal(r.result.goal);
    setWeeks(r.result.weeks ?? 8);
    window.scrollTo({ top: 0 });
  }

  const update = (ref: LineRef, change: (r: Resolution) => Resolution) =>
    setRes((m) => new Map(m).set(key(ref), change(m.get(key(ref))!)));
  const resolve = (ref: LineRef, exerciseId: string) => update(ref, (r) => ({ ...r, exerciseId, confirmed: true, skipped: false }));
  const toggleSkip = (ref: LineRef) => update(ref, (r) => ({ ...r, skipped: !r.skipped }));

  async function save() {
    if (!result || !catalog) return;
    setSaving(true);
    const days = result.data.days
      .map((d, di) => {
        const items: GenItem[] = [];
        d.lines.forEach((l, li) => {
          const r = res.get(key({ day: di, line: li }));
          if (!r || r.skipped || !r.exerciseId) return;
          items.push(toItem(l, r.exerciseId));
        });
        return { ref_day_id: null, name: d.name, items: normalizeSupersets(items) };
      })
      .filter((d) => d.items.length);
    await actions.create({
      name: name.trim() || result.data.name,
      goal: goal ?? profile!.goal,
      splitId: null,
      weeks,
      source: "imported",
      notes: planNotes({ summary: result.data.summary, progression: result.data.progression }),
      days: days.map((d) => ({ name: d.name, target_muscle_ids: targetsFor(catalog, d.items), items: d.items })),
    });
    await setChoice({ mode: "plan", seed: 0 });
    router.replace("/plan");
  }

  function toItem(l: ImportLine, exerciseId: string): GenItem {
    const ex = catalog!.byId.get(exerciseId);
    if (isCardioExercise(ex)) {
      return { exercise_id: exerciseId, sets: 1, rep_min: null, rep_max: null, rest_sec: null, superset_group: null, notes: l.is_cardio ? l.notes : "20 min" };
    }
    const compound = ex?.mechanic === "compound";
    return {
      exercise_id: exerciseId,
      sets: l.is_cardio ? 3 : l.sets,
      rep_min: l.is_cardio ? 8 : (l.rep_min ?? 8),
      rep_max: l.is_cardio ? 12 : (l.rep_max ?? l.rep_min ?? 12),
      rest_sec: l.rest_sec ?? (compound ? 120 : 60),
      superset_group: l.superset_group,
      notes: l.is_cardio ? null : l.notes,
    };
  }

  if (busy) {
    return (
      <main className="flex flex-col gap-4">
        <PageHeader title="Import a plan" />
        <AiThinking what="Reading your plan" />
        <p className="text-center text-sm font-medium text-muted">Photos and PDFs take a little longer. Keep this screen open.</p>
      </main>
    );
  }

  if (result) {
    const all = [...res.values()];
    const counts = {
      matched: all.filter((r) => r.status === "matched" && !r.skipped).length,
      check: all.filter((r) => !r.confirmed && !r.skipped).length,
      skipped: all.filter((r) => r.skipped).length,
    };
    const unsureLeft = all.filter((r) => r.status === "unsure" && !r.confirmed && !r.skipped && r.exerciseId).length;
    const ready = counts.check === 0 && all.some((r) => !r.skipped && r.exerciseId);
    const lineAt = (ref: LineRef) => result.data.days[ref.day].lines[ref.line];

    return (
      <main className="flex flex-col gap-4 pb-6">
        <PageHeader title="Check the import" />
        {result.warnings.map((w) => <AiProblem key={w}>{w}</AiProblem>)}
        {result.data.problems && <AiProblem>{result.data.problems}</AiProblem>}

        <label className="flex flex-col gap-2">
          <span className={label}>PLAN NAME</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {result.data.summary && <p className="-mt-1 text-[15px] font-medium leading-snug text-muted">{result.data.summary}</p>}

        <div className="flex flex-col gap-2">
          <span className={label}>GOAL</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
              <Chip key={g} active={(goal ?? profile.goal) === g} onClick={() => setGoal(g)}>{GOAL_LABELS[g]}</Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className={label}>LENGTH</span>
          <div className="flex gap-2">
            {[...new Set([4, 6, 8, 12, weeks])].sort((a, b) => a - b).map((w) => (
              <Chip key={w} active={weeks === w} onClick={() => setWeeks(w)} className="flex-1">{w} wk</Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-sm font-bold">
          <span className="rounded-full bg-good/15 px-3 py-1.5 text-good">{counts.matched} matched</span>
          {counts.check > 0 && <span className="rounded-full bg-warn/15 px-3 py-1.5 text-warn">{counts.check} to check</span>}
          {counts.skipped > 0 && <span className="rounded-full bg-card-2 px-3 py-1.5 text-muted">{counts.skipped} skipped</span>}
        </div>
        {unsureLeft > 0 && (
          <button
            type="button"
            className={btn.secondary}
            onClick={() =>
              setRes((m) => new Map([...m].map(([k, r]) => [k, r.status === "unsure" && !r.skipped && r.exerciseId ? { ...r, confirmed: true } : r])))
            }
          >
            Accept the {unsureLeft} best guess{unsureLeft === 1 ? "" : "es"}
          </button>
        )}

        {result.data.days.map((d, di) => (
          <section key={di} className="flex flex-col gap-2 rounded-3xl border border-line bg-card p-4">
            <div className="flex items-baseline gap-2">
              <span className="display num text-lg font-extrabold text-muted">{di + 1}</span>
              <h2 className="display text-xl font-extrabold">{d.name}</h2>
            </div>
            <ul className="flex flex-col gap-2">
              {d.lines.map((l, li) => {
                const ref = { day: di, line: li };
                const r = res.get(key(ref))!;
                const ex = r.exerciseId ? catalog.byId.get(r.exerciseId) : undefined;
                const notHere = ex && gymEquipment && !isAvailable(catalog.needs.get(ex.id) ?? [], gymEquipment);
                const dose = l.is_cardio ? (l.notes?.split(" · ")[0] ?? "") : `${l.sets} × ${repsLabel(l.rep_min, l.rep_max)}`;
                return (
                  <li key={li} className={`flex flex-col gap-2 rounded-2xl border-2 px-3 py-2.5 ${r.skipped ? "border-line opacity-60" : r.confirmed ? "border-line bg-card-2" : "border-warn/50 bg-warn/5"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="text-base font-bold">{r.skipped ? l.written : ex?.name ?? l.written}</span>
                        <span className="text-sm font-medium text-muted">
                          {dose}
                          {l.superset_group !== null ? ` · superset ${l.superset_group}` : ""}
                          {ex && ex.name.toLowerCase() !== l.written.toLowerCase() ? ` · written "${l.written}"` : ""}
                        </span>
                        {l.notes && !l.is_cardio && <span className="text-sm font-medium text-muted">{l.notes}</span>}
                        {notHere && !r.skipped && <span className="text-xs font-bold text-warn">Not at {gym?.name}: swaps for the closest match there</span>}
                      </div>
                      <span
                        className={`display shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold tracking-[0.06em] ${
                          r.skipped ? "bg-card-2 text-muted" : r.confirmed ? "bg-good/15 text-good" : r.status === "unsure" ? "bg-warn/15 text-warn" : "bg-danger/15 text-danger"
                        }`}
                      >
                        {r.skipped ? "SKIPPED" : r.confirmed ? (r.status === "matched" ? "MATCHED" : "CHOSEN") : r.status === "unsure" ? "UNSURE" : "NOT FOUND"}
                      </span>
                    </div>
                    {!r.confirmed && !r.skipped && r.candidates.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-bold tracking-[0.08em] text-muted">{r.status === "unsure" ? "DID YOU MEAN" : "CLOSEST"}</span>
                        <div className="flex flex-wrap gap-2">
                          {r.candidates.map((c) => (
                            <Chip key={c} active={false} onClick={() => resolve(ref, c)}>{catalog.byId.get(c)?.name ?? c}</Chip>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-1">
                      <button type="button" className={btn.ghost} onClick={() => setPickFor(ref)}>{r.confirmed ? "Change" : "Choose…"}</button>
                      {!r.confirmed && <button type="button" className={btn.ghost} onClick={() => setCreateFor(ref)}>Create custom</button>}
                      <button type="button" className={btn.ghost} onClick={() => toggleSkip(ref)}>
                        {r.skipped ? "Undo skip" : "Skip"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {result.data.progression && (
          <section className="flex flex-col gap-1.5 rounded-3xl bg-card-2 p-4">
            <span className={label}>HOW IT PROGRESSES</span>
            <p className="text-[15px] font-medium leading-snug">{result.data.progression}</p>
          </section>
        )}

        <button type="button" className={btn.primary} disabled={!ready || saving} onClick={save}>
          {saving ? "Saving…" : ready ? "Use this plan" : `Check ${counts.check} more`}
        </button>
        <p className="-mt-2 text-center text-sm font-medium text-muted">It becomes your active plan. You can edit any day after.</p>
        <button type="button" className={btn.ghost} onClick={() => setResult(null)}>← Back to the source</button>
        <AiUsageNote usage={usage} />

        <Sheet open={pickFor !== null} onClose={() => setPickFor(null)} title={pickFor ? `"${lineAt(pickFor).written}" is…` : undefined}>
          {pickFor && (
            <ExercisePicker
              mode="single"
              gymEquipment={gymEquipment}
              gymName={gym?.name}
              onPick={(ids) => {
                resolve(pickFor, ids[0]);
                setPickFor(null);
              }}
            />
          )}
        </Sheet>
        <Sheet open={createFor !== null} onClose={() => setCreateFor(null)} title="New custom exercise">
          {createFor && (
            <QuickCustom
              initialName={lineAt(createFor).standard_name}
              cardio={lineAt(createFor).is_cardio}
              onSave={async (x) => {
                const id = await createCustomExercise(db, userId, x);
                resolve(createFor, id);
                setCreateFor(null);
              }}
            />
          )}
        </Sheet>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 pb-6">
      <PageHeader title="Import a plan" back="/plan" />
      <p className="-mt-2 text-base font-medium text-muted">
        Paste a plan, upload a PDF (a coach&apos;s program, up to 3 MB), or add up to {MAX_IMAGES} screenshots or photos (your notes app, a whiteboard). Claude reads
        it, then you check every exercise before it&apos;s saved.
      </p>
      <label className="flex flex-col gap-2">
        <span className={label}>PASTE THE PLAN</span>
        <textarea
          className={`${field} h-44 resize-none py-3 leading-snug`}
          placeholder={"e.g.\nDay 1 – Upper\nBench 4x6-8\nDB row 3x10\nOHP 3x8\nSS: curls / pushdowns 3x12"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={20000}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className={label}>PDF, SCREENSHOTS OR PHOTOS</span>
        {pdf && (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-card-2 py-1 pr-1 pl-4">
            <span className="min-w-0 truncate text-base font-bold">{pdf.name ?? "Plan.pdf"}</span>
            <button type="button" aria-label="Remove PDF" className="flex h-11 w-11 shrink-0 items-center justify-center text-xl font-bold text-muted" onClick={() => setPdf(null)}>×</button>
          </div>
        )}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-line bg-card-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a picked photo */}
                <img src={p.url} alt="Plan photo" className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove photo"
                  className="absolute top-1 right-1 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl font-bold text-white"
                  onClick={() => {
                    URL.revokeObjectURL(p.url);
                    setPhotos((list) => list.filter((x) => x.id !== p.id));
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
        <button type="button" className={btn.secondary} disabled={photos.length >= MAX_IMAGES && !!pdf} onClick={() => fileInput.current?.click()}>
          + Add {photos.length || pdf ? "more files" : "a PDF, screenshots or photos"}
        </button>
      </div>

      {error && <AiProblem>{error}</AiProblem>}
      <button type="button" className={btn.primary} disabled={!text.trim() && !photos.length && !pdf} onClick={read}>
        <Sparkle /> Read my plan
      </button>
      <AiUsageNote usage={usage} />
    </main>
  );
}

/** A quick custom exercise from the import screen (equipment can be added later in the library). */
function QuickCustom({ initialName, cardio, onSave }: { initialName: string; cardio: boolean; onSave: (x: Parameters<typeof createCustomExercise>[2]) => Promise<void> }) {
  const inputs = useGeneratorInputs();
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<"strength" | "cardio">(cardio ? "cardio" : "strength");
  const [mechanic, setMechanic] = useState<"compound" | "isolation">("compound");
  const [primary, setPrimary] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const catalog = inputs.catalog;
  if (!catalog) return null;
  const ok = name.trim() && (kind === "cardio" || primary.length);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok) return;
        setBusy(true);
        await onSave({ name, kind, mechanic, primary });
      }}
    >
      <input className={field} value={name} onChange={(e) => setName(e.target.value)} required />
      <div className="grid grid-cols-2 gap-2">
        <Chip active={kind === "strength"} onClick={() => setKind("strength")}>Strength</Chip>
        <Chip active={kind === "cardio"} onClick={() => setKind("cardio")}>Cardio</Chip>
      </div>
      {kind === "strength" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Chip active={mechanic === "compound"} onClick={() => setMechanic("compound")}>Compound</Chip>
            <Chip active={mechanic === "isolation"} onClick={() => setMechanic("isolation")}>Isolation</Chip>
          </div>
          <span className={label}>MAIN MUSCLES</span>
          <div className="flex flex-wrap gap-2">
            {catalog.muscles.map((m) => (
              <Chip key={m.id} active={primary.includes(m.id)} onClick={() => setPrimary((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))}>
                {m.name}
              </Chip>
            ))}
          </div>
        </>
      )}
      <p className="text-sm font-medium text-muted">Only you see it. Add the equipment it needs later under More → Exercise library.</p>
      <button type="submit" className={btn.primary} disabled={!ok || busy}>Save and use it</button>
    </form>
  );
}
