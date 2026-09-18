import { formatDoorTimestamp, formatNowTimestamp } from "@/lib/format";
import { summarizeResult } from "@/lib/summary";
import type { BatchItem, PredictResult, SubsystemKey } from "@/lib/types";

function escapeCsvField(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

/** Matches pandas.to_csv's line endings, since this is the file a grading script parses. */
function toCsvLF(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\n");
}

function doorCsv(result: Extract<PredictResult, { subsystem: "door" }>): string {
  const { segments, detail } = result;
  const rows: (string | number)[][] = [["Start", "End", "Operation", "Result", "Ratio", "Excess %"]];
  segments.forEach((s, i) => {
    const seg = detail.per_segment[i];
    rows.push([
      formatDoorTimestamp(s.start_time),
      formatDoorTimestamp(s.end_time),
      seg?.operation ?? "",
      s.prediction,
      seg ? seg.ratio.toFixed(3) : "",
      seg ? seg.excess_pct.toFixed(1) : "",
    ]);
  });
  rows.push(
    [],
    ["Summary"],
    ["Cycles checked", detail.n_segments],
    ["Abnormal cycles", detail.n_abnormal],
    ["Ratio threshold", detail.ratio_threshold],
  );
  return toCsv(rows);
}

function shmCsv(result: Extract<PredictResult, { subsystem: "shm" }>): string {
  const { prediction, detail } = result;
  const rows: (string | number)[][] = [
    ["Metric", "Value"],
    ["Fatigue life used (%)", (prediction * 100).toFixed(1)],
    ["Estimated remaining life (%)", ((1 - prediction) * 100).toFixed(1)],
    ["Samples", detail.samples],
    ["Rainflow cycles", detail.rainflow_cycles],
    ["Largest amplitude", detail.largest_amplitude],
    ["S-N exponent (m)", detail.sn_exponent_m],
    ["S-N constant (C)", detail.sn_constant_C],
    ["Miner's rule estimate", detail.miners_rule_estimate],
    ["Model vs formula (%)", detail.model_vs_formula_pct],
    [],
    ["Amplitude range", "Cycles", "Share of damage (%)"],
    ...detail.damage_by_amplitude_band.map((b) => [
      b.amplitude_range,
      b.cycles,
      (b.share_of_damage * 100).toFixed(1),
    ]),
  ];
  return toCsv(rows);
}

function acvCsv(result: Extract<PredictResult, { subsystem: "acv" }>): string {
  const { prediction, detail, ranked_cars } = result;
  const cars = ranked_cars.split("|");
  const rows: (string | number)[][] = [
    ["Rank", "Car", "Score (deg C)", "Time in manual control (%)"],
    ...cars.map((car, i) => [
      i + 1,
      car,
      detail.scores_degC[car] !== undefined ? detail.scores_degC[car].toFixed(3) : "",
      detail.manual_control_fraction[car] !== undefined
        ? (detail.manual_control_fraction[car] * 100).toFixed(1)
        : "",
    ]),
    [],
    ["Summary"],
    ["Most likely car", prediction],
    ["Confidence", detail.confidence],
    ["Margin over runner-up (deg C)", detail.margin_over_runner_up_degC.toFixed(3)],
  ];
  return toCsv(rows);
}

function railCsv(result: Extract<PredictResult, { subsystem: "rail" }>): string {
  const { prediction, detail } = result;
  const rows: (string | number)[][] = [
    ["Metric", "Value"],
    ["Prediction", prediction],
    ...Object.entries(detail.confidence).map(([label, prob]) => [
      `Confidence: ${label}`,
      `${(prob * 100).toFixed(1)}%`,
    ]),
    ["Speed (km/h)", detail.speed_kmh],
    ["Side I RMS", detail.side_I_rms],
    ["Side II RMS", detail.side_II_rms],
    ["Side I / Side II", detail.side_I_over_II],
    ["Stationary recording", detail.stationary ? "Yes" : "No"],
  ];
  return toCsv(rows);
}

export function resultToCsv(result: PredictResult): string {
  switch (result.subsystem) {
    case "door":
      return doorCsv(result);
    case "shm":
      return shmCsv(result);
    case "acv":
      return acvCsv(result);
    case "rail":
      return railCsv(result);
  }
}

function triggerCsvDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadResultCsv(result: PredictResult): void {
  triggerCsvDownload(resultToCsv(result), `${result.subsystem}-result-${formatNowTimestamp()}.csv`);
}

export function downloadBatchSummaryCsv(subsystem: string, items: BatchItem[]): void {
  const rows: (string | number)[][] = [["File", "Status", "Result", "Severity (%)", "Details"]];
  for (const item of items) {
    if (item.status === "error") {
      rows.push([item.file.name, "Error", "", "", item.error]);
      continue;
    }
    if (item.status !== "done") continue;
    const summary = summarizeResult(item.result);
    rows.push([item.file.name, "Done", summary.label, summary.severityPct.toFixed(0), summary.severityLabel]);
  }
  triggerCsvDownload(toCsv(rows), `${subsystem}-batch-summary-${formatNowTimestamp()}.csv`);
}

/**
 * The official scoring format for each subsystem (matches submission/*_predictions.csv):
 * door has no file_id (per-segment rows from one continuous stream); rail/shm/acv are
 * one row per uploaded file, keyed by file_id.
 */
export function predictionsCsv(subsystem: SubsystemKey, items: BatchItem[]): string {
  const done = items.filter((it): it is Extract<BatchItem, { status: "done" }> => it.status === "done");
  if (subsystem === "door") {
    const rows: (string | number)[][] = [["start_time", "end_time", "prediction"]];
    for (const item of done) {
      const result = item.result as Extract<PredictResult, { subsystem: "door" }>;
      for (const seg of result.segments) rows.push([seg.start_time, seg.end_time, seg.prediction]);
    }
    return toCsvLF(rows);
  }
  if (subsystem === "rail") {
    const rows: (string | number)[][] = [["file_id", "prediction"]];
    for (const item of done) {
      rows.push([item.file.name, (item.result as Extract<PredictResult, { subsystem: "rail" }>).prediction]);
    }
    return toCsvLF(rows);
  }
  if (subsystem === "shm") {
    const rows: (string | number)[][] = [["file_id", "prediction"]];
    for (const item of done) {
      rows.push([item.file.name, (item.result as Extract<PredictResult, { subsystem: "shm" }>).prediction]);
    }
    return toCsvLF(rows);
  }
  const rows: (string | number)[][] = [["file_id", "ranked_cars"]];
  for (const item of done) {
    rows.push([item.file.name, (item.result as Extract<PredictResult, { subsystem: "acv" }>).ranked_cars]);
  }
  return toCsvLF(rows);
}

export function downloadPredictionsCsv(subsystem: SubsystemKey, items: BatchItem[]): void {
  triggerCsvDownload(predictionsCsv(subsystem, items), `${subsystem}_predictions.csv`);
}
