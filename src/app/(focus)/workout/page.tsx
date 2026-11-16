import { Suspense } from "react";
import { WorkoutScreen } from "./workout-screen";

export const metadata = { title: "Workout" };

export default function WorkoutPage() {
  return (
    <Suspense>
      <WorkoutScreen />
    </Suspense>
  );
}
