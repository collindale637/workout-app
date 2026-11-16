import { Suspense } from "react";
import { AiPlanScreen } from "./ai-plan";

export const metadata = { title: "Build with AI" };

export default function AiPlanPage() {
  return (
    <Suspense>
      <AiPlanScreen />
    </Suspense>
  );
}
