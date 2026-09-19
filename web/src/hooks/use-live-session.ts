"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteSession, pollEvents, replay, startSession } from "@/lib/live-api";
import type { LiveEvent, LiveSessionState, SubsystemKey } from "@/lib/types";

const POLL_MS = 500;
const DONE_STATUSES = ["stopped", "replay finished"];

export interface LiveSnapshot {
  seq: number;
  time: string | null;
  state: LiveSessionState;
}

export function useLiveSession(subsystem: SubsystemKey | null) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [snapshots, setSnapshots] = useState<LiveSnapshot[]>([]);
  const [status, setStatus] = useState<string>("idle");
  const sessionIdRef = useRef<string | null>(null);
  const lastSeqRef = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const tick = useCallback(() => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    pollEvents(sessionId, lastSeqRef.current)
      .then(({ events: newEvents, last_seq, state }) => {
        lastSeqRef.current = last_seq;
        if (newEvents.length > 0) setEvents((prev) => [...prev, ...newEvents]);
        setSnapshots((prev) => [...prev, { seq: last_seq, time: newEvents.at(-1)?.time ?? null, state }]);
        setStatus(state.status);
        if (DONE_STATUSES.includes(state.status) || state.status.startsWith("replay failed")) stopPolling();
      })
      .catch(() => stopPolling());
  }, [stopPolling]);

  const poll = useCallback(() => {
    stopPolling();
    pollTimer.current = setInterval(tick, POLL_MS);
  }, [stopPolling, tick]);

  const reset = useCallback(() => {
    stopPolling();
    if (sessionIdRef.current) deleteSession(sessionIdRef.current);
    sessionIdRef.current = null;
    lastSeqRef.current = 0;
    setEvents([]);
    setSnapshots([]);
    setStatus("idle");
  }, [stopPolling]);

  const start = useCallback(
    async (files: File[]) => {
      if (!subsystem || files.length === 0) return;
      reset();
      try {
        const info = await startSession(subsystem);
        sessionIdRef.current = info.session_id;
        setStatus("replaying");
        await replay(info.session_id, files, info.default_replay_speed);
        poll();
      } catch {
        setStatus("unavailable");
      }
    },
    [subsystem, reset, poll],
  );

  useEffect(() => () => reset(), [reset]);

  return { status, events, snapshots, start, reset };
}
