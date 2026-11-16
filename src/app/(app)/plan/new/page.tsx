import { Suspense } from "react";
import { PlanBuilder } from "./plan-builder";

export const metadata = { title: "New plan" };

export default function NewPlanPage() {
  return (
    <Suspense>
      <PlanBuilder />
    </Suspense>
  );
}
