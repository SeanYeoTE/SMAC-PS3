"use client";

import { useEffect, useState } from "react";
import { TrainFront } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SubsystemPicker } from "@/components/subsystem-picker";
import { UploadCard } from "@/components/upload-card";
import { ResultView } from "@/components/results";
import { fetchSubsystems, predict } from "@/lib/api";
import type { PredictResult, SubsystemKey, SubsystemsResponse } from "@/lib/types";

export default function Home() {
  const [subsystems, setSubsystems] = useState<SubsystemsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SubsystemKey | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PredictResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

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
    setSelected(null);
    setFile(null);
    setResult(null);
    setAnalyzeError(null);
  }

  return (
    <div className="flex flex-1 flex-col bg-muted/20">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-6 sm:px-6">
          <TrainFront className="size-7 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Train Fault Prediction</h1>
            <p className="text-sm text-muted-foreground">
              Pick a system, upload its test file, get a plain-language diagnosis.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
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
          <SubsystemPicker subsystems={subsystems} selected={selected} onSelect={handleSelect} />
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
            <Button variant="outline" className="self-center" onClick={handleReset}>
              Check another file
            </Button>
          </>
        )}
      </main>
    </div>
  );
}
