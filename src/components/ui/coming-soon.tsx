/** Placeholder for tabs that get built in later phases. */
export function ComingSoon({ title, phase, children }: { title: string; phase: string; children: React.ReactNode }) {
  return (
    <section className="mt-2 flex flex-col gap-4">
      <header className="flex h-11 items-center">
        <h1 className="display text-4xl font-extrabold">{title}</h1>
      </header>
      <div className="rounded-3xl border border-line bg-card p-5">
        <p className="text-xs font-bold tracking-[0.1em] text-accent">COMING IN {phase.toUpperCase()}</p>
        <p className="mt-2 text-base font-medium text-muted">{children}</p>
      </div>
    </section>
  );
}
