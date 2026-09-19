"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteSession, pollEvents, replay, startSession, stopSession } from "@/lib/live-api";
import type { LiveEvent, LiveSessionState, SubsystemKey } from "@/lib/types";

const POLL_MS = 500;
const DONE_STATUSES = ["stopped", "replay finished"];
const MAX_POLL_FAILURES = 5;
const EVENTS_PER_POLL = 500; // the backend's default page size for /events

export interface LiveSnapshot {
  seq: number;
  time: string | null;
  state: LiveSessionState;
}

export function useLiveSession(subsystem: SubsystemKey | null) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [snapshots, setSnapshots] = useState<LiveSnapshot[]>([]);
  const [state, setState] = useState<LiveSessionState | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lastSeqRef = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);
  const failures = useRef(0);
  const runId = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const tick = useCallback(() => {
    const sessionId = sessionIdRef.current;
    // one request at a time: overlapping polls would return the same events twice
    if (!sessionId || inFlight.current) return;
    inFlight.current = true;
    pollEvents(sessionId, lastSeqRef.current)
      .then(({ events: newEvents, last_seq, state }) => {
        if (sessionIdRef.current !== sessionId) return;
        failures.current = 0;
        lastSeqRef.current = last_seq;
        if (newEvents.length > 0) setEvents((prev) => [...prev, ...newEvents]);
        setSnapshots((prev) => [...prev, { seq: last_seq, time: newEvents.at(-1)?.time ?? null, state }]);
        setState(state);
        setStatus(state.status);
        const done = DONE_STATUSES.includes(state.status) || state.status.startsWith("replay failed");
        if (done && newEvents.length < EVENTS_PER_POLL) stopPolling(); // else more are waiting
      })
      .catch((err: unknown) => {
        if (sessionIdRef.current !== sessionId) return;
        failures.current += 1;
        if (failures.current >= MAX_POLL_FAILURES) {
          stopPolling();
          setStatus("connection lost");
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [stopPolling]);

  const poll = useCallback(() => {
    stopPolling();
    failures.current = 0;
    pollTimer.current = setInterval(tick, POLL_MS);
  }, [stopPolling, tick]);

  const reset = useCallback(() => {
    runId.current += 1;
    stopPolling();
    if (sessionIdRef.current) deleteSession(sessionIdRef.current);
    sessionIdRef.current = null;
    lastSeqRef.current = 0;
    setEvents([]);
    setSnapshots([]);
    setState(null);
    setError(null);
    setStatus("idle");
  }, [stopPolling]);

  const start = useCallback(
    async (files: File[]) => {
      if (!subsystem || files.length === 0) return;
      reset();
      const run = runId.current;
      try {
        const info = await startSession(subsystem);
        if (run !== runId.current) return deleteSession(info.session_id);
        sessionIdRef.current = info.session_id;
        setStatus(`uploading 0 of ${files.length}`);
        await replay(info.session_id, files, info.default_replay_speed, (done, total) => {
          if (run === runId.current) setStatus(`uploading ${done} of ${total}`);
        });
        if (run !== runId.current) return;
        setStatus("replaying");
        poll();
      } catch (err) {
        if (run !== runId.current) return;
        setStatus("unavailable");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [subsystem, reset, poll],
  );

  const stop = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    try {
      const st = await stopSession(sessionId);
      if (sessionIdRef.current !== sessionId) return;
      tick(); // pick up the final events; polling ends on "stopped"
      setState(st);
      setStatus(st.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [tick]);

  useEffect(() => () => reset(), [reset]);

  return { status, error, state, events, snapshots, start, stop, reset };
}
