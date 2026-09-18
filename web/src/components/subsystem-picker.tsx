import { DoorClosed, Activity, Snowflake, TrainFront, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubsystemKey, SubsystemsResponse } from "@/lib/types";

const ICONS: Record<SubsystemKey, LucideIcon> = {
  door: DoorClosed,
  shm: Activity,
  acv: Snowflake,
  rail: TrainFront,
};

const BLURBS: Record<SubsystemKey, string> = {
  door: "Checks whether each door open/close cycle drew normal motor current.",
  shm: "Estimates how much of the structure's fatigue life has been used up.",
  acv: "Finds which car's air conditioning is most likely leaking refrigerant.",
  rail: "Classifies track corrugation from a car's vibration recording.",
};

export function SubsystemPicker({
  subsystems,
  selected,
  onSelect,
}: {
  subsystems: SubsystemsResponse;
  selected: SubsystemKey | null;
  onSelect: (key: SubsystemKey) => void;
}) {
  const order: SubsystemKey[] = ["door", "shm", "acv", "rail"];

  return (
    <div
      role="radiogroup"
      aria-label="Choose a subsystem to check"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {order
        .filter((key) => subsystems[key])
        .map((key) => {
          const meta = subsystems[key];
          const Icon = ICONS[key];
          const isSelected = selected === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(key)}
              className={cn(
                "flex min-h-28 flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40 hover:bg-muted/40",
              )}
            >
              <span className="flex items-center gap-2">
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <span className="font-semibold">{meta.label}</span>
              </span>
              <span className="text-sm text-muted-foreground">{BLURBS[key]}</span>
              <span className="mt-auto inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {meta.accepts.join(" / ")}
              </span>
            </button>
          );
        })}
    </div>
  );
}
