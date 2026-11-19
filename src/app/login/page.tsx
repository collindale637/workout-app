import { LoginForm } from "./login-form";
import { RepsLogo } from "@/components/logo";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="safe-top safe-bottom flex min-h-dvh flex-col px-5">
      <div className="mt-16">
        <RepsLogo height={52} />
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
