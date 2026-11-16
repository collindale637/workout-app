import type { CardioType } from "./db/types";

export const CARDIO_TYPES: { id: CardioType; label: string; distance: boolean }[] = [
  { id: "run", label: "Run", distance: true },
  { id: "walk", label: "Walk", distance: true },
  { id: "bike", label: "Bike", distance: true },
  { id: "row", label: "Row", distance: true },
  { id: "elliptical", label: "Elliptical", distance: true },
  { id: "stairs", label: "Stairs", distance: false },
  { id: "swim", label: "Swim", distance: true },
  { id: "hiit", label: "HIIT", distance: false },
  { id: "other", label: "Other", distance: false },
];

export const cardioLabel = (t: CardioType) => CARDIO_TYPES.find((c) => c.id === t)?.label ?? "Cardio";
