"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";
import { useActiveGym } from "@/lib/hooks";
import { Card, Empty, PageHeader, RowLink, btn } from "@/components/ui/kit";
import { TEMPLATE_LABELS } from "@/lib/defaults";

export function GymList() {
  const { db } = useData();
  const { gyms } = useActiveGym();
  const counts = useLiveQuery(async () => {
    const rows = await db.gym_equipment.toArray();
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.gym_id, (m.get(r.gym_id) ?? 0) + 1);
    return m;
  }, [db]);

  return (
    <main className="flex flex-col gap-4">
      <PageHeader title="Gyms" back="/more" />
      {gyms.length === 0 ? (
        <Empty>No gyms yet. Add the places you train and tick the equipment each one has.</Empty>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {gyms
            .slice()
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((g) => (
              <RowLink
                key={g.id}
                href={`/more/gyms/edit?id=${g.id}`}
                title={g.name}
                detail={
                  <span className="inline-flex items-center gap-1.5">
                    {g.is_default && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-accent" role="img" aria-label="Primary gym"><path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9z" /></svg>
                    )}
                    {counts?.get(g.id) ?? 0} items · {g.template ? TEMPLATE_LABELS[g.template].name : "Custom"}
                  </span>
                }
              />
            ))}
        </Card>
      )}
      <Link href="/more/gyms/edit?new=1" className={btn.primary}>+ Add a gym</Link>
    </main>
  );
}
