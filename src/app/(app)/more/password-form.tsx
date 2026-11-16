"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/** Lets people replace the starting password they were given. */
export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setMessage({ ok: false, text: "Use at least 8 characters." });
    if (password !== confirm) return setMessage({ ok: false, text: "The two passwords don't match." });
    setBusy(true);
    setMessage(null);
    const { error } = await getSupabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (error) return setMessage({ ok: false, text: `Couldn't change it: ${error.message}` });
    setPassword("");
    setConfirm("");
    setMessage({ ok: true, text: "Password changed" });
  }

  const label = "text-xs font-bold tracking-[0.1em] text-muted";
  const field = "h-12 w-full rounded-2xl border-2 border-line bg-card-2 px-4 text-base font-semibold text-ink outline-none focus:border-accent-strong";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
      <h2 className="display text-xl font-extrabold">Change password</h2>
      <label className="flex flex-col gap-2">
        <span className={label}>NEW PASSWORD</span>
        <input type="password" autoComplete="new-password" className={field} value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="flex flex-col gap-2">
        <span className={label}>TYPE IT AGAIN</span>
        <input type="password" autoComplete="new-password" className={field} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <button type="submit" disabled={busy || !password} className="display h-12 rounded-2xl border-2 border-accent-strong text-lg font-extrabold tracking-[0.06em] text-accent-soft disabled:opacity-50">
        {busy ? "Saving…" : "Change password"}
      </button>
      {message && <p role="status" className={`text-sm font-semibold ${message.ok ? "text-good" : "text-warn"}`}>{message.text}</p>}
    </form>
  );
}
