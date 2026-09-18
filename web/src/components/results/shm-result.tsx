import { RcaText } from "@/components/results/rca-text";
import { ChevronDown, Gauge } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { StatusBar } from "@/components/status-bar";
import type { Tone } from "@/lib/status";
import type { Rca, RcaStatus, ShmResult as ShmResultData } from "@/lib/types";

const chartConfig = {
  share: { label: "Share of damage", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

function damageTone(fraction: number): Tone {
  if (fraction >= 0.8) return "bad";
  if (fraction >= 0.5) return "warn";
  return "good";
}

export function ShmResult({
  result,
  rca,
  rcaStatus,
}: {
  result: ShmResultData;
  rca?: Rca;
  rcaStatus?: RcaStatus;
}) {
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
                <span className="tabular-nums">{pct.toFixed(1)}%</span> of fatigue life used
              </p>
              <p className="eyebrow mt-0.5">Structural Health Monitoring · Cumulative Damage</p>
            </div>
          </div>
          <StatusBar value={pct} tone={tone} className="h-3" />
          <p className="text-sm text-muted-foreground">
            Estimated remaining life: <span className="font-medium text-foreground">{remainingPct.toFixed(1)}%</span>
          </p>
          <RcaText result={result} rca={rca} rcaStatus={rcaStatus} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="eyebrow">What&apos;s driving the damage</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
            <BarChart
              data={detail.damage_by_amplitude_band.map((b) => ({
                range: b.amplitude_range,
                share: Number((b.share_of_damage * 100).toFixed(1)),
              }))}
              layout="vertical"
              margin={{ left: 8 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} unit="%" />
              <YAxis type="category" dataKey="range" tickLine={false} axisLine={false} fontSize={11} width={90} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="share" fill="var(--color-share)" radius={4}>
                <LabelList dataKey="share" position="right" fontSize={11} formatter={(v) => `${v}%`} />
              </Bar>
            </BarChart>
          </ChartContainer>
          <p className="mt-3 text-sm text-muted-foreground">
            Amplitude ranges are in the stress units of the original signal; share of damage is each
            range&apos;s contribution to the total, driven by a small number of large-amplitude cycles.
          </p>
        </CardContent>
      </Card>

      <details className="group rounded-xl border border-border bg-card/60 p-4 open:ring-1 open:ring-border">
        <summary className="eyebrow flex cursor-pointer select-none items-center justify-between text-primary marker:content-none">
          Technical Details
          <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
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
