import { Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBar } from "@/components/status-bar";
import type { Tone } from "@/lib/status";
import type { ShmResult as ShmResultData } from "@/lib/types";

function damageTone(fraction: number): Tone {
  if (fraction >= 0.8) return "bad";
  if (fraction >= 0.5) return "warn";
  return "good";
}

export function ShmResult({ result }: { result: ShmResultData }) {
  const { prediction, detail } = result;
  const pct = prediction * 100;
  const tone = damageTone(prediction);
  const remainingPct = (1 - prediction) * 100;

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Gauge className="size-8 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-2xl font-semibold">
                <span className="font-mono tabular-nums">{pct.toFixed(1)}%</span> of fatigue life used
              </p>
              <p className="eyebrow mt-0.5">Structural Health Monitoring · Cumulative Damage</p>
            </div>
          </div>
          <StatusBar value={pct} tone={tone} className="h-3" />
          <p className="text-sm text-muted-foreground">
            Estimated remaining life: <span className="font-medium text-foreground">{remainingPct.toFixed(1)}%</span>
          </p>
          <p className="rounded-lg border-l-2 border-primary bg-muted/30 p-3.5 text-sm leading-relaxed">
            {detail.note}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="eyebrow">What&apos;s driving the damage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {detail.damage_by_amplitude_band.map((band) => (
              <div key={band.amplitude_range} className="grid grid-cols-[110px_1fr_48px] items-center gap-3">
                <span className="text-xs text-muted-foreground">{band.amplitude_range}</span>
                <StatusBar value={band.share_of_damage * 100} tone="neutral" />
                <span className="text-right text-xs tabular-nums">
                  {(band.share_of_damage * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Amplitude ranges are in the stress units of the original signal; share of damage is each
            range&apos;s contribution to the total, driven by a small number of large-amplitude cycles.
          </p>
        </CardContent>
      </Card>

      <details className="group rounded-xl border border-border bg-card/60 p-4 open:ring-1 open:ring-border">
        <summary className="eyebrow cursor-pointer select-none text-primary marker:content-none">
          Technical details
        </summary>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Samples</dt>
            <dd className="font-medium">{detail.samples.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Rainflow cycles</dt>
            <dd className="font-medium">{detail.rainflow_cycles.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Largest amplitude</dt>
            <dd className="font-medium">{detail.largest_amplitude}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">S-N exponent (m)</dt>
            <dd className="font-medium">{detail.sn_exponent_m}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">S-N constant (C)</dt>
            <dd className="font-medium">{detail.sn_constant_C.toExponential(2)}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
