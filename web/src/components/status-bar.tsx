import { cn } from "@/lib/utils";
import { barTone, type Tone } from "@/lib/status";

export function StatusBar({
  value,
  tone = "neutral",
  markerPct,
  markerLabel,
  className,
}: {
  value: number;
  tone?: Tone;
  /** Draws a vertical tick at this percent, e.g. to mark a pass/fail threshold. */
  markerPct?: number;
  markerLabel?: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn("relative h-2 w-full overflow-visible rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full w-full overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", barTone[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {markerPct !== undefined && (
        <div
          className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-foreground/50"
          style={{ left: `${Math.min(100, Math.max(0, markerPct))}%` }}
          title={markerLabel}
        />
      )}
    </div>
  );
}
