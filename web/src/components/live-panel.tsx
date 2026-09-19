"use client";

import { AlertTriangle, Loader2, Radio, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvidenceFeed, type FeedEntry } from "@/components/results/evidence-feed";
import type { Tone } from "@/lib/status";
import type {
  AcvLiveState,
  DoorLiveState,
  LiveEvent,
  LiveSessionState,
  RailLiveState,
  ShmLiveState,
  SubsystemKey,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_FEED = 100;
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

function eventTone(e: LiveEvent): Tone {
  if (e.kind !== "alert") return "neutral";
  return e.priority === "high" ? "bad" : "warn";
}

/** Every live event, newest first: alerts in amber/red, routine updates in grey. */
export function liveFeed(events: LiveEvent[]): FeedEntry[] {
  return events
    .slice(-MAX_FEED)
    .reverse()
    .map((e) => ({ tone: eventTone(e), title: e.title, body: e.message, meta: e.time ?? undefined }));
}

function figures(subsystem: SubsystemKey, s: LiveSessionState): [string, string | number][] {
  switch (subsystem) {
    case "door": {
      const d = s as unknown as DoorLiveState;
      return [["Cycles checked", d.cycles ?? 0], ["Abnormal cycles", d.abnormal_cycles ?? 0]];
    }
    case "shm": {
      const d = s as unknown as ShmLiveState;
      return [
        ["Segments complete", d.segments_complete ?? 0],
        ["Cumulative damage", (d.cumulative_damage ?? 0).toFixed(3)],
        ["Current segment", pct(d.current_segment_progress ?? 0)],
      ];
    }
    case "acv": {
      const d = s as unknown as AcvLiveState;
      const top = d.leading?.ranked_cars.split("|")[0];
      return [
        ["Hours of data", (d.hours ?? 0).toFixed(1)],
        ["Leading car", top && d.leading ? `${top} (${pct(d.leading.probability[top] ?? 0)})` : "—"],
        ["Alerted car", d.alerted_car ?? "—"],
      ];
    }
    case "rail": {
      const d = s as unknown as RailLiveState;
      return [
        ["Seconds classified", d.windows ?? 0],
        ["Normal", d.counts?.Normal ?? 0],
        ["Side I", d.counts?.["Side I"] ?? 0],
        ["Side II", d.counts?.["Side II"] ?? 0],
      ];
    }
  }
}

const FAILED = (status: string) =>
  status === "unavailable" || status === "connection lost" || status.startsWith("replay failed");

export function LivePanel({
  subsystem,
  status,
  error,
  state,
  events,
  onStop,
}: {
  subsystem: SubsystemKey;
  status: string;
  error: string | null;
  state: LiveSessionState | null;
  events: LiveEvent[];
  onStop: () => void;
}) {
  const running = status === "replaying" || status === "receiving";
  const uploading = status.startsWith("uploading");
  const failed = FAILED(status);
  const top = state?.most_urgent_alert ?? null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label="Live monitor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          {uploading ? (
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
          ) : (
            <Radio
              className={cn("size-4", failed ? "text-red-600" : running ? "animate-pulse text-emerald-600" : "text-muted-foreground")}
              aria-hidden="true"
            />
          )}
          <span className="eyebrow tracking-[0.16em]">LIVE MONITOR</span>
          <span className="text-muted-foreground">· {status}</span>
        </div>
        {(running || uploading) && (
          <Button size="sm" variant="outline" onClick={onStop} disabled={uploading}>
            <Square aria-hidden="true" data-icon="inline-start" />
            Stop
          </Button>
        )}
      </div>

      {failed && (
        <p className="text-sm text-red-700">
          {status === "connection lost"
            ? "Lost contact with the live session. If the backend runs on Cloud Run, it must run as a single instance with CPU always allocated."
            : "The live session could not run."}
          {error && <span className="block text-xs text-muted-foreground">{error}</span>}
        </p>
      )}

      {state && (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["Alerts", state.alerts] as [string, string | number], ...figures(subsystem, state)].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-background px-3 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {top && (
        <div className="flex items-start gap-2 rounded-lg border border-red-600/25 bg-red-600/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">Most urgent: {top.title}</p>
            {top.urgency?.summary && <p className="text-muted-foreground">{top.urgency.summary}</p>}
          </div>
        </div>
      )}

      <div className="max-h-[28rem] overflow-y-auto">
        <EvidenceFeed entries={liveFeed(events)} />
      </div>
    </section>
  );
}
