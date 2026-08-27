"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  emptyProfile,
  type AcademicInput,
  type AvailabilityInput,
  type GoalInput,
  type PlannerProfile,
} from "../lib/local-planner";

interface PlannerContextValue {
  profile: PlannerProfile;
  setAcademic: (academic: AcademicInput) => void;
  setGoal: (goal: GoalInput) => void;
  setSkillLevels: (skillLevels: Record<string, number>) => void;
  setAvailability: (availability: AvailabilityInput) => void;
  reset: () => void;
}

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<PlannerProfile>(emptyProfile);
  const value = useMemo<PlannerContextValue>(
    () => ({
      profile,
      setAcademic: (academic) =>
        setProfile((current) => ({ ...current, academic })),
      setGoal: (goal) => setProfile((current) => ({ ...current, goal })),
      setSkillLevels: (skillLevels) =>
        setProfile((current) => ({ ...current, skillLevels })),
      setAvailability: (availability) =>
        setProfile((current) => ({ ...current, availability })),
      reset: () => setProfile(emptyProfile()),
    }),
    [profile],
  );
  return (
    <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
  );
}

export function usePlanner(): PlannerContextValue {
  const context = useContext(PlannerContext);
  if (!context)
    throw new Error("usePlanner must be used inside PlannerProvider");
  return context;
}
