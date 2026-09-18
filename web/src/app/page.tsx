"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Fingerprint, TrainFront } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/stat-tile";
import { StatusPill } from "@/components/status-pill";
import { SubsystemPicker } from "@/components/subsystem-picker";
import { UploadCard } from "@/components/upload-card";
import { BatchResults } from "@/components/batch-results";
import { fetchSubsystems, predict } from "@/lib/api";
import { downloadBatchSummaryCsv, downloadResultCsv } from "@/lib/csv";
import { runWithConcurrency } from "@/lib/pool";
import { countFlagged, summarizeResult } from "@/lib/summary";
import type { BatchItem, SubsystemKey, SubsystemsResponse } from "@/lib/types";

// The backend runs on a single-vCPU instance; keep batch uploads from firing
// dozens of large files at once and piling up memory/CPU on one request.
const UPLOAD_CONCURRENCY = 3;

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
  if (items.length === 1) {
    const item = items[0];
    return item.status === "error" ? { label: "Error", bad: true } : summarizeResult(item.result);
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const resultSummary = useMemo(() => lastResultSummary(items), [items]);

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

  async function handleAnalyze() {
    if (!selected || files.length === 0) return;
    setIsAnalyzing(true);
    const settled = await runWithConcurrency(files, UPLOAD_CONCURRENCY, (file) => predictOne(selected, file));
    setItems(settled);
    setIsAnalyzing(false);
  }

  function handleReset() {
    setFiles([]);
    setItems(null);
  }

  async function handleRetry() {
    if (!selected || !items) return;
    const failed = items.filter((it) => it.status === "error");
    if (failed.length === 0) return;
    setIsAnalyzing(true);
    const retried = await runWithConcurrency(failed, UPLOAD_CONCURRENCY, (it) => predictOne(selected, it.file));
    let next = 0;
    setItems(items.map((it) => (it.status === "error" ? retried[next++] : it)));
    setIsAnalyzing(false);
  }

  const soleResult = items && items.length === 1 && items[0].status === "done" ? items[0].result : null;
  const hasError = items?.some((it) => it.status === "error") ?? false;

  return (
    <div className="relative flex flex-1 flex-col bg-background">
      <div className="bg-grid-fade pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
      <header className="relative z-10 border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
              <TrainFront className="size-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="eyebrow">Nebula X · Problem Statement 3</p>
              <h1 className="text-lg font-semibold tracking-tight">Fault Intelligence Console</h1>
            </div>
          </div>
          <StatusPill tone={loadError ? "bad" : subsystems ? "good" : "neutral"}>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        )}

        {subsystems && (
          <>
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

            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Fingerprint className="size-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="eyebrow">Choose a subsystem</h2>
              </div>
              <SubsystemPicker subsystems={subsystems} selected={selected} onSelect={handleSelect} />
            </section>
          </>
        )}

        {subsystems && selected && !items && (
          <UploadCard
            meta={subsystems[selected]}
            files={files}
            onFilesChange={setFiles}
            onAnalyze={handleAnalyze}
            isLoading={isAnalyzing}
          />
        )}

        {items && (
          <>
            <BatchResults items={items} />
            <div className="flex flex-wrap justify-center gap-2">
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
                <Button variant="outline" disabled={isAnalyzing} onClick={handleRetry}>
                  {isAnalyzing ? "Retrying…" : "Try again"}
                </Button>
              )}
              <Button variant="outline" onClick={handleReset}>
                Check another file
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
