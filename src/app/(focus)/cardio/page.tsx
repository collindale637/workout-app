import { Suspense } from "react";
import { CardioForm } from "./cardio-form";

export const metadata = { title: "Log cardio" };

export default function CardioPage() {
  return (
    <Suspense>
      <CardioForm />
    </Suspense>
  );
}
