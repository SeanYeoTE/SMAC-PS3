"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, TrainFront } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/stat-tile";
import { StatusBar } from "@/components/status-bar";
import { StatusPill } from "@/components/status-pill";
import { SubsystemSidebar } from "@/components/subsystem-sidebar";
import { UploadCard } from "@/components/upload-card";
import { BatchResults } from "@/components/batch-results";
import { fetchRca, fetchSubsystems, predict } from "@/lib/api";
import { downloadBatchSummaryCsv, downloadPredictionsCsv, downloadResultCsv } from "@/lib/csv";
import { countFlagged, summarizeResult } from "@/lib/summary";
import type { BatchItem, PredictResult, SubsystemKey, SubsystemsResponse } from "@/lib/types";

async function predictOne(subsystem: SubsystemKey, file: File): Promise<BatchItem> {
  try {
    const result = await predict(subsystem, file);
    return { file, status: "done", result };
  } catch (err) {
    return { file, status: "error", error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

function fileStagedLabel(files: File[]): string {
  if (files.length === 0) return "—";
  return files.length === 1 ? "Ready" : `${files.length} files`;
}

function lastResultSummary(items: BatchItem[] | null): { label: string; bad: boolean } {
  if (!items || items.length === 0) return { label: "—", bad: false };
  const settledCount = items.filter((it) => it.status === "done" || it.status === "error").length;
  if (settledCount < items.length) return { label: `${settledCount}/${items.length} done`, bad: false };
  if (items.length === 1) {
    const item = items[0];
    if (item.status === "error") return { label: "Error", bad: true };
    if (item.status === "done") return summarizeResult(item.result);
    return { label: "—", bad: false };
  }
  const flagged = countFlagged(items);
  return { label: `${flagged}/${items.length} flagged`, bad: flagged > 0 };
}

export default function Home() {
  const [subsystems, setSubsystems] = useState<SubsystemsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SubsystemKey | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<BatchItem[] | null>(null);
  const resultSummary = useMemo(() => lastResultSummary(items), [items]);
  const isAnalyzing = items?.some((it) => it.status === "pending" || it.status === "processing") ?? false;
  const settledCount = items?.filter((it) => it.status === "done" || it.status === "error").length ?? 0;

  useEffect(() => {
    fetchSubsystems()
      .then(setSubsystems)
      .catch((err) => setLoadError(err.message));
  }, []);

  function handleSelect(key: SubsystemKey) {
    setSelected(key);
    setFiles([]);
    setItems(null);
  }

  function fireRca(i: number, subsystem: SubsystemKey, result: PredictResult) {
    setItems((prev) => prev?.map((it, idx) => (idx === i && it.status === "done" ? { ...it, rcaStatus: "pending" } : it)) ?? prev);
    fetchRca(subsystem, result)
      .then((rca) => {
        setItems((prev) => prev?.map((it, idx) => (idx === i && it.status === "done" ? { ...it, rca, rcaStatus: "done" } : it)) ?? prev);
      })
      .catch(() => {
        setItems((prev) => prev?.map((it, idx) => (idx === i && it.status === "done" ? { ...it, rcaStatus: "error" } : it)) ?? prev);
      });
  }

  async function handleAnalyze() {
    if (!selected || files.length === 0) return;
    setItems(files.map((file) => ({ file, status: "pending" })));
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setItems((prev) => prev?.map((it, idx) => (idx === i ? { file, status: "processing" } : it)) ?? prev);
      const result = await predictOne(selected, file);
      setItems((prev) => prev?.map((it, idx) => (idx === i ? result : it)) ?? prev);
      if (result.status === "done") fireRca(i, selected, result.result);
    }
  }

  function handleReset() {
    setFiles([]);
    setItems(null);
  }

  async function handleRetry() {
    if (!selected || !items) return;
    const failedIndices = items.reduce<number[]>((acc, it, i) => {
      if (it.status === "error") acc.push(i);
      return acc;
    }, []);
    if (failedIndices.length === 0) return;
    for (const i of failedIndices) {
      const file = items[i].file;
      setItems((prev) => prev?.map((it, idx) => (idx === i ? { file, status: "processing" } : it)) ?? prev);
      const result = await predictOne(selected, file);
      setItems((prev) => prev?.map((it, idx) => (idx === i ? result : it)) ?? prev);
      if (result.status === "done") fireRca(i, selected, result.result);
    }
  }

  const soleResult = items && items.length === 1 && items[0].status === "done" ? items[0].result : null;
  const hasError = items?.some((it) => it.status === "error") ?? false;

  return (
    <SidebarProvider>
      <SubsystemSidebar subsystems={subsystems} selected={selected} onSelect={handleSelect} />
      <SidebarInset className="relative">
        <div className="bg-grid-fade pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
        <header className="relative z-10 border-b border-border bg-card/60 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="md:hidden" />
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
                <TrainFront className="size-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <p className="eyebrow">Nebula X · Problem Statement 3</p>
                <h1 className="text-lg font-semibold tracking-tight">Fault Intelligence Console</h1>
              </div>
            </div>
            <StatusPill className="hidden sm:inline-flex" tone={loadError ? "bad" : subsystems ? "good" : "neutral"}>
              {!subsystems && !loadError && <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />}
              {loadError ? "Offline" : subsystems ? "Live" : "Connecting…"}
            </StatusPill>
          </div>
        </header>

        <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
          {loadError && (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t reach the prediction server</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          )}

          {!subsystems && !loadError && (
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          )}

          {subsystems && (
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <StatTile label="Subsystems Online" value={Object.keys(subsystems).length} tone="accent" />
              <StatTile label="Selected" value={selected ? selected.toUpperCase() : "—"} />
              <StatTile label="File Staged" value={fileStagedLabel(files)} />
              <StatTile
                label="Last Result"
                value={resultSummary.label}
                tone={items ? (resultSummary.bad ? "bad" : "accent") : "default"}
              />
            </div>
          )}

          {subsystems && selected && !items && (
            <UploadCard
              subsystem={selected}
              meta={subsystems[selected]}
              files={files}
              onFilesChange={setFiles}
              onAnalyze={handleAnalyze}
              isLoading={isAnalyzing}
            />
          )}

          {items && (
            <>
              {isAnalyzing && (
                <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
                    Analyzing {settledCount} of {items.length} file{items.length === 1 ? "" : "s"}…
                  </div>
                  <StatusBar value={(settledCount / items.length) * 100} tone="neutral" />
                </div>
              )}
              <BatchResults items={items} />
              {!isAnalyzing && (
                <div className="flex flex-wrap justify-center gap-2">
                  {selected && items.some((it) => it.status === "done") && (
                    <Button onClick={() => downloadPredictionsCsv(selected, items)}>
                      <Download aria-hidden="true" data-icon="inline-start" />
                      Download predictions.csv
                    </Button>
                  )}
                  {soleResult && (
                    <Button variant="outline" onClick={() => downloadResultCsv(soleResult)}>
                      <Download aria-hidden="true" data-icon="inline-start" />
                      Download CSV
                    </Button>
                  )}
                  {items.length > 1 && selected && (
                    <Button variant="outline" onClick={() => downloadBatchSummaryCsv(selected, items)}>
                      <Download aria-hidden="true" data-icon="inline-start" />
                      Download summary CSV
                    </Button>
                  )}
                  {hasError && (
                    <Button variant="outline" onClick={handleRetry}>
                      Try again
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleReset}>
                    Check another file
                  </Button>
                </div>
              )}
            </>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
