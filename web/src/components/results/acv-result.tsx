import { Snowflake } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBar } from "@/components/status-bar";
import { StatusPill } from "@/components/status-pill";
import { confidenceTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { AcvResult as AcvResultData } from "@/lib/types";

export function AcvResult({ result }: { result: AcvResultData }) {
  const { prediction, detail } = result;
  const rankedCars = result.ranked_cars.split("|");
  const scores = Object.values(detail.scores_degC);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  const tone = confidenceTone(detail.confidence);

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Snowflake className="size-8 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-2xl font-semibold">
                  Car <span className="font-mono tabular-nums">{prediction}</span> most likely has the leak
                </p>
                <p className="eyebrow mt-0.5">Air Conditioning &amp; Ventilation · Refrigerant Leak Ranking</p>
              </div>
            </div>
            <StatusPill tone={tone} className="uppercase tracking-wide">
              {detail.confidence} confidence
            </StatusPill>
          </div>
          <p className="rounded-lg border-l-2 border-primary bg-muted/30 p-3.5 text-sm leading-relaxed">
            {detail.note}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="eyebrow">All cars, ranked</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {rankedCars.map((car, i) => {
              const score = detail.scores_degC[car];
              const pct = ((score - min) / span) * 100;
              const isTop = i === 0;
              return (
                <div key={car} className="grid grid-cols-[80px_1fr_72px] items-center gap-3">
                  <span className={cn("text-sm", isTop ? "font-semibold text-primary" : "text-muted-foreground")}>
                    Car {car}
                  </span>
                  <StatusBar value={pct} tone={isTop ? "bad" : "neutral"} />
                  <span className="text-right text-sm tabular-nums">
                    {score >= 0 ? "+" : ""}
                    {score.toFixed(3)} °C
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Score is each car&apos;s cabin temperature relative to the train median — warmer means less cooling
            capacity, consistent with a refrigerant leak.
          </p>
        </CardContent>
      </Card>

      <details className="group rounded-xl border border-border bg-card/60 p-4 open:ring-1 open:ring-border">
        <summary className="eyebrow cursor-pointer select-none text-primary marker:content-none">
          Technical details
        </summary>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Margin over runner-up</dt>
            <dd className="font-medium">{detail.margin_over_runner_up_degC.toFixed(3)} °C</dd>
          </div>
          {Object.entries(detail.manual_control_fraction).length > 0 && (
            <div className="col-span-2 sm:col-span-3">
              <dt className="mb-1 text-muted-foreground">Time in manual control</dt>
              <dd className="flex flex-wrap gap-x-4 gap-y-1 font-medium">
                {Object.entries(detail.manual_control_fraction).map(([car, frac]) => (
                  <span key={car}>
                    Car {car}: {(frac * 100).toFixed(0)}%
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </details>
    </div>
  );
}
