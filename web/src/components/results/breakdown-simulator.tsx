"use client";

import { SlidersHorizontal } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { dotTone, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";

export interface SimulatorPoint {
  /** 0-100 position along the axis. */
  x: number;
  label: string;
  severity: Tone;
}

export function BreakdownSimulator({
  axisName,
  span,
  points,
  ticks,
  index,
  onChange,
}: {
  axisName: string;
  span: string;
  points: SimulatorPoint[];
  ticks: string[];
  index: number;
  onChange: (index: number) => void;
}) {
  const current = points[index];
  const scrubPct = points.length > 1 ? (index / (points.length - 1)) * 100 : 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="eyebrow tracking-[0.16em]">BREAKDOWN SIMULATOR · {axisName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{span}</span>
          {current && (
            <span
              className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium text-white")}
              style={{ backgroundColor: `var(--${current.severity === "bad" ? "crimson" : current.severity === "warn" ? "amber" : current.severity === "good" ? "emerald" : "steel"})` }}
            >
              {current.label}
            </span>
          )}
        </div>
      </div>

      <div className="relative h-[70px]">
        <div className="absolute top-[28px] h-2 w-full rounded-full bg-track-well" />
        <div
          className="absolute top-[28px] h-2 rounded-full bg-gradient-to-r from-primary/35 to-primary"
          style={{ width: `${scrubPct}%` }}
        />
        {points.map((p, i) => (
          <div
            key={i}
            className="absolute top-[24px] flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${p.x}%` }}
          >
            <span className={cn("size-2.5 rounded-full", dotTone[p.severity])} style={{ boxShadow: `0 0 0 4px var(--${p.severity === "bad" ? "crimson" : p.severity === "warn" ? "amber" : "emerald"})33` }} />
          </div>
        ))}
        <Slider
          value={[index]}
          min={0}
          max={Math.max(points.length - 1, 0)}
          step={1}
          onValueChange={([v]) => onChange(v)}
          className="absolute top-[24px] [&_[data-slot=slider-track]]:bg-transparent"
        />
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground">
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}
