import { ApiError, type PredictResult, type SubsystemKey, type SubsystemsResponse } from "@/lib/types";

export async function fetchSubsystems(): Promise<SubsystemsResponse> {
  const res = await fetch("/api/subsystems");
  if (!res.ok) throw new ApiError("Couldn't load the subsystem list from the server.");
  return res.json();
}

export async function predict(subsystem: SubsystemKey, file: File): Promise<PredictResult> {
  const body = new FormData();
  body.append("file", file);

  const res = await fetch(`/api/predict/${subsystem}`, { method: "POST", body });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(payload?.detail ?? `The server returned an error (${res.status}).`);
  }
  return res.json();
}
