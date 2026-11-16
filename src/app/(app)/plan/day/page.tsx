import { Suspense } from "react";
import { DayEditor } from "./day-editor";

export const metadata = { title: "Plan day" };

export default function PlanDayPage() {
  return (
    <Suspense>
      <DayEditor />
    </Suspense>
  );
}
