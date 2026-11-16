import { Suspense } from "react";
import { GymEditor } from "./gym-editor";

export const metadata = { title: "Gym" };

export default function GymEditPage() {
  return (
    <Suspense>
      <GymEditor />
    </Suspense>
  );
}
