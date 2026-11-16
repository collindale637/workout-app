"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export type Goal = "strength" | "hypertrophy" | "fat_loss" | "general";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Units = "lb" | "kg";

export type Profile = {
  id: string;
  display_name: string | null;
  units: Units;
  goal: Goal;
  experience: Experience;
  days_per_week: number;
  session_minutes: number;
  default_rpe: number;
  active_gym_id: string | null;
};

export const GOAL_LABELS: Record<Goal, string> = {
  strength: "Strength",
  hypertrophy: "Build muscle",
  fat_loss: "Fat loss / toning",
  general: "General fitness",
};

export const EXPERIENCE_LABELS: Record<Experience, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

type State =
  | { status: "loading" }
  | { status: "ready"; profile: Profile; email: string | null }
  | { status: "error"; message: string };

/** The signed-in person's profile row (created automatically when they're invited). */
export function useProfile() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setState({ status: "error", message: "Not signed in" });
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, units, goal, experience, days_per_week, session_minutes, default_rpe, active_gym_id")
      .eq("id", auth.user.id)
      .single();
    if (error || !data) return setState({ status: "error", message: error?.message ?? "No profile" });
    setState({ status: "ready", profile: { ...data, default_rpe: Number(data.default_rpe) } as Profile, email: auth.user.email ?? null });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading remote data on mount
    void load();
  }, [load]);

  const save = useCallback(async (changes: Partial<Omit<Profile, "id">>) => {
    if (state.status !== "ready") return { error: "Profile not loaded" };
    const { error } = await getSupabaseBrowser().from("profiles").update(changes).eq("id", state.profile.id);
    if (error) return { error: error.message };
    setState({ ...state, profile: { ...state.profile, ...changes } });
    return { error: null };
  }, [state]);

  return { state, reload: load, save };
}
