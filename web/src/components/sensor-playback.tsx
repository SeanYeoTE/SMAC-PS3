"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Loader2, Pause, Play, RotateCcw, UploadCloud } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/status-pill";
import { simulateRecording } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SimulationResult, SubsystemKey, SubsystemMeta } from "@/lib/types";

function displayValue(value: string | number): string {
  if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  return value;
}

export function SensorPlayback({ subsystem, meta }: { subsystem: SubsystemKey; meta: SubsystemMeta }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playing || !simulation) return;
    const timer = window.setInterval(() => {
      setCursor((current) => {
        if (current >= simulation.points.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 650);
    return () => window.clearInterval(timer);
  }, [playing, simulation]);

  function chooseFile(candidate: File | undefined) {
    if (!candidate) return;
    const ext = `.${candidate.name.split(".").pop()?.toLowerCase()}`;
    const accepted = [...new Set([...meta.accepts, ".xlsx", ".xls"])];
    if (!accepted.includes(ext)) {
      setError(`Choose a ${accepted.join(" or ")} recording.`);
      return;
    }
    setFile(candidate);
    setSimulation(null);
    setCursor(0);
    setPlaying(false);
    setError(null);
  }

  async function createSimulation() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result = await simulateRecording(subsystem, file);
      setSimulation(result);
      setCursor(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the sensor playback.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFile(null);
    setSimulation(null);
    setCursor(0);
    setPlaying(false);
    setError(null);
  }

  if (!simulation) {
    const formats = [...new Set([...meta.accepts, ".xlsx", ".xls"])];
    return (
      <Card>
        <CardHeader>
          <CardTitle className="eyebrow">Sensor playback · {meta.label}</CardTitle>
          <CardDescription>
            Upload a recorded sensor file or Excel workbook. The app will replay it as a timeline without changing the original analysis workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <button
            type="button"
            className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 p-10 text-center transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => inputRef.current?.click()}
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-muted">
              {file ? <FileSpreadsheet className="size-6 text-emerald-600" /> : <UploadCloud className="size-6 text-muted-foreground" />}
            </span>
            <span className="font-medium">{file ? file.name : "Choose a recorded sensor file"}</span>
            <span className="text-sm text-muted-foreground">Accepted formats: {formats.join(", ")}</span>
          </button>
          <input
            ref={inputRef}
            id={inputId}
            className="sr-only"
            type="file"
            accept={formats.join(",")}
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <Button size="lg" disabled={!file || loading} onClick={createSimulation}>
            {loading && <Loader2 className="animate-spin" />}
            {loading ? "Building timeline…" : "Build sensor timeline"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const point = simulation.points[cursor];
  const alerts = point.events.filter((event) => event.kind === "alert");
  const updates = point.events.filter((event) => event.kind === "update");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Recorded sensor playback</CardTitle>
              <CardDescription>{file?.name} · {simulation.points.length} timeline points</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill tone={alerts.length ? "bad" : "good"}>{alerts.length ? "Potential fault" : "Monitoring"}</StatusPill>
              <Button variant="ghost" size="sm" onClick={reset}><RotateCcw />New file</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="outline"
              aria-label={playing ? "Pause playback" : "Play recording"}
              onClick={() => {
                if (cursor === simulation.points.length - 1) setCursor(0);
                setPlaying((value) => !value);
              }}
            >
              {playing ? <Pause /> : <Play />}
            </Button>
            <div className="min-w-0 flex-1">
              <div className="relative pt-3">
                {simulation.points.map((candidate, index) =>
                  candidate.events.some((event) => event.kind === "alert") ? (
                    <span
                      key={index}
                      className="pointer-events-none absolute top-0 size-2 -translate-x-1/2 rounded-full bg-destructive"
                      style={{ left: `${candidate.progress * 100}%` }}
                      title={`Potential fault at ${candidate.label}`}
                    />
                  ) : null,
                )}
                <input
                  aria-label="Sensor playback timeline"
                  className="w-full cursor-grab accent-primary active:cursor-grabbing"
                  type="range"
                  min={0}
                  max={1000}
                  value={Math.round(point.progress * 1000)}
                  onChange={(event) => {
                    setPlaying(false);
                    const target = Number(event.target.value) / 1000;
                    let closest = 0;
                    for (let index = 1; index < simulation.points.length; index++) {
                      if (Math.abs(simulation.points[index].progress - target) < Math.abs(simulation.points[closest].progress - target)) {
                        closest = index;
                      }
                    }
                    setCursor(closest);
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Start</span><span>{Math.round(point.progress * 100)}% · {point.label}</span><span>End</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(point.readings).map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 font-semibold tabular-nums">{displayValue(value)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {alerts.map((event, index) => (
        <Alert key={`${event.title}-${index}`} variant="destructive">
          <AlertTriangle />
          <AlertTitle>{event.title}</AlertTitle>
          <AlertDescription>{event.message}</AlertDescription>
        </Alert>
      ))}

      {alerts.length === 0 && (
        <Card size="sm">
          <CardContent className="flex items-start gap-3 p-4">
            <span className={cn("mt-1 size-2 shrink-0 rounded-full", updates.length ? "bg-emerald-500" : "bg-muted-foreground")} />
            <div>
              <p className="font-medium">No new fault detected at this point</p>
              <p className="text-sm text-muted-foreground">
                {updates[0]?.title ?? "The monitor is collecting enough data to assess this subsystem."}
                {updates[0]?.message ? ` — ${updates[0].message}` : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
