import type { Tone } from "@/lib/status";
import type { BatchItem, PredictResult } from "@/lib/types";

export interface ResultSummary {
  /** Short one-line status, e.g. "8/38 abnormal". */
  label: string;
  /** Whether this result looks like something worth attention. Always tone !== "good". */
  bad: boolean;
  tone: Tone;
  /** 0-100: how concerning this result is, for ranking/comparing files. Higher = worse. */
  severityPct: number;
  /** What severityPct measures, e.g. "% cycles abnormal". */
  severityLabel: string;
  /** SHM only: estimated remaining fatigue life. */
  remainingLifePct?: number;
}

function summarize(fields: Omit<ResultSummary, "bad">): ResultSummary {
  return { ...fields, bad: fields.tone !== "good" };
}

export function summarizeResult(result: PredictResult): ResultSummary {
  switch (result.subsystem) {
    case "door": {
      const pct = result.detail.n_segments > 0 ? (result.detail.n_abnormal / result.detail.n_segments) * 100 : 0;
      return summarize({
        label: `${result.detail.n_abnormal}/${result.detail.n_segments} abnormal`,
        tone: result.detail.n_abnormal > 0 ? "bad" : "good",
        severityPct: pct,
        severityLabel: "% of cycles abnormal",
      });
    }
    case "shm": {
      const pct = result.prediction * 100;
      return summarize({
        label: `${pct.toFixed(0)}% life used`,
        tone: result.prediction >= 0.8 ? "bad" : result.prediction >= 0.5 ? "warn" : "good",
        severityPct: pct,
        severityLabel: "% of fatigue life used",
        remainingLifePct: 100 - pct,
      });
    }
    case "acv": {
      const confidencePct = { high: 100, medium: 60, low: 30 }[result.detail.confidence];
      return summarize({
        label: `Car ${result.prediction}`,
        // Every file always names a "most likely" car, so this is never fully "good" —
        // only how seriously to take the call varies with confidence.
        tone: result.detail.confidence === "low" ? "neutral" : result.detail.confidence === "medium" ? "warn" : "bad",
        severityPct: confidencePct,
        severityLabel: "% confidence in the leak call",
      });
    }
    case "rail": {
      const topConfidence = result.detail.confidence[result.prediction] ?? 0;
      const isNormal = result.prediction === "Normal";
      // A stationary recording's "Normal" call can't be trusted, so treat it as
      // uncertain even when the model reports high confidence.
      const uncertain = result.detail.stationary || topConfidence < 0.7;
      return summarize({
        label: result.prediction,
        tone: !isNormal ? "bad" : uncertain ? "warn" : "good",
        severityPct: isNormal
          ? Math.max((1 - topConfidence) * 100, result.detail.stationary ? 50 : 0)
          : topConfidence * 100,
        severityLabel: isNormal ? "% chance this is actually a problem" : "% confidence in this fault",
      });
    }
  }
}

/** Count of batch items that need attention: errors, plus any "done" result that isn't clean. */
export function countFlagged(items: BatchItem[]): number {
  return items.filter(
    (it) => it.status === "error" || (it.status === "done" && summarizeResult(it.result).bad),
  ).length;
}
