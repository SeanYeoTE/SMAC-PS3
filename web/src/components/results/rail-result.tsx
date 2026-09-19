import { RcaText } from "@/components/results/rca-text";
import { BreakdownSimulator, type SimulatorPoint } from "@/components/results/breakdown-simulator";
import { EvidenceFeed, evidenceToFeed } from "@/components/results/evidence-feed";
import { TrainFront, AlertTriangle, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { StatTile } from "@/components/stat-tile";
import { StatusBar } from "@/components/status-bar";
import { StatusPill } from "@/components/status-pill";
import type { Tone } from "@/lib/status";
import type { RailResult as RailResultData, Rca, RcaStatus } from "@/lib/types";

const LOW_CONFIDENCE = 0.7;

function classTone(label: string): Tone {
  return label === "Normal" ? "good" : "bad";
}

const confidenceChartConfig = {
  confidence: { label: "Confidence", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

export function RailResult({
  result,
  rca,
  rcaStatus,
}: {
  result: RailResultData;
  rca?: Rca;
  rcaStatus?: RcaStatus;
}) {
  const { prediction, detail } = result;
  const confidenceEntries = Object.entries(detail.confidence);
  const maxRms = Math.max(detail.side_I_rms, detail.side_II_rms) || 1;
  const topConfidence = detail.confidence[prediction] ?? 0;
  const needsInspection = topConfidence < LOW_CONFIDENCE;
  const [scrubIndex, setScrubIndex] = useState(0);

  const sides = [
    { key: "Side I", rms: detail.side_I_rms },
    { key: "Side II", rms: detail.side_II_rms },
  ];
  const simPoints: SimulatorPoint[] = sides.map((s, i) => ({
    x: (i / (sides.length - 1)) * 100,
    label: `${s.key} · ${s.rms.toFixed(5)}`,
    severity: s.rms === maxRms ? "warn" : "neutral",
  }));
  const scrubbedSide = sides[scrubIndex];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-3">
      {needsInspection && (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Needs inspection — low confidence</AlertTitle>
          <AlertDescription>
            The model is only{" "}
            {topConfidence.toLocaleString(undefined, { style: "percent", maximumFractionDigits: 0 })} sure
            about this label. Treat it as a lead, not a final answer, and have someone check this
            recording in person.
          </AlertDescription>
        </Alert>
      )}

      {detail.stationary && (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Stationary recording</AlertTitle>
          <AlertDescription>
            This recording was taken at only {detail.speed_kmh} km/h — the train was essentially not
            moving. This check works by breaking the vibration signal down into frequencies (like a
            spectrum), which only makes sense while the train is rolling. Without real motion, that
            frequency breakdown is unreliable, so treat this result with caution.
          </AlertDescription>
        </Alert>
      )}

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
          <RcaText result={result} rca={rca} rcaStatus={rcaStatus} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Speed" value={`${detail.speed_kmh} km/h`} />
        <StatTile label="Side I / II" value={detail.side_I_over_II.toFixed(2)} />
        <StatTile label="Priority" value={detail.priority.toUpperCase()} tone={detail.priority === "high" ? "bad" : "default"} />
        <StatTile label="Times Threshold" value={detail.urgency?.times_threshold?.toFixed(2) ?? "—"} />
      </div>

      <BreakdownSimulator
        axisName="AXLE BOX SIDES"
        span="Side I vs Side II"
        points={simPoints}
        ticks={["Side I", "Side II"]}
        index={scrubIndex}
        onChange={setScrubIndex}
      />
      {scrubbedSide && (
        <p className="text-sm text-muted-foreground">
          {scrubbedSide.key}: RMS {scrubbedSide.rms.toFixed(5)}.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="eyebrow">Confidence by class</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={confidenceChartConfig} className="aspect-auto h-48 w-full">
            <BarChart
              data={confidenceEntries.map(([label, prob]) => ({
                label,
                confidence: Number((prob * 100).toFixed(1)),
              }))}
              layout="vertical"
              margin={{ left: 8 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} unit="%" />
              <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={11} width={70} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="confidence" radius={4}>
                <LabelList dataKey="confidence" position="right" fontSize={11} formatter={(v) => `${v}%`} />
                {confidenceEntries.map(([label], i) => (
                  <Cell
                    key={i}
                    fill={label === prediction ? (classTone(label) === "bad" ? "var(--destructive)" : "var(--color-chart-2)") : "var(--muted-foreground)"}
                    fillOpacity={label === prediction ? 1 : 0.4}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <details className="group rounded-xl border border-border bg-card/60 p-4 open:ring-1 open:ring-border">
        <summary className="eyebrow flex cursor-pointer select-none items-center justify-between text-primary marker:content-none">
          Technical Details
          <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <div className="grid grid-cols-[80px_1fr_72px] items-center gap-3">
            <span className="text-muted-foreground">Side I</span>
            <StatusBar value={(detail.side_I_rms / maxRms) * 100} tone="neutral" />
            <span className="text-right text-sm tabular-nums">{detail.side_I_rms.toFixed(5)}</span>
          </div>
          <div className="grid grid-cols-[80px_1fr_72px] items-center gap-3">
            <span className="text-muted-foreground">Side II</span>
            <StatusBar value={(detail.side_II_rms / maxRms) * 100} tone="neutral" />
            <span className="text-right text-sm tabular-nums">{detail.side_II_rms.toFixed(5)}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Vibration RMS by side. Side I ÷ Side II ratio: {detail.side_I_over_II.toFixed(3)}
          </p>
        </div>
      </details>
      </div>
      <EvidenceFeed entries={evidenceToFeed(detail.evidence)} />
      </div>
    </div>
  );
}
