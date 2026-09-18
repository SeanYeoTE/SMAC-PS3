import type { ReactNode } from "react";
import { badgeTone, dotTone, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";

export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium",
        badgeTone[tone],
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", dotTone[tone])} aria-hidden="true" />
      {children}
    </span>
  );
}
