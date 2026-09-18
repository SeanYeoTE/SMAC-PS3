"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Download, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { StatusPill } from "@/components/status-pill";
import { ResultView } from "@/components/results";
import { downloadResultCsv } from "@/lib/csv";
import { countFlagged, summarizeResult, type ResultSummary } from "@/lib/summary";
import { cn } from "@/lib/utils";
import type { BatchItem } from "@/lib/types";

type Filter = "all" | "normal" | "problem";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "normal", label: "Normal" },
  { key: "problem", label: "Problem" },
];

function summaryOf(item: BatchItem): ResultSummary | null {
  return item.status === "done" ? summarizeResult(item.result) : null;
}

const compareChartConfig = {
  severityPct: { label: "Severity" },
} satisfies ChartConfig;

const toneFill: Record<ResultSummary["tone"], string> = {
  good: "var(--color-chart-2)",
  bad: "var(--destructive)",
  warn: "var(--color-chart-4)",
  neutral: "var(--color-chart-1)",
};

export function BatchResults({ items }: { items: BatchItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const summaries = useMemo(() => items.map(summaryOf), [items]);

  if (items.length === 1) {
    const item = items[0];
    if (item.status === "pending" || item.status === "processing") {
      return (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
          {item.status === "processing" ? "Analyzing…" : "Queued…"}
        </div>
      );
    }
    return item.status === "error" ? (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t analyze this file</AlertTitle>
        <AlertDescription>{item.error}</AlertDescription>
      </Alert>
    ) : (
      <ResultView result={item.result} />
    );
  }

  const rows = items.map((item, i) => ({ item, i, summary: summaries[i] }));
  const filtered = rows.filter(({ summary }) => {
    if (filter === "all") return true;
    if (!summary) return filter === "problem";
    return filter === "problem" ? summary.bad : !summary.bad;
  });

  const compareIndices = selected.size > 0 ? [...selected] : filtered.map(({ i }) => i);
  const compareRows = compareIndices
    .map((i) => ({ item: items[i], summary: summaries[i], i }))
    .filter((row): row is { item: BatchItem; summary: ResultSummary; i: number } => row.summary !== null)
    .sort((a, b) => b.summary.severityPct - a.summary.severityPct);

  function toggle(set: Set<number>, setSet: (s: Set<number>) => void, i: number) {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSet(next);
  }

  const doneCount = items.filter((it) => it.status === "done").length;
  const problemCount = countFlagged(items);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">
          {doneCount} of {items.length} analyzed · {problemCount} flagged
        </p>
        <div className="flex items-center gap-1" role="group" aria-label="Filter results">
          {FILTERS.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={filter === key ? "secondary" : "ghost"}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {compareRows.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="eyebrow">
              Comparing {compareRows.length} file{compareRows.length === 1 ? "" : "s"}
              {selected.size === 0 && " — check files below to compare a specific set"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={compareChartConfig}
              className="aspect-auto w-full"
              style={{ height: Math.max(compareRows.length * 32, 96) }}
            >
              <BarChart
                data={compareRows.map(({ item, summary }) => ({
                  name: item.file.name,
                  severityPct: Number(summary.severityPct.toFixed(1)),
                  tone: summary.tone,
                }))}
                layout="vertical"
                margin={{ left: 8 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} unit="%" />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={120}
                  tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="severityPct" radius={4}>
                  <LabelList dataKey="severityPct" position="right" fontSize={11} formatter={(v) => `${v}%`} />
                  {compareRows.map(({ summary, i }) => (
                    <Cell key={i} fill={toneFill[summary.tone]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            <p className="mt-3 text-sm text-muted-foreground">
              {compareRows[0].summary.severityLabel} — higher means more concerning.
              {compareRows.some((r) => r.summary.remainingLifePct !== undefined) &&
                " Remaining life is in each file's own detail view below."}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <p className="rounded-xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
            No files match this filter.
          </p>
        )}
        {filtered.map(({ item, i, summary }) => (
          <Card key={i} size="sm">
            <CardContent className="flex flex-col gap-0 p-0">
              <div className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  aria-label={`Select ${item.file.name} for comparison`}
                  checked={selected.has(i)}
                  onChange={() => toggle(selected, setSelected, i)}
                  className="size-4 shrink-0 accent-primary"
                />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => (item.status === "done" || item.status === "error") && toggle(expanded, setExpanded, i)}
                  aria-expanded={expanded.has(i)}
                  disabled={item.status === "pending" || item.status === "processing"}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{item.file.name}</span>
                  {item.status === "processing" && (
                    <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
                      Analyzing…
                    </span>
                  )}
                  {item.status === "pending" && (
                    <span className="shrink-0 text-sm text-muted-foreground">Queued…</span>
                  )}
                  {item.status === "error" && <StatusPill tone="bad">Failed</StatusPill>}
                  {summary && (
                    <>
                      <StatusPill tone={summary.tone}>{summary.label}</StatusPill>
                      {summary.remainingLifePct !== undefined && (
                        <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">
                          {summary.remainingLifePct.toFixed(0)}% life left
                        </span>
                      )}
                    </>
                  )}
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      expanded.has(i) && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>
                {item.status === "done" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Download CSV for ${item.file.name}`}
                    onClick={() => downloadResultCsv(item.result)}
                  >
                    <Download aria-hidden="true" />
                  </Button>
                )}
              </div>
              {expanded.has(i) && item.status === "error" && (
                <div className="border-t border-border p-3">
                  <p className="flex items-center gap-2 text-sm text-red-600">
                    <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                    {item.error}
                  </p>
                </div>
              )}
              {expanded.has(i) && item.status === "done" && (
                <div className="border-t border-border p-3">
                  <ResultView result={item.result} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
