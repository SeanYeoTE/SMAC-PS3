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
                "relative flex min-h-24 flex-col items-start gap-1.5 overflow-hidden rounded-xl border bg-card p-3.5 pl-4.5 text-left transition-colors",
                "before:absolute before:inset-y-0 before:left-0 before:w-1",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isSelected
                  ? "border-primary/40 bg-primary/5 before:bg-primary"
                  : "border-border hover:border-primary/30 hover:bg-muted/30 before:bg-border",
              )}
            >
              <span className="flex w-full items-center gap-2">
                <Icon className={cn("size-4.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                <span className="font-mono text-sm font-semibold tracking-wide text-muted-foreground">
                  {key.toUpperCase()}
                </span>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {meta.accepts.join(" / ")}
                </span>
              </span>
              <span className="font-semibold">{meta.label}</span>
              <span className="text-sm text-muted-foreground">{BLURBS[key]}</span>
            </button>
          );
        })}
    </div>
  );
}
