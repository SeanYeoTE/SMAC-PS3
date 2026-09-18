import { TrainFront } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBar } from "@/components/status-bar";
import { badgeTone } from "@/lib/status";
import type { Tone } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { RailResult as RailResultData } from "@/lib/types";

function classTone(label: string): Tone {
  return label === "Normal" ? "good" : "bad";
}

export function RailResult({ result }: { result: RailResultData }) {
  const { prediction, detail } = result;
  const confidenceEntries = Object.entries(detail.confidence);
  const maxRms = Math.max(detail.side_I_rms, detail.side_II_rms) || 1;
  const topConfidence = detail.confidence[prediction] ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <TrainFront className="size-8 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-2xl font-semibold">{prediction}</p>
              <p className="text-sm text-muted-foreground">
                Rail Corrugation — {detail.speed_kmh} km/h at recording time
              </p>
            </div>
            <span
              className={cn(
                "ml-auto inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                badgeTone[classTone(prediction)],
              )}
            >
              {topConfidence.toLocaleString(undefined, { style: "percent", maximumFractionDigits: 0 })}{" "}
              sure
            </span>
          </div>
          <p className="rounded-lg border-l-4 border-primary bg-muted/40 p-4 text-sm leading-relaxed">
            {detail.note}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Confidence by class</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {confidenceEntries.map(([label, prob]) => (
              <div key={label} className="grid grid-cols-[80px_1fr_48px] items-center gap-3">
                <span className={cn("text-sm", label === prediction ? "font-semibold text-primary" : "text-muted-foreground")}>
                  {label}
                </span>
                <StatusBar value={prob * 100} tone={label === prediction ? classTone(label) : "neutral"} />
                <span className="text-right text-xs tabular-nums">{(prob * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium text-primary">
          Technical details
        </summary>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <div className="grid grid-cols-[80px_1fr_72px] items-center gap-3">
            <span className="text-muted-foreground">Side I</span>
            <StatusBar value={(detail.side_I_rms / maxRms) * 100} tone="neutral" />
            <span className="text-right text-xs tabular-nums">{detail.side_I_rms.toFixed(5)}</span>
          </div>
          <div className="grid grid-cols-[80px_1fr_72px] items-center gap-3">
            <span className="text-muted-foreground">Side II</span>
            <StatusBar value={(detail.side_II_rms / maxRms) * 100} tone="neutral" />
            <span className="text-right text-xs tabular-nums">{detail.side_II_rms.toFixed(5)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Vibration RMS by side. Side I ÷ Side II ratio: {detail.side_I_over_II.toFixed(3)}
          </p>
        </div>
      </details>
    </div>
  );
}
