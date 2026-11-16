import { Suspense } from "react";
import { ExerciseDetail } from "./exercise-detail";

export const metadata = { title: "Exercise" };

export default function ExercisePage() {
  return (
    <Suspense>
      <ExerciseDetail />
    </Suspense>
  );
}
