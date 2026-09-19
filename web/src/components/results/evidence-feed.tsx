"use client";

import { useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { leftBarTone, type Tone } from "@/lib/status";
import type { LiveEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface FeedEntry {
  tone: Tone;
  title: string;
  body: string;
  meta?: string;
}

type Filter = "all" | "warn" | "bad";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "warn", label: "Warnings" },
  { key: "bad", label: "Failures" },
];

function eventTone(priority: string | null): Tone {
  if (priority === "high") return "bad";
  if (priority === "medium") return "warn";
  return "neutral";
}

export function evidenceToFeed(evidence: string[]): FeedEntry[] {
  return evidence.map((body) => ({ tone: "neutral", title: "Evidence", body }));
}

export function eventsToFeed(events: LiveEvent[]): FeedEntry[] {
  return events
    .filter((e) => e.kind === "alert")
    .map((e) => ({ tone: eventTone(e.priority), title: e.title, body: e.message, meta: e.time ?? undefined }));
}

export function EvidenceFeed({ entries }: { entries: FeedEntry[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const filtered = entries.filter((e) => filter === "all" || e.tone === filter);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="eyebrow tracking-[0.16em]">ANOMALY FEED</span>
        <div className="flex items-center gap-1">
          {FILTERS.map(({ key, label }) => (
            <Button key={key} size="sm" variant={filter === key ? "secondary" : "ghost"} onClick={() => setFilter(key)}>
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">Nothing to show.</p>}
        {filtered.map((e, i) => (
          <div key={i} className={cn("relative overflow-hidden rounded-lg border border-border bg-background p-3 pl-4", "before:absolute before:inset-y-0 before:left-0 before:w-1", leftBarTone[e.tone])}>
            <div className="flex items-start gap-2">
              {e.tone === "bad" ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{e.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{e.body}</p>
                {e.meta && <p className="mt-1 text-xs text-muted-foreground">{e.meta}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
