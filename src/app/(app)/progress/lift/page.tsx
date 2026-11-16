import { Suspense } from "react";
import { LiftScreen } from "./lift-detail";

export const metadata = { title: "Lift" };

export default function LiftPage() {
  return (
    <Suspense>
      <LiftScreen />
    </Suspense>
  );
}
