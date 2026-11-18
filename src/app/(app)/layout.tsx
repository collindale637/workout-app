import { ViewTransition } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { DataProvider } from "@/lib/db/provider";
import { OnboardingGate } from "@/components/onboarding-gate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Only links that carry a type animate (see the view transition rules in globals.css); tabs stay instant. */}
      <ViewTransition
        update={{ "nav-back": "nav-back", default: "none" }}
        default="none"
      >
        <div className="safe-top mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-28">
          <DataProvider>
            <OnboardingGate>{children}</OnboardingGate>
          </DataProvider>
        </div>
      </ViewTransition>
      <BottomNav />
    </>
  );
}
