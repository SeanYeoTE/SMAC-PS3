import { RcaText } from "@/components/results/rca-text";
import { ChevronDown, Snowflake } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { StatusPill } from "@/components/status-pill";
import { confidenceTone } from "@/lib/status";
import type { AcvResult as AcvResultData, Rca, RcaStatus } from "@/lib/types";

const chartConfig = {
  score: { label: "Cabin temp vs median (°C)", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

export function AcvResult({
  result,
  rca,
  rcaStatus,
}: {
  result: AcvResultData;
  rca?: Rca;
  rcaStatus?: RcaStatus;
}) {
  const { prediction, detail } = result;
  const rankedCars = result.ranked_cars.split("|");
  const tone = confidenceTone(detail.confidence);
  const chartData = rankedCars.map((car) => ({
    car: `Car ${car}`,
    score: Number(detail.scores_degC[car]?.toFixed(3) ?? 0),
    isTop: car === prediction,
  }));

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Snowflake className="size-8 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-2xl font-semibold">
                  Car <span className="tabular-nums">{prediction}</span> most likely has the leak
                </p>
                <p className="eyebrow mt-0.5">Air Conditioning &amp; Ventilation · Refrigerant Leak Ranking</p>
              </div>
            </div>
            <StatusPill tone={tone} className="uppercase tracking-wide">
              {detail.confidence} confidence
            </StatusPill>
          </div>
          <RcaText result={result} rca={rca} rcaStatus={rcaStatus} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="eyebrow">All cars, ranked</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} unit="°C" />
              <YAxis type="category" dataKey="car" tickLine={false} axisLine={false} fontSize={11} width={70} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="score" radius={4}>
                <LabelList dataKey="score" position="right" fontSize={11} formatter={(v) => `${Number(v) >= 0 ? "+" : ""}${v}°C`} />
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.isTop ? "var(--destructive)" : "var(--color-chart-1)"} fillOpacity={d.isTop ? 1 : 0.6} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
          <p className="mt-3 text-sm text-muted-foreground">
            Score is each car&apos;s cabin temperature relative to the train median — warmer means less cooling
            capacity, consistent with a refrigerant leak.
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
