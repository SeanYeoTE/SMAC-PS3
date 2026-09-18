export type SubsystemKey = "door" | "shm" | "acv" | "rail";

export interface SubsystemMeta {
  label: string;
  accepts: string[];
  returns: string;
  metric: string;
}

export type SubsystemsResponse = Record<SubsystemKey, SubsystemMeta>;

export interface DoorSegment {
  start_time: string;
  end_time: string;
  prediction: "Normal" | "Abnormal resistance";
}

export interface DoorPerSegment {
  operation: "Open" | "Close";
  rows: number;
  cur_mean: number;
  baseline: number;
  ratio: number;
  excess_pct: number;
  abnormal: boolean;
}

export interface DoorResult {
  subsystem: "door";
  segments: DoorSegment[];
  detail: {
    n_segments: number;
    n_abnormal: number;
    baselines_mA: Record<string, number>;
    ratio_threshold: number;
    per_segment: DoorPerSegment[];
    note: string;
  };
}

export interface ShmResult {
  subsystem: "shm";
  prediction: number;
  detail: {
    miners_rule_estimate: number;
    model_vs_formula_pct: number;
    samples: number;
    rainflow_cycles: number;
    largest_amplitude: number;
    sn_exponent_m: number;
    sn_constant_C: number;
    damage_by_amplitude_band: {
      amplitude_range: string;
      cycles: number;
      share_of_damage: number;
    }[];
    note: string;
  };
}

export interface AcvResult {
  subsystem: "acv";
  ranked_cars: string;
  prediction: string;
  detail: {
    scores_degC: Record<string, number>;
    margin_over_runner_up_degC: number;
    confidence: "high" | "medium" | "low";
    manual_control_fraction: Record<string, number>;
    note: string;
  };
}

export interface RailResult {
  subsystem: "rail";
  prediction: "Normal" | "Side I" | "Side II";
  detail: {
    confidence: Record<string, number>;
    speed_kmh: number;
    side_I_rms: number;
    side_II_rms: number;
    side_I_over_II: number;
    stationary: boolean;
    note: string;
  };
}

export type PredictResult = DoorResult | ShmResult | AcvResult | RailResult;

/** One file's outcome in a (possibly multi-file) analysis batch. */
export type BatchItem =
  | { file: File; status: "done"; result: PredictResult }
  | { file: File; status: "error"; error: string };

export class ApiError extends Error {}
