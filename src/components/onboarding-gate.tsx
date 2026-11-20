"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useData, useProfile } from "@/lib/db/provider";
import { FirstRunTutorial } from "@/components/tutorial";

/** Sends new people to the short welcome flow before anything else, then shows the tutorial once on Today. */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { db, userId } = useData();
  const { profile } = useProfile();
  const router = useRouter();
  const pathname = usePathname();
  const exempt = pathname.startsWith("/welcome") || pathname.startsWith("/more/gyms");
  const needsWelcome = Boolean(profile && !profile.onboarded_at && !exempt);

  useEffect(() => {
    if (!needsWelcome) return;
    let cancelled = false;
    // Next.js keeps visited screens alive in the background, so the value above can be stale
    // when you come back to one. Re-read the saved profile before redirecting.
    void db.profile.get(userId).then((fresh) => {
      if (!cancelled && fresh && !fresh.onboarded_at) router.replace("/welcome");
    });
    return () => {
      cancelled = true;
    };
  }, [needsWelcome, db, userId, router]);

  if (!profile) return null;
  return (
    <>
      {children}
      {/* After onboarding, the tutorial opens once on Today (not over a page someone deep-linked to). */}
      {pathname === "/" && <FirstRunTutorial />}
    </>
  );
}
