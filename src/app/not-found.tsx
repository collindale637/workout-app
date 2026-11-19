import Link from "next/link";
import { RepsLogo } from "@/components/logo";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 px-5 text-center">
      <RepsLogo height={28} />
      <span className="display text-7xl leading-none font-extrabold text-accent">404</span>
      <h1 className="display text-3xl font-extrabold">That page isn&apos;t here.</h1>
      <p className="text-base font-medium text-muted">The link may be out of date, or the page has moved.</p>
      <Link href="/" className="display mt-2 flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-xl font-extrabold text-white shadow-[inset_0_-5px_0_var(--primary-press)]">
        Go to Today
      </Link>
    </main>
  );
}
