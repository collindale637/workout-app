import { LoginForm } from "./login-form";
import { APP_NAME } from "@/lib/app";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="safe-top safe-bottom flex min-h-dvh flex-col px-5">
      <div className="mt-16 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-[inset_0_-4px_0_var(--primary-press)]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" />
          </svg>
        </span>
        <span className="display text-4xl font-extrabold">{APP_NAME}</span>
      </div>
      <h1 className="display mt-10 text-5xl font-extrabold leading-none">
        Let&apos;s get
        <br />
        <span className="text-accent">to work.</span>
      </h1>
      <p className="mt-3 text-base font-medium text-muted">
        Family only. Each person gets their own login and private training log.
      </p>
      <LoginForm />
    </main>
  );
}
