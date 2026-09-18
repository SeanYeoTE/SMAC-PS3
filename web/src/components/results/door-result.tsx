import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { StatusBar } from "@/components/status-bar";
import { badgeTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { DoorResult as DoorResultData } from "@/lib/types";

export function DoorResult({ result }: { result: DoorResultData }) {
  const { segments, detail } = result;
  const allNormal = detail.n_abnormal === 0;
  const maxRatio = Math.max(detail.ratio_threshold, ...detail.per_segment.map((s) => s.ratio));
  const thresholdPct = (detail.ratio_threshold / maxRatio) * 100;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {allNormal ? (
              <CheckCircle2 className="size-8 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : (
              <AlertTriangle className="size-8 shrink-0 text-red-600" aria-hidden="true" />
            )}
            <div>
              <p className="text-2xl font-semibold">
                {detail.n_abnormal} of {detail.n_segments} cycles look abnormal
              </p>
              <p className="text-sm text-muted-foreground">Train Door — open/close resistance check</p>
            </div>
          </div>
          <p className="rounded-lg border-l-4 border-primary bg-muted/40 p-4 text-sm leading-relaxed">
            {detail.note}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Every cycle</CardTitle>
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
              {segments.map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{s.start_time}</TableCell>
                  <TableCell className="font-mono text-xs">{s.end_time}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        badgeTone[s.prediction === "Normal" ? "good" : "bad"],
                      )}
                    >
                      {s.prediction}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium text-primary">
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
                <span className="text-xs text-muted-foreground">
                  {seg.operation} #{i + 1}
                </span>
                <StatusBar
                  value={(seg.ratio / maxRatio) * 100}
                  tone={seg.abnormal ? "bad" : "good"}
                  markerPct={thresholdPct}
                  markerLabel={`Threshold ${detail.ratio_threshold}×`}
                />
                <span className="text-right text-xs tabular-nums">{seg.ratio.toFixed(3)}×</span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
