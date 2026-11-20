"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProfile } from "@/lib/db/provider";
import { useActiveGym } from "@/lib/hooks";
import { detectPlatform, isStandalone, useInstallPrompt, type InstallPlatform } from "@/lib/install";
import { btn } from "@/components/ui/kit";
import { RepsMark } from "@/components/logo";
import { Sparkle } from "@/components/ai";
import { READY_AVG } from "@/lib/readiness";

/*
  First-run tutorial (Nov 2026, option 1): a full-screen, swipeable walkthrough.
  - Opens on Today after onboarding, once per person (profiles.tutorial_seen_at), and again from More → Show tutorial.
  - Step 1 is "Add to Home Screen", skipped when the app is already opened from the home screen.
  - The pictures are small copies of the real screens (same colours, labels and buttons), not screenshots, so they
    stay sharp and follow the app's units and gym names.
*/

type Step = { id: string; art: React.ReactNode; title: string; body: React.ReactNode };

type Close = (how: "done" | "skip") => void;

/** The tutorial, filled in with this person's units, default RPE and gym names. */
export function Tutorial({ onClose }: { onClose: Close }) {
  const { profile } = useProfile();
  const { gyms, gym } = useActiveGym();
  const gymNames = useMemo(() => {
    const names = gyms.map((g) => g.name);
    const fill = ["Home gym", "Main gym", "Hotel gym"].filter((n) => !names.includes(n));
    return [...names, ...fill].slice(0, 3);
  }, [gyms]);
  return <TutorialView onClose={onClose} kg={profile?.units === "kg"} rpe={profile?.default_rpe ?? 8} gymNames={gymNames} here={gym?.name ?? gymNames[0]} />;
}

export function TutorialView({ onClose, kg, rpe, gymNames, here }: { onClose: Close; kg: boolean; rpe: number; gymNames: string[]; here: string }) {
  // Decided once when it opens, so the install step doesn't vanish mid-tutorial.
  const [showInstall] = useState(() => !isStandalone());
  const [index, setIndex] = useState(0);

  const steps: Step[] = [
    ...(showInstall ? [{ id: "install", art: null, title: "Add Reps to your Home Screen", body: null }] : []),
    {
      id: "today",
      art: <UpNextArt />,
      title: "Your next workout, ready",
      body: (
        <>
          <b className="text-ink">Today</b> shows the next day of your plan and how recovered those muscles are. Tap <b className="text-ink">Start</b> to begin.{" "}
          <b className="text-ink">Regenerate</b> mixes up the exercises, <b className="text-ink">Customize</b> asks the AI for changes, and <b className="text-ink">Change</b> picks a different day.
        </>
      ),
    },
    {
      id: "list",
      art: <SwipeArt kg={kg} />,
      title: "Make the list yours",
      body: (
        <>
          Swipe an exercise left to <b className="text-ink">Swap</b> it, see <b className="text-ink">How-to</b>, add <b className="text-ink">Notes</b> or{" "}
          <b className="text-ink">Remove</b> it. Hold and drag to reorder, or tap <b className="text-ink">+ Add exercise</b> at the bottom.
        </>
      ),
    },
    {
      id: "log",
      art: <SetPanelArt kg={kg} rpe={rpe} />,
      title: "Log every set",
      body: (
        <>
          Flick the wheels to your weight and reps (tap the number to type it), then <b className="text-ink">Log set</b>. RPE is how hard it felt, 1–10; it starts at{" "}
          {rpe}. Rest starts on its own, and a record gets a <b className="text-gold">gold PR</b>.
        </>
      ),
    },
    {
      id: "gyms",
      art: <GymArt names={gymNames} here={here} />,
      title: "Train anywhere",
      body: (
        <>
          Tap the gym at the top of Today to switch. Anything that gym can&apos;t do swaps for the closest match. Add gyms and their equipment under{" "}
          <b className="text-ink">More → Gyms</b>.
        </>
      ),
    },
    {
      id: "track",
      art: <TrackArt />,
      title: "See what's ready, see what's earned",
      body: (
        <>
          <b className="text-ink">Recovery</b> shows how fresh each muscle is from the last 7 days; tap one to say how it feels. <b className="text-ink">Progress</b> has
          your calendar, records, lift charts, bodyweight and cardio.
        </>
      ),
    },
    { id: "done", art: <ReadyArt />, title: "You're all set", body: "Let's get your first workout on the books." },
  ];

  const last = steps.length - 1;
  const go = useCallback((n: number) => setIndex(Math.max(0, Math.min(last, n))), [last]);

  // Keyboard: arrows move, Escape skips. Freeze the page behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "Escape") onClose("skip");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go, onClose]);
  useEffect(() => {
    const html = document.documentElement;
    const prev = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev[0];
      document.body.style.overflow = prev[1];
    };
  }, []);

  // Swipe between steps: a sideways drag over 50px that's clearly more sideways than up/down.
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("button")) return;
    start.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dx) > Math.abs(dy)) setDragX((index === 0 && dx > 0) || (index === last && dx < 0) ? dx / 3 : dx);
  };
  const onPointerEnd = () => {
    if (!start.current) return;
    start.current = null;
    if (dragX < -50) go(index + 1);
    else if (dragX > 50) go(index - 1);
    setDragX(0);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Reps tutorial" className="fixed inset-0 z-[60] bg-bg animate-[tutorial-in_0.35s_cubic-bezier(0.4,0,0.2,1)]">
      <div className="safe-top mx-auto flex h-dvh w-full max-w-md flex-col">
        <div className="flex h-11 shrink-0 items-center justify-between px-5">
          <span className="text-xs font-bold tracking-[0.12em] text-muted" aria-live="polite">
            {index + 1} OF {steps.length}
          </span>
          {index < last && (
            <button type="button" onClick={() => onClose("skip")} className="display -mr-3 min-h-11 px-3 text-base font-extrabold tracking-[0.06em] text-muted">
              Skip
            </button>
          )}
        </div>

        <div
          className="min-h-0 flex-1 touch-pan-y overflow-hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div
            className="flex h-full"
            style={{
              transform: `translateX(calc(${-index * 100}% + ${dragX}px))`,
              transition: dragX ? "none" : "transform 0.38s cubic-bezier(0.4,0,0.2,1)",
            }}
          >
            {steps.map((s, i) => (
              <section key={s.id} aria-hidden={i !== index} inert={i !== index} className="flex h-full w-full shrink-0 flex-col overflow-y-auto px-5 pb-2">
                {s.id === "install" ? (
                  <InstallStep active={i === index} onInstalled={() => go(i + 1)} />
                ) : (
                  <>
                    <Art>{s.art}</Art>
                    <h2 className="display mt-5 text-[34px] leading-[0.95] font-extrabold italic">{s.title}</h2>
                    <p className="mt-2 text-base leading-snug font-medium text-muted">{s.body}</p>
                  </>
                )}
              </section>
            ))}
          </div>
        </div>

        <div className="safe-bottom shrink-0 px-5 pt-3">
          <div className="mb-3 flex justify-center gap-1.5" aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s.id} className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-accent-strong" : "w-1.5 bg-line"}`} />
            ))}
          </div>
          <div className="flex gap-2.5 pb-2">
            {index > 0 && (
              <button type="button" onClick={() => go(index - 1)} className={`${btn.secondary} h-14 w-28 shrink-0`}>
                Back
              </button>
            )}
            <button type="button" onClick={() => (index === last ? onClose("done") : go(index + 1))} className={`${btn.primary} flex-1`}>
              {index === last ? "Let's go" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The picture area at the top of each step. */
function Art({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`relative flex h-[min(300px,40dvh)] shrink-0 items-center justify-center overflow-hidden rounded-[28px] border border-line bg-gradient-to-b from-card-2 to-card ${className}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Add to Home Screen

const IOS_STEPS = [
  { tab: "Tap ⋯", text: <>In Safari, tap <b className="text-ink">⋯</b> beside the address bar (or the <b className="text-ink">Share</b> button if you see it).</> },
  { tab: "Add to Home", text: <>Tap <b className="text-ink">Share</b>, scroll down and tap <b className="text-ink">Add to Home Screen</b>. Not there? Tap View More.</> },
  { tab: "Tap Add", text: <>Tap <b className="text-ink">Add</b>. From now on, open Reps from its icon: it runs full screen and works offline.</> },
];
const ANDROID_STEPS = [
  { tab: "Tap ⋮", text: <>In Chrome, tap the <b className="text-ink">⋮</b> menu at the top right.</> },
  { tab: "Add to Home", text: <>Tap <b className="text-ink">Add to Home screen</b> (or <b className="text-ink">Install app</b>).</> },
  { tab: "Tap Install", text: <>Tap <b className="text-ink">Install</b>. From now on, open Reps from its icon: it runs full screen and works offline.</> },
];

function InstallStep({ active, onInstalled }: { active: boolean; onInstalled: () => void }) {
  const [platform, setPlatform] = useState<Exclude<InstallPlatform, "other">>(() => (detectPlatform() === "android" ? "android" : "ios"));
  const [sub, setSub] = useState(0);
  const [auto, setAuto] = useState(true);
  const { canPrompt, install } = useInstallPrompt();
  const steps = platform === "ios" ? IOS_STEPS : ANDROID_STEPS;

  // Plays the three steps on a loop until someone taps one.
  useEffect(() => {
    if (!active || !auto) return;
    const t = setInterval(() => setSub((s) => (s + 1) % 3), 3200);
    return () => clearInterval(t);
  }, [active, auto]);

  return (
    <>
      <Art>
        <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 rounded-full border border-line bg-bg p-[3px]">
          {(["ios", "android"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPlatform(p);
                setSub(0);
                setAuto(true);
              }}
              aria-pressed={platform === p}
              className={`min-h-9 rounded-full px-4 text-sm font-bold ${platform === p ? "bg-primary text-white" : "text-muted"}`}
            >
              {p === "ios" ? "iPhone" : "Android"}
            </button>
          ))}
        </div>
        <InstallPicture platform={platform} sub={sub} />
      </Art>
      <h2 className="display mt-5 text-[34px] leading-[0.95] font-extrabold italic">Add Reps to your Home Screen</h2>
      {platform === "android" && canPrompt ? (
        <>
          <p className="mt-2 text-base leading-snug font-medium text-muted">One tap: Reps gets its own icon, runs full screen and works offline.</p>
          <button
            type="button"
            className={`${btn.primary} mt-4 w-full`}
            onClick={async () => {
              if (await install()) onInstalled();
            }}
          >
            Install Reps
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 min-h-[4.2em] text-base leading-snug font-medium text-muted" aria-live="polite">
            {steps[sub].text}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {steps.map((s, i) => (
              <button
                key={s.tab}
                type="button"
                onClick={() => {
                  setSub(i);
                  setAuto(false);
                }}
                aria-pressed={i === sub}
                className={`flex min-h-11 items-center gap-1.5 rounded-2xl border-2 px-2 text-left text-[13px] leading-tight font-bold ${
                  i === sub ? "border-accent-strong bg-primary/15 text-ink" : "border-line bg-card text-muted"
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${i < sub ? "bg-good text-[var(--done-ink)]" : i === sub ? "bg-primary text-white" : "bg-card-2"}`}>
                  {i < sub ? "✓" : i + 1}
                </span>
                {s.tab}
              </button>
            ))}
          </div>
          {platform === "ios" && <p className="mt-3 text-sm font-medium text-muted">Easiest in Safari. Using Chrome? Tap Share in its address bar instead.</p>}
        </>
      )}
    </>
  );
}

const Ico = ({ d, size = 20 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const PLUS_BOX = "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM12 8v8M8 12h8";
const pulseBase = "outline-2 animate-[tutorial-pulse_1.8s_ease-in-out_infinite]";
const pulse = `${pulseBase} outline-accent-strong`;
/** The same on the blue cards, where the ring is white. */
const pulseWhite = `${pulseBase} outline-white`;

/** A small phone showing the browser at each step. */
function InstallPicture({ platform, sub }: { platform: "ios" | "android"; sub: number }) {
  const page = (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <RepsMark size={26} />
        <span className="display text-lg font-extrabold italic">Reps</span>
      </div>
      <div className="h-2.5 w-3/4 rounded bg-card-2" />
      <div className="h-2.5 rounded bg-card-2" />
      <div className="h-14 rounded-xl bg-primary/60" />
    </div>
  );
  const appRow = (
    <div className="flex items-center gap-3 p-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-line bg-bg">
        <RepsMark size={34} />
      </span>
      <span className="flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm font-bold">Reps</span>
    </div>
  );
  const menuRow = (text: string, on = false, d = PLUS_BOX) => (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] ${on ? `bg-primary/25 font-bold text-white outline ${pulse}` : "text-muted"}`}>
      {text}
      <Ico d={d} size={16} />
    </div>
  );

  return (
    <div className="absolute inset-x-10 top-14 bottom-0 overflow-hidden rounded-t-[22px] border border-b-0 border-line bg-bg">
      {platform === "ios" ? (
        <>
          <div className={sub === 0 ? "" : "opacity-35"}>{page}</div>
          {sub === 0 && (
            <div className="absolute inset-x-0 bottom-0 flex h-14 items-center gap-2 border-t border-line bg-card px-3 text-muted">
              <span className="flex-1 truncate rounded-full bg-bg px-3 py-1.5 text-xs">reps · your site</span>
              <span className={`flex h-9 w-9 items-center justify-center rounded-full text-lg font-extrabold text-white outline ${pulse}`}>⋯</span>
            </div>
          )}
          {sub === 1 && (
            <div className="absolute inset-x-0 bottom-0 animate-[tutorial-up_0.4s_ease-out] rounded-t-2xl bg-card-2 p-2">
              <div className="mb-1 flex items-center gap-2 border-b border-line px-2 pb-2 text-[13px] font-bold">
                <RepsMark size={22} /> Reps
              </div>
              {menuRow("Copy", false, "M8 8h12v12H8zM16 8V4H4v12h4")}
              {menuRow("Add to Bookmarks", false, "M6 3h12v18l-6-4-6 4z")}
              {menuRow("Add to Home Screen", true)}
            </div>
          )}
          {sub === 2 && (
            <div className="absolute inset-x-2 top-3 animate-[tutorial-up_0.4s_ease-out] rounded-2xl bg-card-2">
              <div className="flex items-center justify-between border-b border-line px-3 py-2.5 text-[13px] font-bold">
                <span className="font-medium text-muted">Cancel</span>
                <span>Add to Home Screen</span>
                <span className={`rounded-full bg-primary px-3 py-1 text-white outline ${pulse}`}>Add</span>
              </div>
              {appRow}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex h-9 items-center gap-2 bg-card px-3 text-xs text-muted">
            <span className="flex-1 truncate rounded-full bg-bg px-3 py-1">reps · your site</span>
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-lg font-extrabold text-white ${sub === 0 ? `outline ${pulse}` : ""}`}>⋮</span>
          </div>
          <div className={sub === 0 ? "" : "opacity-35"}>{page}</div>
          {sub === 1 && (
            <div className="absolute top-9 right-2 w-44 animate-[tutorial-up_0.4s_ease-out] rounded-xl bg-card-2 p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
              {menuRow("New tab", false, "M12 5v14M5 12h14")}
              {menuRow("Bookmarks", false, "M6 3h12v18l-6-4-6 4z")}
              {menuRow("Add to Home screen", true)}
            </div>
          )}
          {sub === 2 && (
            <div className="absolute inset-x-3 top-12 animate-[tutorial-up_0.4s_ease-out] rounded-2xl bg-card-2">
              <p className="px-4 pt-3 text-[15px] font-bold">Install app?</p>
              {appRow}
              <div className="flex justify-end gap-2 px-3 pb-3 text-[13px] font-bold">
                <span className="px-2 py-1 text-muted">Cancel</span>
                <span className={`rounded-full bg-primary px-4 py-1 text-white outline ${pulse}`}>Install</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Pictures of the real screens

/** Today's Up next card (up-next-card.tsx), shrunk. */
function UpNextArt() {
  const round = "flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/70";
  return (
    <div className="flex w-[84%] flex-col gap-2 rounded-[24px] bg-primary p-3.5 text-white">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-[0.12em] text-[#DCE4FF]">UP NEXT</span>
        <span className="display text-xs font-extrabold tracking-[0.08em] text-[#DCE4FF]">Change</span>
      </div>
      <span className="display text-[36px] leading-[0.85] font-extrabold">Push</span>
      <span className="-mt-1 text-xs font-semibold text-[#DCE4FF]">Chest · Shoulders · Triceps</span>
      <div className="flex items-center gap-2 rounded-xl bg-black/20 px-2.5 py-1.5">
        <span className="text-[10px] font-bold tracking-[0.12em] text-[#DCE4FF]">READINESS</span>
        <span className="h-1.5 flex-1 rounded-full bg-white/20">
          <span className="block h-full w-[92%] rounded-full bg-good" />
        </span>
        <span className="display num text-base leading-none font-extrabold">92%</span>
        <span className="display text-xs font-extrabold text-[#C9F7DA]">Ready</span>
      </div>
      <div className="flex items-start gap-2">
        <span className={`display flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-white text-lg font-extrabold tracking-[0.08em] text-primary outline ${pulseWhite}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z" /></svg>
          Start
        </span>
        <span className="flex flex-col items-center gap-0.5">
          <span className={round}><Ico d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" size={18} /></span>
          <span className="text-[9px] font-bold text-white/80">Regenerate</span>
        </span>
        <span className="flex flex-col items-center gap-0.5">
          <span className={round}><Sparkle size={18} white /></span>
          <span className="text-[9px] font-bold text-white/80">Customize</span>
        </span>
      </div>
    </div>
  );
}

/** Today's exercise list: the first row swipes open to show its actions, like ReorderList. */
function SwipeArt({ kg }: { kg: boolean }) {
  const actions = [
    ["Swap", "bg-primary"],
    ["How-to", "bg-[#2a3150]"],
    ["Notes", "bg-[#3b4a8c]"],
    ["Remove", "bg-danger"],
  ];
  const row = (name: string, dose: string, weight: string) => (
    <div className="flex min-h-14 items-center gap-3 border-b border-line bg-card px-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold">{name}</span>
        <span className="block text-xs font-medium text-muted">{dose}</span>
      </span>
      <span className="display num text-base font-extrabold">{weight}</span>
    </div>
  );
  return (
    <div className="w-[88%] overflow-hidden rounded-2xl bg-card">
      <div className="px-3 pt-2.5 pb-1.5 text-[11px] font-bold tracking-[0.12em] text-accent">IN TODAY&apos;S PUSH</div>
      <div className="relative overflow-hidden">
        <div className="absolute inset-y-0 right-0 flex">
          {actions.map(([l, c]) => (
            <span key={l} className={`flex w-[52px] items-center justify-center text-[10px] font-bold text-white ${c}`}>{l}</span>
          ))}
        </div>
        <div className="relative animate-[tutorial-swipe_3.6s_ease-in-out_infinite]">
          {row("Incline Dumbbell Press", "3 × 8–10", kg ? "20 kg" : "45 lb")}
        </div>
      </div>
      {row("Cable Fly", "3 × 12–15", kg ? "15 kg" : "30 lb")}
      {row("Lateral Raise", "3 × 12–15", kg ? "7.5 kg" : "15 lb")}
      <div className="p-2.5">
        <div className="display flex h-10 items-center justify-center rounded-[12px] border-2 border-dashed border-line text-sm font-extrabold tracking-[0.08em] text-accent-soft">+ Add exercise</div>
      </div>
    </div>
  );
}

/** The live workout's blue set panel (set-dock.tsx): weight and reps wheels, RPE, Log set, then rest. */
function SetPanelArt({ kg, rpe }: { kg: boolean; rpe: number }) {
  const wheel = (label: string, vals: [string, string, string]) => (
    <div className="relative h-[108px] overflow-hidden rounded-[16px] bg-black/15">
      <span className="display num block h-9 pt-1 text-center text-[24px] leading-9 font-extrabold text-white/40">{vals[0]}</span>
      <span className="absolute inset-x-1.5 top-9 h-9 rounded-[11px] bg-white shadow-[0_6px_16px_rgba(0,0,30,0.25)]" />
      <span className="display num relative block h-9 text-center text-[26px] leading-9 font-extrabold text-primary">{vals[1]}</span>
      <span className="display absolute top-[49px] right-2.5 text-[9px] leading-none font-bold tracking-[0.08em] text-primary/75">{label}</span>
      <span className="display num block h-9 text-center text-[24px] leading-9 font-extrabold text-white/40">{vals[2]}</span>
    </div>
  );
  return (
    <div className="flex w-[84%] flex-col gap-2 rounded-[24px] bg-primary p-3 text-white">
      <div className="flex items-baseline justify-between px-1">
        <span className="display truncate text-lg font-extrabold">Bench Press</span>
        <span className="display num text-sm font-extrabold text-[#DCE4FF]">SET 2 OF 3</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {wheel(kg ? "KG" : "LB", kg ? ["57.5", "60", "62.5"] : ["130", "135", "140"])}
        {wheel("REPS", ["7", "8", "9"])}
      </div>
      <div className="flex items-center gap-1 px-1">
        <span className="display w-9 text-xs font-extrabold text-[#DCE4FF]">RPE</span>
        {[6, 7, 8, 9, 10].map((n) => (
          <span key={n} className={`display num flex h-7 flex-1 items-center justify-center rounded-full text-sm font-extrabold ${n === rpe ? "bg-white text-primary" : "text-white/70"}`}>{n}</span>
        ))}
      </div>
      <span className={`display flex h-11 items-center justify-center rounded-full bg-white text-lg font-extrabold tracking-[0.06em] text-primary outline ${pulseWhite}`}>Log set 2</span>
      <div className="flex items-center gap-2 px-1">
        <span className="display text-[11px] font-extrabold tracking-[0.1em] text-[#DCE4FF]">REST</span>
        <span className="h-1.5 flex-1 rounded-full bg-white/20"><span className="block h-full w-3/5 rounded-full bg-white" /></span>
        <span className="display num text-base font-extrabold">1:30</span>
        <span className="display text-xs font-extrabold text-[#DCE4FF]">+15</span>
        <span className="display text-xs font-extrabold">Skip rest</span>
      </div>
    </div>
  );
}

/** The gym pill on Today and its "Where are you training?" sheet (gym-switcher.tsx). */
function GymArt({ names, here }: { names: string[]; here: string }) {
  return (
    <div className="flex w-[86%] flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="display text-xl leading-none font-extrabold">Hey there</span>
        <span className={`display flex h-9 items-center gap-1 rounded-full border-2 border-accent-strong/70 bg-card px-3 text-sm font-bold tracking-[0.06em] text-accent-soft outline ${pulse}`}>
          <span className="max-w-28 truncate">{here}</span>
          <Ico d="M6 9l6 6 6-6" size={12} />
        </span>
      </div>
      <div className="rounded-[22px] border-t border-line bg-card px-3 pt-2 pb-3">
        <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-line" />
        <p className="display mb-2 text-base font-extrabold">Where are you training?</p>
        <div className="flex flex-col gap-1.5">
          {names.map((n) => (
            <div
              key={n}
              className={`flex min-h-10 items-center justify-between rounded-xl border-2 px-3 text-sm font-bold ${
                n === here ? "border-accent-strong bg-primary/15 text-accent-soft" : "border-line bg-card-2"
              }`}
            >
              <span className="truncate">{n}</span>
              {n === here && <span className="display text-[11px] font-extrabold tracking-[0.08em]">Here now</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Recovery's "Every muscle" tiles above Progress's month calendar. */
function TrackArt() {
  const tiles: [string, number][] = [["Chest", 94], ["Quads", 88], ["Lats", 55], ["Hamstrings", 42]];
  // A few days in a month: lift (blue), cardio (teal), both (split), today (ring).
  const days: ("l" | "c" | "b" | "" | "t")[] = ["l", "", "c", "l", "", "b", "", "l", "", "c", "l", "", "", "t"];
  return (
    <div className="flex w-[86%] flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(([n, s]) => (
          <div key={n} className="rounded-xl bg-card-2 px-2.5 py-2">
            <div className="flex justify-between text-xs font-bold">
              <span>{n}</span>
              <span className="num">{s}%</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-line">
              <div className={`h-full rounded-full ${s >= READY_AVG ? "bg-good" : "bg-warn"}`} style={{ width: `${s}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-card-2 p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="display text-sm font-extrabold">November</span>
          <span className="flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-extrabold tracking-[0.06em] text-gold-ink">PR</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => (
            <span
              key={i}
              className={`num flex aspect-square items-center justify-center rounded-md text-[11px] font-bold ${
                d === "l" ? "bg-chart-1 text-white" : d === "c" ? "bg-chart-2 text-white" : d === "t" ? "text-ink ring-2 ring-accent-strong" : "bg-card text-muted"
              }`}
              style={d === "b" ? { background: "linear-gradient(90deg, var(--chart-1) 50%, var(--chart-2) 50%)", color: "#fff" } : undefined}
            >
              {i + 7}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Last step: where the other things live. */
function ReadyArt() {
  const row = (icon: React.ReactNode, title: string, text: string) => (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-card-2 text-accent">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="block text-[13px] leading-snug font-medium text-muted">{text}</span>
      </span>
    </div>
  );
  return (
    <div className="flex w-full flex-col gap-3.5 px-5">
      {row(<Sparkle size={18} className="text-ai" />, "Plans and AI", "Plan tab: pick a split, Build with AI, or import a plan from text or screenshots.")}
      {row(<Ico d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5h.01" size={18} />, "Works with no signal", "Log in the gym offline. It syncs when you're back online.")}
      {row(<Ico d="M3.5 5.5h17v13h-17zM3.5 7.5l8.5 6 8.5-6" size={18} />, "Found a bug?", "More → Note to developer.")}
      {row(<Ico d="M7 4l13 8-13 8z" size={16} />, "See this again", "More → Show tutorial.")}
    </div>
  );
}

/**
 * Opens the tutorial on Today once, after onboarding, for anyone who hasn't seen it. Finishing or skipping saves
 * profiles.tutorial_seen_at (synced, so it's once per person, not per phone). Skipping shows where to find it again.
 */
export function FirstRunTutorial() {
  const { profile, save } = useProfile();
  const [closed, setClosed] = useState(false);
  const [toast, setToast] = useState(false);
  const show = Boolean(profile?.onboarded_at && !profile.tutorial_seen_at && !closed);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      {show && (
        <Tutorial
          onClose={(how) => {
            setClosed(true);
            if (how === "skip") setToast(true);
            void save({ tutorial_seen_at: new Date().toISOString() });
          }}
        />
      )}
      {toast && <ReplayToast />}
    </>
  );
}

export function ReplayToast() {
  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(var(--nav-h)+12px)] z-[60] mx-auto w-[calc(100%-2.5rem)] max-w-[24rem] animate-[tutorial-up_0.3s_ease-out] rounded-2xl border border-line bg-card-2 px-4 py-3 text-[15px] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
      Replay it anytime: More → Show tutorial.
    </div>
  );
}
