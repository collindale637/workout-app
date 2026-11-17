"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";

function friendlyError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match. Check them and try again.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "New accounts are closed. Ask Collin to add you.";
  if (m.includes("already registered")) return "That email already has an account. Sign in instead.";
  if (m.includes("password should be")) return "Use a longer password (at least 6 characters).";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many tries. Wait a minute and try again.";
  if (m.includes("fetch") || m.includes("network")) return "Can't reach the server. Check your connection.";
  return message;
}

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});

  // Coming back to this page from the browser's back/forward cache (e.g. after signing out) must
  // never show the previous person's email or a button stuck on "One sec…".
  useEffect(() => {
    function reset(e: PageTransitionEvent) {
      if (!e.persisted) return;
      setEmail("");
      setPassword("");
      setShowPassword(false);
      setBusy(false);
      setError(null);
    }
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  if (!supabaseConfigured) {
    return (
      <p className="mt-8 rounded-2xl border border-line bg-card p-4 text-sm font-semibold text-warn">
        Supabase isn&apos;t connected yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the environment.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = getSupabaseBrowser();
    const cleanEmail = email.trim().toLowerCase();
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) {
        setBusy(false);
        return setError(friendlyError(error.message));
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { name: name.trim() } },
      });
      if (error) {
        setBusy(false);
        return setError(friendlyError(error.message));
      }
      if (!data.session) {
        setBusy(false);
        return setError("Account created, but it needs email confirmation. Ask Collin to turn off \"Confirm email\" in Supabase.");
      }
    }
    // Signed in: don't leave the password (or a stuck busy button) behind in this form.
    setPassword("");
    setShowPassword(false);
    setBusy(false);
    router.replace("/");
    router.refresh();
  }

  const label = "text-xs font-bold tracking-[0.1em] text-muted";
  const input =
    "h-14 w-full rounded-2xl border-2 border-line bg-card px-4 text-lg font-semibold text-ink placeholder:text-muted/60 outline-none focus:border-accent-strong";

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
      {mode === "up" && (
        <>
          <label className={label} htmlFor="name">FIRST NAME</label>
          <input id="name" autoComplete="given-name" required value={name} onChange={(e) => setName(e.target.value)} className={`${input} mb-2`} />
        </>
      )}
      <label className={label} htmlFor="email">EMAIL</label>
      <input
        id="email"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        onBlur={() => {
          const v = email.trim();
          setFieldError((f) => ({ ...f, email: v && !/^\S+@\S+\.\S+$/.test(v) ? "That doesn't look like an email address." : undefined }));
        }}
        className={input}
      />
      {fieldError.email && <p role="alert" className="text-sm font-bold text-warn">{fieldError.email}</p>}
      <label className={`${label} mt-2`} htmlFor="password">PASSWORD</label>
      <div className="relative">
        <input
          id="password"
          type={showPassword ? "text" : "password"}
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          minLength={6}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setFieldError((f) => ({ ...f, password: mode === "up" && password && password.length < 6 ? "Use at least 6 characters." : undefined }))}
          className={`${input} pr-20`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className="display absolute inset-y-0 right-2 my-auto h-11 px-3 text-sm font-extrabold tracking-[0.06em] text-accent"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      {mode === "up" && !fieldError.password && <p className="text-sm font-medium text-muted">At least 6 characters.</p>}
      {fieldError.password && <p role="alert" className="text-sm font-bold text-warn">{fieldError.password}</p>}
      <button
        type="submit"
        disabled={busy || !email || !password}
        className="display mt-2 h-14 w-full rounded-2xl bg-primary text-xl font-extrabold text-white shadow-[inset_0_-5px_0_var(--primary-press)] active:translate-y-px disabled:opacity-50"
      >
        {busy ? "One sec…" : mode === "in" ? "Sign in" : "Create account"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-warn">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setError(null);
        }}
        className="h-11 text-sm font-bold text-accent"
      >
        {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
      {mode === "in" && <p className="text-center text-sm font-medium text-muted">Forgot your password? Ask Collin to reset it.</p>}
    </form>
  );
}
