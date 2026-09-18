import type { PredictResult } from "@/lib/types";

/** Model-grounded hypotheses, using only evidence returned for this recording. */
export function generateRca(result: PredictResult): { cause: string; action: string } {
  switch (result.subsystem) {
    case "door": {
      const d = result.detail;
      if (!d.n_segments) return {
        cause: "No door cycles were detected, so resistance cannot be assessed.",
        action: "Check the recording and timestamps, then upload a complete open/close stream.",
      };
      if (!d.n_abnormal) return {
        cause: `No abnormal resistance was detected across ${d.n_segments} cycles. This does not rule out faults outside this recording.`,
        action: "Continue routine door inspection and monitoring; investigate any reported sticking or intermittent faults.",
      };
      const peak = Math.max(...d.per_segment.filter((s) => s.abnormal).map((s) => s.ratio));
      const unreliable = ["Open", "Close"].some((op) => {
        const cycles = d.per_segment.filter((s) => s.operation === op);
        return cycles.length > 0 && cycles.filter((s) => s.abnormal).length / cycles.length > 0.5;
      });
      return {
        cause: `${d.n_abnormal} of ${d.n_segments} cycles exceed the ${d.ratio_threshold}× operation-specific current baseline threshold (highest flagged ratio: ${peak.toFixed(3)}×). Increased mechanical resistance is suspected: possible causes include debris in slide rails, rubber-strip jamming or door-leaf deformation. Current alone cannot identify the exact cause.${unreliable ? " More than half the cycles for an operation are abnormal, so the baseline needs manual validation." : ""}`,
        action: "Have maintenance inspect the flagged cycles and door travel, check slide rails for debris, seals for jamming and leaf alignment for deformation. Correct the confirmed obstruction or damaged component under the approved maintenance procedure, then repeat open/close tests and compare current with a verified healthy baseline.",
      };
    }
    case "acv": {
      const d = result.detail;
      const score = d.scores_degC[result.prediction];
      const missing = result.ranked_cars.split("|").filter((car) => !Number.isFinite(d.scores_degC[car]));
      return {
        cause: `Car ${result.prediction} ranks highest for suspected refrigerant leakage, with ${d.confidence} confidence and a ${d.margin_over_runner_up_degC.toFixed(3)} °C margin over the runner-up${Number.isFinite(score) ? ` (cabin temperature ${score.toFixed(3)} °C relative to the train median)` : ""}. Reduced cooling is consistent with refrigerant loss, but setpoints, operating mode, airflow and sensor errors can also affect temperature; the ranking is not proof of a leak.${missing.length ? ` Cabin temperature evidence is unavailable for cars ${missing.join(", ")}; their ranking is less reliable.` : ""}`,
        action: `${d.confidence === "low" || missing.length ? "Validate temperature sensors, setpoints and cooling-mode data and compare the leading cars before selecting a repair. " : ""}Have an ACV technician inspect Car ${result.prediction}, check airflow and controls, and perform approved refrigerant pressure and leak checks. If leakage is confirmed, repair the leak and restore the specified charge, then verify cooling performance against the other cars.`,
      };
    }
    case "rail": {
      const d = result.detail;
      if (d.stationary) return {
        cause: `The recording is stationary or near-stationary (${d.speed_kmh} km/h). There is insufficient motion to reliably assess corrugation, regardless of the predicted ${result.prediction} label.`,
        action: "Collect a new vibration/shock recording while the train is moving under an approved test procedure, then reassess. Inspect the track if operational reports indicate a defect.",
      };
      const confidence = d.confidence[result.prediction] ?? 0;
      return {
        cause: result.prediction === "Normal"
          ? `The model detects no corrugation signature (${(confidence * 100).toFixed(1)}% model confidence). A normal label does not exclude defects outside this sample or other sources of vibration.`
          : `The vibration/shock pattern is consistent with corrugation on ${result.prediction} (${(confidence * 100).toFixed(1)}% model confidence) at ${d.speed_kmh} km/h. Side I/Side II vibration RMS is ${d.side_I_rms.toFixed(5)}/${d.side_II_rms.toFixed(5)}. Periodic rail-surface wear is suspected; this recording cannot establish the formation mechanism or exact track location.`,
        action: `${confidence < 0.7 ? "Confidence is low: validate the sensor recording and repeat the assessment before choosing a repair. " : ""}${result.prediction === "Normal" ? "Continue routine monitoring and investigate persistent vibration or noise reports with a track inspection." : `Correlate the recording with route/location records and inspect the ${result.prediction} rail for periodic wear. If confirmed, have the track team determine whether approved grinding, milling or rail replacement is appropriate, inspect fasteners and track support, and verify the result with a repeat survey.`}`,
      };
    }
    case "shm": {
      const d = result.detail;
      const band = [...d.damage_by_amplitude_band].sort((a, b) => b.share_of_damage - a.share_of_damage)[0];
      return {
        cause: `Predicted cumulative fatigue damage is ${result.prediction.toFixed(4)}; the Miner's-rule cross-check is ${d.miners_rule_estimate.toFixed(4)}.${band ? ` The ${band.amplitude_range} stress-amplitude band contributes ${(band.share_of_damage * 100).toFixed(1)}% of the calculated damage.` : ""} Repeated stress cycles drive fatigue accumulation. This estimate does not confirm a crack, identify its location or establish remaining service time.${result.prediction >= 1 ? " The estimate reaches or exceeds the D = 1 fatigue criterion described in the requirements." : ""}`,
        action: `${result.prediction >= 1 ? "Escalate promptly to the responsible structural engineer for fitness-for-service assessment under the operator's procedures. " : ""}Validate stress-sensor calibration, load history and the model/formula comparison. Have a structural engineer assess fatigue-critical areas and select appropriate inspection, including non-destructive testing where required. Address confirmed load or structural issues and repair or replace affected components only after engineering assessment; continue tracking damage with subsequent recordings.`,
      };
    }
  }
}
