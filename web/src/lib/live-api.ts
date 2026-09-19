import { ApiError, type LiveEvent, type LiveSessionInfo, type LiveSessionState, type SubsystemKey } from "@/lib/types";

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(payload?.detail ?? `The live service returned an error (${res.status}).`);
  }
  return res.json();
}

export async function startSession(subsystem: SubsystemKey): Promise<LiveSessionInfo> {
  const res = await fetch(`/api/live/${subsystem}/sessions`, { method: "POST" });
  return unwrap(res);
}

export async function replay(sessionId: string, files: File[], speed?: number): Promise<{ status: string; files: number; speed: number }> {
  const body = new FormData();
  for (const file of files) body.append("files", file);
  if (speed !== undefined) body.append("speed", String(speed));

  const res = await fetch(`/api/live/sessions/${sessionId}/replay`, { method: "POST", body });
  return unwrap(res);
}

export async function pollEvents(sessionId: string, after: number): Promise<{ events: LiveEvent[]; last_seq: number; state: LiveSessionState }> {
  const res = await fetch(`/api/live/sessions/${sessionId}/events?after=${after}`);
  return unwrap(res);
}

export async function stopSession(sessionId: string): Promise<LiveSessionState> {
  const res = await fetch(`/api/live/sessions/${sessionId}/stop`, { method: "POST" });
  return unwrap(res);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`/api/live/sessions/${sessionId}`, { method: "DELETE" }).catch(() => {});
}
