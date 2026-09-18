import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "accent" | "bad";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-4 py-3 ring-1 ring-foreground/5",
        className,
      )}
    >
      <p className="eyebrow truncate">{label}</p>
      <p
        className={cn(
          "mt-1 truncate font-mono text-2xl font-semibold tabular-nums",
          tone === "accent" && "text-primary",
          tone === "bad" && "text-red-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}
