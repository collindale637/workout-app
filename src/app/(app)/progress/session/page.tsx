import { Suspense } from "react";
import { SessionDetail } from "./session-detail";

export const metadata = { title: "Workout" };

export default function SessionPage() {
  return (
    <Suspense>
      <SessionDetail />
    </Suspense>
  );
}
