"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { StatusBar } from "@/components/status-bar";
import { StatusPill } from "@/components/status-pill";
import { formatDoorTimestamp } from "@/lib/format";
import type { DoorResult as DoorResultData } from "@/lib/types";

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

export function DoorResult({ result }: { result: DoorResultData }) {
  const { segments, detail } = result;
  const allNormal = detail.n_abnormal === 0;
  const maxRatio = Math.max(detail.ratio_threshold, ...detail.per_segment.map((s) => s.ratio));
  const thresholdPct = (detail.ratio_threshold / maxRatio) * 100;
  const warnings = useMemo(() => dataQualityWarnings(detail), [detail]);
  const [sortMode, setSortMode] = useState<"abnormal" | "chronological">("abnormal");

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

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {allNormal ? (
              <CheckCircle2 className="size-8 shrink-0 text-emerald-400" aria-hidden="true" />
            ) : (
              <AlertTriangle className="size-8 shrink-0 text-red-400" aria-hidden="true" />
            )}
            <div>
              <p className="text-2xl font-semibold">
                <span className="font-mono tabular-nums">
                  {detail.n_abnormal} of {detail.n_segments}
                </span>{" "}
                cycles look abnormal
              </p>
              <p className="eyebrow mt-0.5">Train Door · Open/Close Resistance Check</p>
            </div>
          </div>
          <p className="rounded-lg border-l-2 border-primary bg-muted/30 p-3.5 text-sm leading-relaxed">
            {detail.note}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="eyebrow">Every cycle</CardTitle>
          <div className="flex items-center gap-1" role="group" aria-label="Sort order">
            <Button
              type="button"
              size="xs"
              variant={sortMode === "abnormal" ? "secondary" : "ghost"}
              aria-pressed={sortMode === "abnormal"}
              onClick={() => setSortMode("abnormal")}
            >
              Abnormal first
            </Button>
            <Button
              type="button"
              size="xs"
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
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderedSegments.map((s) => (
                <TableRow key={s._i}>
                  <TableCell className="font-mono text-sm">{formatDoorTimestamp(s.start_time)}</TableCell>
                  <TableCell className="font-mono text-sm">{formatDoorTimestamp(s.end_time)}</TableCell>
                  <TableCell>
                    <StatusPill tone={s.prediction === "Normal" ? "good" : "bad"}>
                      {s.prediction}
                    </StatusPill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <details className="group rounded-xl border border-border bg-card/60 p-4 open:ring-1 open:ring-border">
        <summary className="eyebrow cursor-pointer select-none text-primary marker:content-none">
          Technical details
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
            <p className="text-xs text-muted-foreground">
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
  );
}
