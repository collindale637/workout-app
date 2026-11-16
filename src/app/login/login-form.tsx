"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";

type Step = "email" | "code";

function friendlyError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("signups not allowed") || m.includes("not allowed for otp") || m.includes("user not found")) {
    return "That email isn't invited yet. Ask Collin to add you.";
  }
  if (m.includes("expired") || m.includes("invalid")) return "That code didn't work. Check it or send a new one.";
  if (m.includes("rate limit") || m.includes("security purposes")) return "Too many tries. Wait a minute and try again.";
  return message;
}

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!supabaseConfigured) {
    return (
      <p className="mt-8 rounded-2xl border border-line bg-card p-4 text-sm font-semibold text-warn">
        Supabase isn&apos;t connected yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the environment.
      </p>
    );
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await getSupabaseBrowser().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // Invite-only: never create an account from the sign-in screen.
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    setBusy(false);
    if (error) return setError(friendlyError(error.message));
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await getSupabaseBrowser().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setBusy(false);
      return setError(friendlyError(error.message));
    }
    router.replace("/");
    router.refresh();
  }

  const input =
    "h-14 w-full rounded-2xl border-2 border-line bg-card px-4 text-lg font-semibold text-ink placeholder:text-muted/60 outline-none focus:border-accent-strong";
  const button =
    "display h-14 w-full rounded-2xl bg-primary text-xl font-extrabold text-white shadow-[inset_0_-5px_0_var(--primary-press)] active:translate-y-px disabled:opacity-50";

  return (
    <div className="mt-8">
      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <label className="text-xs font-bold tracking-[0.1em] text-muted" htmlFor="email">
            EMAIL
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={input}
          />
          <button type="submit" disabled={busy || !email} className={button}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <label className="text-xs font-bold tracking-[0.1em] text-muted" htmlFor="code">
            CODE SENT TO {email.toUpperCase()}
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,8}"
            maxLength={8}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className={`${input} num text-center text-3xl tracking-[0.3em]`}
          />
          <button type="submit" disabled={busy || code.length < 6} className={button}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="h-11 text-sm font-bold text-accent"
          >
            Use a different email
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
