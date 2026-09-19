"use client";

import { RcaText } from "@/components/results/rca-text";
import { BreakdownSimulator, type SimulatorPoint } from "@/components/results/breakdown-simulator";
import { EvidenceFeed, evidenceToFeed } from "@/components/results/evidence-feed";

import { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { StatTile } from "@/components/stat-tile";
import { StatusBar } from "@/components/status-bar";
import { StatusPill } from "@/components/status-pill";
import { formatDoorTimestamp } from "@/lib/format";
import type { DoorResult as DoorResultData, Rca, RcaStatus } from "@/lib/types";

const chartConfig = {
  ratio: { label: "Ratio to baseline", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

function dataQualityWarnings(detail: DoorResultData["detail"]): string[] {
  const warnings: string[] = [];
  const byOp = new Map<string, typeof detail.per_segment>();
  for (const seg of detail.per_segment) {
    byOp.set(seg.operation, [...(byOp.get(seg.operation) ?? []), seg]);
  }
  for (const [op, segs] of byOp) {
    const abnormalCount = segs.filter((s) => s.abnormal).length;
    if (abnormalCount / segs.length > 0.5) {
      warnings.push(
        `More than half of the ${op} cycles (${abnormalCount}/${segs.length}) came back abnormal. ` +
          `That usually means the "typical" baseline for this operation isn't typical anymore — worth a manual look rather than trusting the label alone.`,
      );
    }
  }
  const normalRatios = detail.per_segment.filter((s) => !s.abnormal).map((s) => s.ratio);
  const abnormalRatios = detail.per_segment.filter((s) => s.abnormal).map((s) => s.ratio);
  if (normalRatios.length && abnormalRatios.length) {
    const closestNormal = Math.max(...normalRatios);
    const closestAbnormal = Math.min(...abnormalRatios);
    const gapPct = ((closestAbnormal - closestNormal) / detail.ratio_threshold) * 100;
    if (gapPct < 3) {
      warnings.push(
        "The closest normal and abnormal cycles sit right next to each other, with no clear gap between them near the cutoff. This result is less certain than usual — small sensor noise could flip it either way.",
      );
    }
  }
  return warnings;
}

export function DoorResult({
  result,
  rca,
  rcaStatus,
}: {
  result: DoorResultData;
  rca?: Rca;
  rcaStatus?: RcaStatus;
}) {
  const { segments, detail } = result;
  const allNormal = detail.n_abnormal === 0;
  const maxRatio = Math.max(detail.ratio_threshold, ...detail.per_segment.map((s) => s.ratio));
  const thresholdPct = (detail.ratio_threshold / maxRatio) * 100;
  const warnings = useMemo(() => dataQualityWarnings(detail), [detail]);
  const [sortMode, setSortMode] = useState<"abnormal" | "chronological">("abnormal");
  const [scrubIndex, setScrubIndex] = useState(0);

  const simPoints: SimulatorPoint[] = useMemo(
    () =>
      segments.map((s, i) => ({
        x: segments.length > 1 ? (i / (segments.length - 1)) * 100 : 0,
        label: `${s.prediction === "Normal" ? "OK" : "FAIL"} · cycle ${i + 1}`,
        severity: s.prediction === "Normal" ? "good" : "bad",
      })),
    [segments],
  );
  const scrubbedSegment = segments[scrubIndex];
  const scrubbedDetail = detail.per_segment[scrubIndex];

  const chartData = useMemo(
    () =>
      detail.per_segment.map((s, i) => ({
        name: `${s.operation === "Open" ? "O" : "C"}${i + 1}`,
        ratio: s.ratio,
        abnormal: s.abnormal,
      })),
    [detail],
  );

  const orderedSegments = useMemo(() => {
    const withIndex = segments.map((s, i) => ({ ...s, _i: i }));
    if (sortMode === "chronological") return withIndex;
    return withIndex.sort((a, b) => {
      const aAbnormal = a.prediction !== "Normal";
      const bAbnormal = b.prediction !== "Normal";
      if (aAbnormal !== bAbnormal) return aAbnormal ? -1 : 1;
      return a._i - b._i;
    });
  }, [segments, sortMode]);

  return (
    <div className="flex flex-col gap-3">
      {warnings.map((w, i) => (
        <Alert key={i} variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Worth a closer look</AlertTitle>
          <AlertDescription>{w}</AlertDescription>
        </Alert>
      ))}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-3">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {allNormal ? (
              <CheckCircle2 className="size-8 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : (
              <AlertTriangle className="size-8 shrink-0 text-red-600" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-xl font-semibold sm:text-2xl">
                <span className="tabular-nums">
                  {detail.n_abnormal} of {detail.n_segments}
                </span>{" "}
                cycles look abnormal
              </p>
              <p className="eyebrow mt-0.5">Train Door · Open/Close Resistance Check</p>
            </div>
          </div>
          <RcaText result={result} rca={rca} rcaStatus={rcaStatus} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Cycles Found" value={detail.n_segments} />
        <StatTile label="Abnormal" value={detail.n_abnormal} tone={detail.n_abnormal > 0 ? "bad" : "default"} />
        <StatTile label="Priority" value={detail.priority.toUpperCase()} tone={detail.priority === "high" ? "bad" : "default"} />
        <StatTile label="Times Threshold" value={detail.urgency?.times_threshold?.toFixed(2) ?? "—"} />
      </div>

      {scrubbedSegment && scrubbedDetail && (
        <BreakdownSimulator
          axisName="DOOR STREAM"
          span={`${formatDoorTimestamp(segments[0].start_time)} → ${formatDoorTimestamp(segments.at(-1)!.end_time)}`}
          points={simPoints}
          ticks={[segments[0] ? formatDoorTimestamp(segments[0].start_time) : "", segments.at(-1) ? formatDoorTimestamp(segments.at(-1)!.end_time) : ""]}
          index={scrubIndex}
          onChange={setScrubIndex}
        />
      )}
      {scrubbedSegment && scrubbedDetail && (
        <p className="text-sm text-muted-foreground">
          Cycle {scrubIndex + 1}: {scrubbedDetail.operation}, ratio {scrubbedDetail.ratio.toFixed(3)}× —{" "}
          <span className={scrubbedSegment.prediction === "Normal" ? "text-emerald-700" : "text-red-700"}>{scrubbedSegment.prediction}</span>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="eyebrow">Ratio to baseline, per cycle</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
            <BarChart data={chartData} margin={{ left: -20 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} />
              <ReferenceLine
                y={detail.ratio_threshold}
                stroke="var(--destructive)"
                strokeDasharray="4 4"
                label={{ value: `Threshold ${detail.ratio_threshold}×`, fontSize: 11, position: "insideTopRight" }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="ratio" radius={4}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.abnormal ? "var(--color-chart-1)" : "var(--muted-foreground)"} fillOpacity={d.abnormal ? 1 : 0.5} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="eyebrow">Every cycle</CardTitle>
          <div className="flex items-center gap-1" role="group" aria-label="Sort order">
            <Button
              type="button"
              size="sm"
              variant={sortMode === "abnormal" ? "secondary" : "ghost"}
              aria-pressed={sortMode === "abnormal"}
              onClick={() => setSortMode("abnormal")}
            >
              Abnormal first
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sortMode === "chronological" ? "secondary" : "ghost"}
              aria-pressed={sortMode === "chronological"}
              onClick={() => setSortMode("chronological")}
            >
              Chronological
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <span className="sm:hidden">Time</span>
                  <span className="hidden sm:inline">Start</span>
                </TableHead>
                <TableHead className="hidden sm:table-cell">End</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderedSegments.map((s) => (
                <TableRow key={s._i}>
                  <TableCell className="text-sm">
                    {formatDoorTimestamp(s.start_time)}
                    {/* phones: end time under the start time instead of its own column */}
                    <span className="block text-xs text-muted-foreground sm:hidden">
                      to {formatDoorTimestamp(s.end_time)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">{formatDoorTimestamp(s.end_time)}</TableCell>
                  <TableCell>
                    <StatusPill tone={s.prediction === "Normal" ? "good" : "bad"}>
                      {s.prediction === "Normal" ? (
                        s.prediction
                      ) : (
                        <>
                          <span className="sm:hidden">Abnormal</span>
                          <span className="hidden sm:inline">{s.prediction}</span>
                        </>
                      )}
                    </StatusPill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <details className="group rounded-xl border border-border bg-card/60 p-4 open:ring-1 open:ring-border">
        <summary className="eyebrow flex cursor-pointer select-none items-center justify-between text-primary marker:content-none">
          Technical Details
          <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-4 flex flex-col gap-5 text-sm">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Ratio threshold</dt>
              <dd className="font-medium">{detail.ratio_threshold}×</dd>
            </div>
            {Object.entries(detail.baselines_mA).map(([op, val]) => (
              <div key={op}>
                <dt className="text-muted-foreground">{op} baseline</dt>
                <dd className="font-medium">{val} mA</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Current relative to baseline, per cycle. The tick marks the abnormal threshold.
            </p>
            {detail.per_segment.map((seg, i) => (
              <div key={i} className="grid grid-cols-[92px_1fr_56px] items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {seg.operation} #{i + 1}
                </span>
                <StatusBar
                  value={(seg.ratio / maxRatio) * 100}
                  tone={seg.abnormal ? "bad" : "good"}
                  markerPct={thresholdPct}
                  markerLabel={`Threshold ${detail.ratio_threshold}×`}
                />
                <span className="text-right text-sm tabular-nums">{seg.ratio.toFixed(3)}×</span>
              </div>
            ))}
          </div>
        </div>
      </details>
      </div>
      <EvidenceFeed entries={evidenceToFeed(detail.evidence)} />
      </div>
    </div>
  );
}
