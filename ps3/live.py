"""Live monitoring: run the PS3 models on sensor data as it arrives.

A sensor gateway sends chunks of rows to a session; the replay below plays a
recorded file into a session the same way, as if it were live. Each session
keeps only the state its model needs, uses only the data received so far, and
logs events for the app to show:

    s = live.create_session("door")
    s.ingest(chunk)                 # rows in the dataset's own columns
    s.events_after(seq)             # what the app polls for
    live.replay(s, [path], speed=20)

Chunk formats (the same columns as the organisers' files):
    door  CSV with the Door columns (Datetime, Motor current(mA), ..., Door is closing, ...)
    acv   CSV with the ACV columns (car model, train number, time, Car NN - <parameter> ...)
    rail  CSV with the 129 Rail columns (speed pulse + vibration/shock per axle box)
    shm   stress samples, one number per line (no header)

Each event: {seq, session, subsystem, kind ("update" | "alert"), time, priority,
title, message, urgency, values}.
"""
import io
import itertools
import json
import os
import threading
import uuid
from collections import deque

import numpy as np
import pandas as pd

from . import acv, door, rail, shm


def _event(kind: str, title: str, message: str = "", time=None, priority=None,
           urgency=None, **values) -> dict:
    return {"kind": kind, "time": time, "priority": priority, "title": title,
            "message": message, "urgency": urgency, "values": values}


# ---------------------------------------------------------------- monitors
class DoorMonitor:
    """A cycle ends when the next sample arrives more than 1 s later (or the
    stream stops). Each cycle is compared with this door's normal current for
    the same operation: the 40th percentile of its last 50 cycles."""
    subsystem = "door"
    WARMUP = 5
    HISTORY = 50

    def __init__(self):
        self.rows, self.last_ts = [], None
        self.history = {"Open": deque(maxlen=self.HISTORY), "Close": deque(maxlen=self.HISTORY)}
        self.cycles, self.n_abnormal, self.worst = [], 0, None

    def feed(self, df: pd.DataFrame) -> list:
        events = []
        ts = df["Datetime"].map(door.parse_time)
        cur = pd.to_numeric(df[door.CURRENT], errors="coerce").to_numpy(float)
        closing = pd.to_numeric(df[door.CLOSING], errors="coerce").fillna(0).to_numpy()
        for t, c, k in zip(ts, cur, closing):
            if self.last_ts is not None and (t - self.last_ts).total_seconds() > door.GAP_SECONDS:
                events += self._close_cycle()
            self.rows.append((t, c, k))
            self.last_ts = t
        return events

    def finish(self) -> list:
        return self._close_cycle()

    def _close_cycle(self) -> list:
        if not self.rows:
            return []
        rows, self.rows = self.rows, []
        op = "Close" if max(r[2] for r in rows) >= 1 else "Open"
        cur_mean = float(np.nanmean([r[1] for r in rows]))
        start, end = door.format_time(rows[0][0]), door.format_time(rows[-1][0])
        n = len(self.cycles) + 1
        hist = self.history[op]
        base = dict(time=end, operation=op, start_time=start, end_time=end, cur_mean=round(cur_mean, 1))
        if len(hist) < self.WARMUP:
            hist.append(cur_mean)
            self.cycles.append({"start_time": start, "end_time": end, "prediction": "Normal", "calibrating": True})
            return [_event("update", f"{op} cycle {n}: calibrating",
                           f"Learning this door's normal {op.lower()} current "
                           f"({len(hist)} of {self.WARMUP} cycles).", priority="low", **base)]
        baseline = float(np.quantile(list(hist) + [cur_mean], door.BASELINE_Q))
        ratio = cur_mean / baseline
        hist.append(cur_mean)
        abnormal = ratio >= door.RATIO_THRESHOLD
        u = door.cycle_urgency(cur_mean, baseline, op)
        self.cycles.append({"start_time": start, "end_time": end,
                            "prediction": "Abnormal resistance" if abnormal else "Normal"})
        if self.worst is None or ratio > self.worst["ratio"]:
            self.worst = {"cycle": n, "ratio": round(ratio, 3), "urgency": u}
        base.update(baseline=round(baseline, 1), ratio=round(ratio, 3))
        if not abnormal:
            return [_event("update", f"{op} cycle {n}: normal", u["summary"], priority="low",
                           urgency=u, **base)]
        self.n_abnormal += 1
        pr = "high" if ratio >= door.TRAIN_ABNORMAL_RATIO_MEDIAN else "medium"
        return [_event("alert", f"Door {op.lower()} cycle {n}: abnormal resistance",
                       u["summary"] + ". Check slide rails for debris, rubber strips and "
                       "door-leaf alignment.", priority=pr, urgency=u, **base)]

    def state(self) -> dict:
        return {"cycles": len(self.cycles), "abnormal_cycles": self.n_abnormal,
                "calibrated": {op: len(h) >= self.WARMUP for op, h in self.history.items()},
                "cycle_in_progress": bool(self.rows), "worst": self.worst}


class ShmMonitor:
    """Fatigue damage accumulates as stress samples arrive (same rainflow
    counting and Miner constants as the model). When a segment is complete the
    ridge model's estimate for it replaces the running figure. Alerts fire when
    the cumulative damage crosses 50% and 100% of the fatigue limit D = 1."""
    subsystem = "shm"
    SEGMENT_SAMPLES = 581_120          # the length of one monitoring file

    def __init__(self, segment_samples: int = SEGMENT_SAMPLES):
        self.segment_samples = segment_samples
        self.buf, self.n_buf = [], 0
        self.closed, self.segments, self.crossed = 0.0, [], set()
        self.running = 0.0

    def feed(self, x) -> list:
        x = np.asarray(x, dtype=np.float64).ravel()
        x = x[np.isfinite(x)]
        events = []
        while len(x):
            take = min(len(x), self.segment_samples - self.n_buf)
            self.buf.append(x[:take])
            self.n_buf += take
            x = x[take:]
            if self.n_buf >= self.segment_samples:
                events += self._close_segment()
        if self.n_buf:
            events += self._update()
        return events

    def finish(self) -> list:
        return self._close_segment() if self.n_buf else []

    def _running_damage(self) -> float:
        p = shm._params()
        return shm.damage_sum(shm.cycles(np.concatenate(self.buf)), p["m"]) / p["C"] if self.n_buf > 2 else 0.0

    def _crossings(self, total: float, t: str) -> list:
        events = []
        for level, pr in ((shm.REVIEW_DAMAGE, "medium"), (1.0, "high")):
            if total >= level and level not in self.crossed:
                self.crossed.add(level)
                events.append(_event("alert", f"Fatigue damage passed {level:.0%} of the limit",
                                     shm.damage_urgency(total)["summary"] +
                                     (". Plan an inspection of this location." if level < 1 else
                                      ". Failure criterion reached: escalate to a structural engineer."),
                                     time=t, priority=pr, urgency=shm.damage_urgency(total),
                                     cumulative_damage=round(total, 4)))
        return events

    def _update(self) -> list:
        self.running = self._running_damage()
        total = self.closed + self.running
        t = f"segment {len(self.segments) + 1}, {self.n_buf / self.segment_samples:.0%}"
        u = shm.damage_urgency(total)
        return self._crossings(total, t) + [
            _event("update", f"Segment {len(self.segments) + 1}: {self.n_buf / self.segment_samples:.0%} received",
                   u["summary"], time=t, priority=shm.damage_priority(total), urgency=u,
                   segment_damage=round(self.running, 6), cumulative_damage=round(total, 6),
                   progress=round(self.n_buf / self.segment_samples, 3))]

    def _close_segment(self) -> list:
        x = np.concatenate(self.buf)
        self.buf, self.n_buf, self.running = [], 0, 0.0
        r = shm.predict(x)
        d = r["prediction"]
        self.closed += d
        self.segments.append(round(d, 6))
        t = f"segment {len(self.segments)} complete"
        u = shm.damage_urgency(self.closed)
        return self._crossings(self.closed, t) + [
            _event("update", f"Segment {len(self.segments)} complete: damage {d:.4f}",
                   f"Model estimate for this segment; cumulative {self.closed:.3f}. " + u["summary"],
                   time=t, priority=shm.damage_priority(self.closed), urgency=u,
                   segment_damage=round(d, 6), cumulative_damage=round(self.closed, 6),
                   progress=1.0, evidence=r["detail"]["evidence"])]

    def state(self) -> dict:
        total = self.closed + self.running
        return {"segments_complete": len(self.segments), "segment_damages": self.segments,
                "current_segment_progress": round(self.n_buf / self.segment_samples, 3),
                "cumulative_damage": round(total, 6), "urgency": shm.damage_urgency(total)}


class AcvMonitor:
    """The car ranking is recomputed on all rows received so far (30-second
    telemetry) and shown as provisional from 2 hours of data. An alert fires
    once the same car has led with at least 80% probability for 12 hours of
    data, and never before 12 hours in. Replaying the six training cases with
    models that never saw them, this rule raised no false alerts and flagged
    the leaking car in 4 of 6 cases, after 12-69 hours of data (a leak shows
    as a few tenths of a degree, so it takes days of data to be certain). A
    later change of leader raises a revised alert."""
    subsystem = "acv"
    WARMUP_ROWS = 240                  # 2 h at 30 s: provisional ranking starts
    ALERT_MIN_ROWS = 1440              # 12 h: no alert before this
    HOLD_ROWS = 1440                   # 12 h leading at >= 80%

    def __init__(self):
        self.frames, self.n = [], 0
        self.top, self.held, self.alerted, self.last = None, 0, None, None

    def feed(self, df: pd.DataFrame) -> list:
        self.frames.append(df)
        self.n += len(df)
        t = str(df.iloc[-1, 2]) if df.shape[1] > 2 and len(df) else None
        hours = self.n * 30 / 3600
        if self.n < self.WARMUP_ROWS:
            return [_event("update", f"Collecting data: {hours:.1f} h of {self.WARMUP_ROWS * 30 / 3600:.0f} h",
                           "The car ranking starts after 2 hours of telemetry.", time=t, priority="low",
                           hours=round(hours, 2))]
        full = pd.concat(self.frames, ignore_index=True)
        self.frames = [full]
        r = acv.predict(full)
        d = r["detail"]
        top, p_top = r["prediction"], d["probability"][r["prediction"]]
        self.held = self.held + len(df) if (top == self.top and p_top >= 0.8) else (len(df) if p_top >= 0.8 else 0)
        self.top = top
        self.last = {"ranked_cars": r["ranked_cars"], "probability": d["probability"],
                     "priority": d["priority"], "urgency": d["urgency"], "hours": round(hours, 2)}
        vals = dict(ranked_cars=r["ranked_cars"], probability=d["probability"], hours=round(hours, 2),
                    held_hours=round(self.held * 30 / 3600, 2))
        events = []
        if self.n >= self.ALERT_MIN_ROWS and self.held >= self.HOLD_ROWS and self.alerted != top:
            revised = f" (revised from car {self.alerted})" if self.alerted else ""
            self.alerted = top
            events.append(_event("alert", f"Refrigerant leak suspected in car {top}{revised}",
                                 f"{d['urgency']['summary']}. Car {top} has led with at least 80% "
                                 f"probability for {self.held * 30 / 3600:.1f} h of data. Check "
                                 "high-side and low-side pressures and inspect for leaks.",
                                 time=t, priority=d["priority"], urgency=d["urgency"],
                                 evidence=d["evidence"], **vals))
        provisional = " (provisional)" if self.n < self.ALERT_MIN_ROWS else ""
        events.append(_event("update", f"Leading car {top} ({p_top:.0%}){provisional}", d["urgency"]["summary"],
                             time=t, priority=d["priority"], urgency=d["urgency"], **vals))
        return events

    def finish(self) -> list:
        return []

    def state(self) -> dict:
        return {"rows": self.n, "hours": round(self.n * 30 / 3600, 2), "leading": self.last,
                "alerted_car": self.alerted}


class RailMonitor:
    """Every 1-second window (10,000 samples at 10 kHz) is classified with the
    Rail model; corrugation on either side raises an alert."""
    subsystem = "rail"
    WINDOW = 10_000

    def __init__(self):
        self.buf, self.n = [], 0
        self.windows, self.counts = 0, {"Normal": 0, "Side I": 0, "Side II": 0}

    def feed(self, df: pd.DataFrame) -> list:
        self.buf.append(df)
        self.n += len(df)
        events = []
        while self.n >= self.WINDOW:
            full = pd.concat(self.buf, ignore_index=True)
            window, rest = full.iloc[:self.WINDOW], full.iloc[self.WINDOW:]
            self.buf, self.n = ([rest] if len(rest) else []), len(rest)
            events += self._window(window)
        return events

    def finish(self) -> list:
        self.buf, self.n = [], 0               # a partial window is not classified
        return []

    def _window(self, window: pd.DataFrame) -> list:
        self.windows += 1
        r = rail.predict(window)
        d, label = r["detail"], r["prediction"]
        self.counts[label] += 1
        t = f"window {self.windows}"
        vals = dict(prediction=label, probabilities=d["confidence"], speed_kmh=d["speed_kmh"])
        if label == "Normal":
            return [_event("update", f"Window {self.windows}: Normal ({d['confidence']['Normal']:.0%})",
                           d["urgency"]["summary"], time=t, priority=d["priority"],
                           urgency=d["urgency"], **vals)]
        return [_event("alert", f"Rail corrugation suspected on {label}",
                       f"{d['priority_reason']} {d['urgency']['summary']}. Correlate with the "
                       "route position and inspect that rail for periodic wear.",
                       time=t, priority=d["priority"], urgency=d["urgency"],
                       evidence=d["evidence"], **vals)]

    def state(self) -> dict:
        return {"windows": self.windows, "counts": self.counts,
                "buffered_samples": self.n}


MONITORS = {"door": DoorMonitor, "shm": ShmMonitor, "acv": AcvMonitor, "rail": RailMonitor}


# ---------------------------------------------------------------- sessions
class Session:
    def __init__(self, subsystem: str):
        if subsystem not in MONITORS:
            raise ValueError(f"unknown subsystem {subsystem!r}; expected one of {sorted(MONITORS)}")
        self.id = uuid.uuid4().hex[:10]
        self.subsystem = subsystem
        self.monitor = MONITORS[subsystem]()
        self.events, self._seq = [], itertools.count(1)
        self.lock = threading.Lock()
        self.status = "waiting for data"
        self._stop = threading.Event()
        self._thread = None

    def ingest(self, chunk) -> list:
        with self.lock:
            if self.status == "waiting for data":
                self.status = "receiving"
            return self._log(self.monitor.feed(chunk))

    def finish(self) -> list:
        with self.lock:
            return self._log(self.monitor.finish())

    def _log(self, events: list) -> list:
        for e in events:
            e.update(seq=next(self._seq), session=self.id, subsystem=self.subsystem)
            self.events.append(e)
        return events

    def events_after(self, after: int = 0, limit: int = 500) -> list:
        return [e for e in self.events if e["seq"] > after][:limit]

    def state(self) -> dict:
        alerts = [e for e in self.events if e["kind"] == "alert"]
        top = max(alerts, key=lambda e: (e["urgency"] or {}).get("times_threshold") or 0, default=None)
        return {"session_id": self.id, "subsystem": self.subsystem, "status": self.status,
                "events": len(self.events), "alerts": len(alerts),
                "most_urgent_alert": top, **self.monitor.state()}

    def stop(self) -> None:
        self._stop.set()


SESSIONS: dict = {}


def create_session(subsystem: str) -> Session:
    s = Session(subsystem.strip().lower())
    SESSIONS[s.id] = s
    return s


def get_session(session_id: str) -> Session:
    return SESSIONS[session_id]


def delete_session(session_id: str) -> None:
    s = SESSIONS.pop(session_id)
    s.stop()


# ---------------------------------------------------------------- input parsing
def parse_chunk(subsystem: str, body: bytes, content_type: str = "text/csv"):
    """One chunk of sensor data from an HTTP body: CSV text in the dataset's own
    columns, or JSON {"columns": [...], "rows": [[...]]} (SHM: {"values": [...]})."""
    if "json" in (content_type or ""):
        obj = json.loads(body)
        if subsystem == "shm":
            return np.asarray(obj["values"] if isinstance(obj, dict) else obj, dtype=np.float64)
        return pd.DataFrame(obj["rows"], columns=obj["columns"])
    if subsystem == "shm":
        return pd.read_csv(io.BytesIO(body), header=None).iloc[:, 0].to_numpy(np.float64)
    return pd.read_csv(io.BytesIO(body))


# ---------------------------------------------------------------- replay
DEFAULT_SPEED = {"door": 20.0, "acv": 1800.0, "rail": 1.0, "shm": 1.0}
SHM_SECONDS_PER_SEGMENT = 10.0         # nominal replay length of one SHM file at speed 1
MAX_SLEEP = 3.0


def _read(subsystem: str, path: str):
    if subsystem == "acv":
        return acv.read(path)
    if subsystem == "shm":
        return shm.load_series(path)
    return pd.read_csv(path)


def _chunks(subsystem: str, data, speed: float):
    """Yield (chunk, seconds to wait before the next one) at `speed` x real time."""
    if subsystem == "door":
        ts = data["Datetime"].map(door.parse_time)
        sec = (ts - ts.iloc[0]).dt.total_seconds().to_numpy()
        starts = np.unique(np.searchsorted(sec, np.arange(0, sec[-1] + 0.5, 0.5)))
        starts = starts[starts < len(data)]
        for a, b in zip(starts, list(starts[1:]) + [len(data)]):        # 0.5 s of data each
            yield data.iloc[a:b], ((sec[b] - sec[a]) / speed if b < len(data) else 0.0)
    elif subsystem == "acv":
        for a in range(0, len(data), 60):                       # 30 min of 30-second rows
            yield data.iloc[a:a + 60], 1800.0 / speed
    elif subsystem == "rail":
        for a in range(0, len(data), RailMonitor.WINDOW):
            yield data.iloc[a:a + RailMonitor.WINDOW], 1.0 / speed
    else:                                                        # shm
        step = int(np.ceil(len(data) / 20))
        for a in range(0, len(data), step):
            yield data[a:a + step], SHM_SECONDS_PER_SEGMENT / 20 / speed


def replay(session: Session, paths: list, speed: float | None = None,
           cleanup: bool = False) -> threading.Thread:
    """Play recorded files into a session in a background thread, as if a
    sensor were sending them. `speed` is x real time (SHM: 1 = one file per
    10 s). Returns the thread."""
    speed = float(speed or DEFAULT_SPEED[session.subsystem])

    def run():
        session.status = "replaying"
        try:
            for path in paths:
                for chunk, wait in _chunks(session.subsystem, _read(session.subsystem, path), speed):
                    if session._stop.is_set():
                        break
                    session.ingest(chunk)
                    if session._stop.wait(min(wait, MAX_SLEEP)):
                        break
                if session._stop.is_set():
                    break
            session.finish()
            session.status = "stopped" if session._stop.is_set() else "replay finished"
        except Exception as exc:                                  # surfaced to the app
            session.status = f"replay failed: {exc}"
        finally:
            if cleanup:
                for p in paths:
                    try:
                        os.unlink(p)
                    except OSError:
                        pass

    session._stop.clear()
    session._thread = threading.Thread(target=run, daemon=True)
    session._thread.start()
    return session._thread
