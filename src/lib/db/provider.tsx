"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { LocalDB } from "./dexie";
import { ensureCatalog } from "./catalog";
import { markDeleted, markDirty, syncNow } from "./sync";
import type { Profile, SyncTable } from "./types";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

type DataContext = {
  db: LocalDB;
  userId: string;
  status: SyncStatus;
  lastError: string | null;
  requestSync: (delayMs?: number) => void;
};

const Ctx = createContext<DataContext | null>(null);

export function useData() {
  const ctx = use(Ctx);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}

/** Runs one sync at a time; a request made during a sync queues one more run. */
function createSyncRunner(db: LocalDB, userId: string, report: (status: SyncStatus, error: string | null) => void) {
  let running = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function run(): Promise<void> {
    if (running) {
      again = true;
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      report("offline", null);
      return;
    }
    running = true;
    report("syncing", null);
    try {
      const sb = getSupabaseBrowser();
      await ensureCatalog(db, sb);
      await syncNow(db, sb, userId);
      report("idle", null);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      const offline = /fetch|network|load failed/i.test(msg);
      report(offline ? "offline" : "error", offline ? null : msg);
    } finally {
      running = false;
      if (again) {
        again = false;
        void run();
      }
    }
  }

  return {
    run,
    request(delayMs = 1500) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), delayMs);
    },
    stop() {
      if (timer) clearTimeout(timer);
    },
  };
}

type Runner = ReturnType<typeof createSyncRunner>;

type Boot =
  | { state: "loading"; message: string }
  | { state: "ready"; db: LocalDB; userId: string; runner: Runner }
  | { state: "blocked"; message: string };

/**
 * Opens the phone's database for the signed-in person, downloads the exercise library the first time,
 * and keeps it in sync with Supabase (on load, after changes, when the signal comes back, and every minute).
 */
export function DataProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [boot, setBoot] = useState<Boot>({ state: "loading", message: "Loading…" });
  const [sync, setSync] = useState<{ status: SyncStatus; error: string | null }>({ status: "idle", error: null });

  useEffect(() => {
    let cancelled = false;
    let db: LocalDB | null = null;
    let runner: Runner | null = null;
    const report = (status: SyncStatus, error: string | null) => {
      if (!cancelled) setSync((prev) => ({ status, error: status === "error" ? error : status === "syncing" ? prev.error : null }));
    };
    (async () => {
      const sb = getSupabaseBrowser();
      // getSession reads the saved login on the phone, so it works offline.
      const { data } = await sb.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) {
        router.replace("/login");
        return;
      }
      db = new LocalDB(userId);
      await db.open();
      runner = createSyncRunner(db, userId, report);
      const hasCatalog = Boolean(await db.getMeta("catalogVersion"));
      const hasProfile = Boolean(await db.profile.get(userId));
      if (!hasCatalog || !hasProfile) {
        if (!navigator.onLine) {
          if (!cancelled) setBoot({ state: "blocked", message: "Connect to the internet once so the app can download your data and the exercise library. After that it works offline." });
          return;
        }
        if (!cancelled) setBoot({ state: "loading", message: "Downloading the exercise library…" });
        await runner.run();
        if (!(await db.profile.get(userId))) {
          if (!cancelled) setBoot({ state: "blocked", message: "Couldn't load your account. Check your connection and reopen the app." });
          return;
        }
      } else {
        void runner.run();
      }
      if (!cancelled) setBoot({ state: "ready", db, userId, runner });
    })().catch((e) => {
      if (!cancelled) setBoot({ state: "blocked", message: `Something went wrong opening the app: ${(e as Error).message}` });
    });

    const { data: sub } = getSupabaseBrowser().auth.onAuthStateChange((event: string) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      runner?.stop();
      db?.close();
    };
  }, [router]);

  const ready = boot.state === "ready" ? boot : null;
  const runner = ready?.runner;

  const requestSync = useCallback((delayMs = 1500) => runner?.request(delayMs), [runner]);

  useEffect(() => {
    if (!runner) return;
    const onOnline = () => runner.request(0);
    const onOffline = () => setSync({ status: "offline", error: null });
    const onVisible = () => document.visibilityState === "visible" && runner.request(0);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(() => runner.request(0), 60_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [runner]);

  const value = useMemo(
    () => (ready ? { db: ready.db, userId: ready.userId, status: sync.status, lastError: sync.error, requestSync } : null),
    [ready, sync, requestSync],
  );

  if (!value) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
        {boot.state === "loading" && <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-accent" aria-hidden="true" />}
        <p className={`text-base font-semibold ${boot.state === "blocked" ? "text-warn" : "text-muted"}`}>
          {boot.state === "ready" ? "" : boot.message}
        </p>
      </div>
    );
  }
  return <Ctx value={value}>{children}</Ctx>;
}

/** Saves a row on the phone and queues it for upload. */
export function useSave() {
  const { db, requestSync } = useData();
  return useCallback(
    async <T extends { id: string }>(table: Exclude<SyncTable, "profiles" | "gym_equipment" | "exercise_tags">, row: T) => {
      await (db[table] as unknown as { put: (r: T) => Promise<unknown> }).put(row);
      await markDirty(db, table, row.id);
      requestSync();
    },
    [db, requestSync],
  );
}

/** Deletes a row on the phone and queues the delete for the server. */
export function useRemove() {
  const { db, requestSync } = useData();
  return useCallback(
    async (table: Exclude<SyncTable, "profiles" | "gym_equipment" | "exercise_tags">, id: string) => {
      await (db[table] as unknown as { delete: (id: string) => Promise<unknown> }).delete(id);
      await markDeleted(db, table, id);
      requestSync();
    },
    [db, requestSync],
  );
}

export function useProfile() {
  const { db, userId, requestSync } = useData();
  const profile = useLiveQuery(() => db.profile.get(userId), [db, userId]);
  const save = useCallback(
    async (changes: Partial<Omit<Profile, "id">>) => {
      await db.profile.update(userId, changes);
      await markDirty(db, "profiles", userId);
      requestSync(500);
    },
    [db, userId, requestSync],
  );
  return { profile, save };
}

/** How many changes are waiting to upload. */
export function usePendingCount() {
  const { db } = useData();
  return useLiveQuery(async () => (await db.outbox.count()) + (await db.tombstones.count()), [db]) ?? 0;
}
