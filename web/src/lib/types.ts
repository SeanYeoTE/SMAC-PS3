export type SubsystemKey = "door" | "shm" | "acv" | "rail";

export interface SubsystemMeta {
  label: string;
  accepts: string[];
  returns: string;
  metric: string;
}

export type SubsystemsResponse = Record<SubsystemKey, SubsystemMeta>;

/** How far a measurement sits past its normal/limit reference, computed by ps3/urgency.py. */
export interface Urgency {
  basis: "normal" | "limit";
  measure: string;
  unit: string;
  reference: number | null;
  value: number | null;
  pct: number | null;
  threshold_pct: number;
  times_threshold: number | null;
  summary: string;
}

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
    evidence: string[];
    priority: "low" | "medium" | "high";
    priority_reason: string;
    urgency: Urgency | null;
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
    remaining_capacity: number;
    evidence: string[];
    priority: "low" | "medium" | "high";
    priority_reason: string;
    urgency: Urgency | null;
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
    probability: Record<string, number>;
    physics_top_car: string;
    physics_agrees: boolean;
    manual_control_fraction: Record<string, number>;
    evidence: string[];
    priority: "low" | "medium" | "high";
    priority_reason: string;
    urgency: Urgency | null;
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
    evidence: string[];
    priority: "low" | "medium" | "high";
    priority_reason: string;
    urgency: Urgency | null;
    note: string;
  };
}

export type PredictResult = DoorResult | ShmResult | AcvResult | RailResult;

/** Gemini-generated root cause analysis for a prediction result. */
export interface Rca {
  cause: string;
  action: string;
}

export type RcaStatus = "pending" | "done" | "error";

/** One file's outcome in a (possibly multi-file) analysis batch. */
export type BatchItem =
  | { file: File; status: "pending" }
  | { file: File; status: "processing" }
  | { file: File; status: "done"; result: PredictResult; rca?: Rca; rcaStatus?: RcaStatus }
  | { file: File; status: "error"; error: string };

export class ApiError extends Error {}

/** One entry from a live session's event log (ps3/live.py). */
export interface LiveEvent {
  seq: number;
  session: string;
  subsystem: SubsystemKey;
  kind: "update" | "alert";
  time: string | null;
  priority: string | null;
  title: string;
  message: string;
  urgency: Urgency | null;
  values: Record<string, unknown>;
}

export interface DoorLiveState {
  cycles: number;
  abnormal_cycles: number;
  calibrated: { Open: boolean; Close: boolean };
  cycle_in_progress: boolean;
  worst: { cycle: number; ratio: number; urgency: Urgency | null } | null;
}

export interface ShmLiveState {
  segments_complete: number;
  segment_damages: number[];
  current_segment_progress: number;
  cumulative_damage: number;
  urgency: Urgency | null;
}

export interface AcvLiveState {
  rows: number;
  hours: number;
  leading: { ranked_cars: string; probability: Record<string, number>; priority: string; urgency: Urgency | null; hours: number } | null;
  alerted_car: string | null;
}

export interface RailLiveState {
  windows: number;
  counts: { Normal: number; "Side I": number; "Side II": number };
  buffered_samples: number;
}

export type LiveMonitorState = DoorLiveState | ShmLiveState | AcvLiveState | RailLiveState;

/** Full session state returned by /api/live/sessions/{id} and /events. */
export interface LiveSessionState {
  session_id: string;
  subsystem: SubsystemKey;
  status: string;
  events: number;
  alerts: number;
  most_urgent_alert: LiveEvent | null;
  [key: string]: unknown;
}

export interface LiveSessionInfo {
  session_id: string;
  subsystem: SubsystemKey;
  chunk_format: string;
  default_replay_speed: number;
}
