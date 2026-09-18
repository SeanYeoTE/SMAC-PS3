import { DoorClosed, Activity, Snowflake, TrainFront, type LucideIcon } from "lucide-react";
import type { SubsystemKey } from "@/lib/types";

export const SUBSYSTEM_ICONS: Record<SubsystemKey, LucideIcon> = {
  door: DoorClosed,
  shm: Activity,
  acv: Snowflake,
  rail: TrainFront,
};

export const SUBSYSTEM_BLURBS: Record<SubsystemKey, string> = {
  door: "Checks whether each door open/close cycle drew normal motor current.",
  shm: "Estimates how much of the structure's fatigue life has been used up.",
  acv: "Finds which car's air conditioning is most likely leaking refrigerant.",
  rail: "Classifies track corrugation from a car's vibration recording.",
};
