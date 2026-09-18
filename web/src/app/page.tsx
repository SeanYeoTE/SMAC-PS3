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
import { ResultView } from "@/components/results";
import { fetchSubsystems, predict } from "@/lib/api";
import { downloadResultCsv } from "@/lib/csv";
import type { PredictResult, SubsystemKey, SubsystemsResponse } from "@/lib/types";

function summarizeResult(result: PredictResult | null): { label: string; bad: boolean } {
  if (!result) return { label: "—", bad: false };
  switch (result.subsystem) {
    case "door":
      return {
        label: `${result.detail.n_abnormal}/${result.detail.n_segments} abnormal`,
        bad: result.detail.n_abnormal > 0,
      };
    case "shm":
      return {
        label: `${(result.prediction * 100).toFixed(0)}% life used`,
        bad: result.prediction >= 0.8,
      };
    case "acv":
      return { label: `Car ${result.prediction}`, bad: true };
    case "rail":
      return { label: result.prediction, bad: result.prediction !== "Normal" };
  }
}

export default function Home() {
  const [subsystems, setSubsystems] = useState<SubsystemsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SubsystemKey | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PredictResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const resultSummary = useMemo(() => summarizeResult(result), [result]);

  useEffect(() => {
    fetchSubsystems()
      .then(setSubsystems)
      .catch((err) => setLoadError(err.message));
  }, []);

  function handleSelect(key: SubsystemKey) {
    setSelected(key);
    setFile(null);
    setResult(null);
    setAnalyzeError(null);
  }

  async function handleAnalyze() {
    if (!selected || !file) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setResult(null);
    try {
      const data = await predict(selected, file);
      setResult(data);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleReset() {
    setFile(null);
    setResult(null);
    setAnalyzeError(null);
  }

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
              <StatTile label="File Staged" value={file ? "Ready" : "—"} />
              <StatTile
                label="Last Result"
                value={resultSummary.label}
                tone={result ? (resultSummary.bad ? "bad" : "accent") : "default"}
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

        {subsystems && selected && !result && (
          <UploadCard
            meta={subsystems[selected]}
            file={file}
            onFileSelected={setFile}
            onAnalyze={handleAnalyze}
            isLoading={isAnalyzing}
          />
        )}

        {analyzeError && (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t analyze this file</AlertTitle>
            <AlertDescription>{analyzeError}</AlertDescription>
          </Alert>
        )}

        {result && (
          <>
            <ResultView result={result} />
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => downloadResultCsv(result)}>
                <Download aria-hidden="true" data-icon="inline-start" />
                Download CSV
              </Button>
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
