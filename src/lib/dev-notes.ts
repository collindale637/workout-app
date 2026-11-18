"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useData } from "@/lib/db/provider";

export type InboxNote = {
  id: string;
  body: string;
  app_version: string | null;
  device: string | null;
  created_at: string;
  done_at: string | null;
  sender: string;
};

/**
 * Whether this account may open the notes inbox. The server decides (public.is_app_admin, backed by the
 * app_admins table); the answer is remembered on the phone so the More row doesn't flicker while offline.
 */
export function useIsAppAdmin() {
  const { db } = useData();
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void db.getMeta<boolean>("isAppAdmin").then((v) => live && v !== undefined && setAdmin((cur) => cur ?? v));
    void getSupabaseBrowser()
      .rpc("is_app_admin")
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (!live || error || typeof data !== "boolean") return;
        setAdmin(data);
        void db.setMeta("isAppAdmin", data);
      });
    return () => {
      live = false;
    };
  }, [db]);
  return admin;
}

/**
 * The inbox: every family member's notes, newest first. Read straight from the server (online only), unlike the
 * rest of the app: it's an admin view of other people's notes, which the phone never stores.
 */
export function useDevInbox() {
  const [notes, setNotes] = useState<InboxNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await getSupabaseBrowser().rpc("dev_notes_inbox");
    if (error) setError(navigator.onLine ? "Couldn't load notes." : "You're offline. Notes load when you're back online.");
    else {
      setError(null);
      setNotes((data ?? []) as InboxNote[]);
    }
  }, []);
  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect -- fetch on open
  }, [load]);
  const setDone = useCallback(async (id: string, done: boolean) => {
    // Show it straight away; put it back if the server says no.
    setNotes((cur) => cur?.map((n) => (n.id === id ? { ...n, done_at: done ? new Date().toISOString() : null } : n)) ?? cur);
    const { error } = await getSupabaseBrowser().rpc("dev_note_set_done", { note_id: id, done });
    if (error) void load();
  }, [load]);
  return { notes, error, reload: load, setDone };
}

/** "iPhone · Safari", "Android · Chrome", "Mac · Chrome"… from a user agent. */
export function deviceLabel(ua: string | null): string {
  if (!ua) return "";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "";
  const browser = /CriOS|Chrome\//.test(ua) && !/Edg/.test(ua) ? "Chrome" : /FxiOS|Firefox/.test(ua) ? "Firefox" : /Edg/.test(ua) ? "Edge" : /Safari/.test(ua) ? "Safari" : "";
  return [os, browser].filter(Boolean).join(" · ");
}
