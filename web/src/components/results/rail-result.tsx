import { TrainFront } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBar } from "@/components/status-bar";
import { StatusPill } from "@/components/status-pill";
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
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <TrainFront className="size-8 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-2xl font-semibold">{prediction}</p>
                <p className="eyebrow mt-0.5">Rail Corrugation · {detail.speed_kmh} km/h at recording time</p>
              </div>
            </div>
            <StatusPill tone={classTone(prediction)} className="uppercase tracking-wide">
              {topConfidence.toLocaleString(undefined, { style: "percent", maximumFractionDigits: 0 })} sure
            </StatusPill>
          </div>
          <p className="rounded-lg border-l-2 border-primary bg-muted/30 p-4 text-sm leading-relaxed">
            {detail.note}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="eyebrow">Confidence by class</CardTitle>
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

      <details className="group rounded-xl border border-border bg-card/60 p-4 open:ring-1 open:ring-border">
        <summary className="eyebrow cursor-pointer select-none text-primary marker:content-none">
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
