"""FastAPI app: upload a test file, get a plain-language prediction back.

One JSON endpoint per PS3 subsystem. The Next.js app in web/ is the
frontend and proxies /api/* to this server; this file only handles the
file upload and JSON shape -- all prediction logic stays in ps3/predict.py.
"""
import asyncio
import os
import tempfile

import pandas as pd
from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ps3 import live, predict, rca

app = FastAPI(title="NebulaX PS3 - Fault Prediction")

# The Next.js server proxies through this via next.config.ts rewrites (see
# PS3_API_ORIGIN there), so same-origin browser requests never hit CORS.
# This only matters if something calls the API directly cross-origin (a
# different dev port, Swagger UI on another host). ALLOWED_ORIGINS is a
# comma-separated list; set it on the Cloud Run service once the frontend's
# URL is known.
_default_origins = "http://localhost:3000,http://127.0.0.1:3000"
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", _default_origins).split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "healthy"}


def _jsonable(value):
    """Recursively turn DataFrames/numpy scalars into plain JSON values."""
    if isinstance(value, pd.DataFrame):
        return value.to_dict(orient="records")
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if hasattr(value, "item"):  # numpy scalar
        return value.item()
    return value


@app.get("/api/subsystems")
def subsystems():
    return {key: {k: v for k, v in meta.items() if k != "fn"}
            for key, meta in predict.SUBSYSTEMS.items()}


@app.post("/api/predict/{subsystem}")
async def run_prediction(subsystem: str, file: UploadFile = File(...)):
    key = subsystem.strip().lower()
    if key not in predict.SUBSYSTEMS:
        raise HTTPException(404, f"unknown subsystem '{subsystem}'")

    meta = predict.SUBSYSTEMS[key]
    suffix = os.path.splitext(file.filename or "")[1].lower()
    if suffix not in meta["accepts"]:
        raise HTTPException(
            400,
            f"{meta['label']} expects a {' or '.join(meta['accepts'])} file, "
            f"got '{suffix or 'no extension'}'.",
        )

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # predict.run is CPU-bound sync code (pandas/numpy/sklearn); run it off
        # the event loop so concurrent uploads (e.g. a multi-file batch from the
        # UI) don't serialize behind each other on a single request at a time.
        result = await asyncio.to_thread(predict.run, key, tmp_path)
    except Exception as exc:
        raise HTTPException(
            422, f"Couldn't read this file as {meta['label']} data: {exc}")
    finally:
        os.unlink(tmp_path)

    return JSONResponse(_jsonable({"subsystem": key, **result}))


@app.post("/api/rca/{subsystem}")
async def run_rca(subsystem: str, result: dict = Body(...)):
    key = subsystem.strip().lower()
    if key not in predict.SUBSYSTEMS:
        raise HTTPException(404, f"unknown subsystem '{subsystem}'")

    try:
        # google-genai's client call is blocking network I/O; keep it off
        # the event loop like the predict route does for its CPU-bound work.
        rca_result = await asyncio.to_thread(rca.call_gemini, key, result)
    except Exception as exc:
        raise HTTPException(502, f"Gemini RCA request failed: {exc}")

    return JSONResponse(rca_result)


@app.post("/api/simulate/{subsystem}")
async def simulate_recording(subsystem: str, file: UploadFile = File(...)):
    """Turn an uploaded recording into an instant, scrub-able sensor timeline."""
    key = subsystem.strip().lower()
    if key not in predict.SUBSYSTEMS:
        raise HTTPException(404, f"unknown subsystem '{subsystem}'")
    suffix = os.path.splitext(file.filename or "")[1].lower()
    accepted = set(predict.SUBSYSTEMS[key]["accepts"]) | {".xlsx", ".xls"}
    if suffix not in accepted:
        raise HTTPException(400, f"Sensor playback expects {', '.join(sorted(accepted))}; got '{suffix or 'no extension'}'.")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        simulation = await asyncio.to_thread(live.simulate_file, key, tmp_path)
    except Exception as exc:
        raise HTTPException(422, f"Couldn't simulate this recording as {predict.SUBSYSTEMS[key]['label']} data: {exc}")
    finally:
        os.unlink(tmp_path)
    return JSONResponse(_jsonable(simulation))



# ---------------------------------------------------------------- live monitoring
# A sensor gateway (or the replay below) sends chunks of data to a session; each
# chunk runs through the live version of the model and returns events. The page
# polls /events?after=<last seq> about once a second. Sessions are kept in
# memory, so the backend should run as a single instance.
LIVE_FORMATS = {
    "door": "CSV with a header row and the same columns as the Door files "
            "(Datetime as Y-M-D-H-M-S-ms, Motor current(mA), ..., Door is closing, ...), "
            "one row per sample.",
    "acv": "CSV with a header row and the same columns as the ACV case files (car model, "
           "train number, time, then 'Car NN - <parameter>' for every car), one row per 30 s.",
    "rail": "CSV with a header row and the same 129 columns as the Rail files (speed pulse, "
            "then vibration and shock per axle box) at 10 kHz; every 10,000 rows (1 s) are classified.",
    "shm": "Stress samples, one number per line with no header (or JSON {\"values\": [...]}); "
           "581,120 samples make one monitoring segment.",
}


def _session(session_id: str) -> live.Session:
    try:
        return live.get_session(session_id)
    except KeyError:
        raise HTTPException(404, f"unknown live session '{session_id}'")


@app.post("/api/live/{subsystem}/sessions")
def live_create(subsystem: str):
    key = subsystem.strip().lower()
    if key not in predict.SUBSYSTEMS:
        raise HTTPException(404, f"unknown subsystem '{subsystem}'")
    s = live.create_session(key)
    return {"session_id": s.id, "subsystem": key, "chunk_format": LIVE_FORMATS[key],
            "default_replay_speed": live.DEFAULT_SPEED[key]}


@app.get("/api/live/sessions")
def live_list():
    return [{k: v for k, v in s.state().items() if k in ("session_id", "subsystem", "status", "events", "alerts")}
            for s in live.SESSIONS.values()]


@app.post("/api/live/sessions/{session_id}/data")
async def live_ingest(session_id: str, request: Request):
    """Sensor input: one chunk of data in the format given by `chunk_format`."""
    s = _session(session_id)
    body = await request.body()
    try:
        chunk = live.parse_chunk(s.subsystem, body, request.headers.get("content-type", ""))
        events = await asyncio.to_thread(s.ingest, chunk)
    except Exception as exc:
        raise HTTPException(422, f"Couldn't process this chunk as {s.subsystem} data: {exc}")
    return JSONResponse(_jsonable({"events": events, "state": s.state()}))


@app.post("/api/live/sessions/{session_id}/replay")
async def live_replay(session_id: str, files: list[UploadFile] = File(...),
                      speed: float | None = Form(None)):
    """Play recorded files into the session as if a sensor were sending them."""
    s = _session(session_id)
    accepts = predict.SUBSYSTEMS[s.subsystem]["accepts"]
    paths = []
    for f in files:
        suffix = os.path.splitext(f.filename or "")[1].lower()
        if suffix not in accepts:
            raise HTTPException(400, f"{s.subsystem} replay expects {' or '.join(accepts)} files, "
                                     f"got '{suffix or 'no extension'}'.")
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await f.read())
            paths.append(tmp.name)
    live.replay(s, paths, speed, cleanup=True)
    return {"status": "replaying", "files": len(paths),
            "speed": speed or live.DEFAULT_SPEED[s.subsystem]}


@app.post("/api/live/sessions/{session_id}/stop")
async def live_stop(session_id: str):
    """Stop a replay, or mark the end of a sensor stream (closes an open door cycle)."""
    s = _session(session_id)
    if s._thread is not None and s._thread.is_alive():
        s.stop()
        await asyncio.to_thread(s._thread.join, 10)
    else:
        await asyncio.to_thread(s.finish)
        s.status = "stopped"
    return JSONResponse(_jsonable(s.state()))


@app.get("/api/live/sessions/{session_id}/events")
def live_events(session_id: str, after: int = 0, limit: int = 500):
    s = _session(session_id)
    events = s.events_after(after, limit)
    return JSONResponse(_jsonable({"events": events,
                                   "last_seq": events[-1]["seq"] if events else after,
                                   "state": s.state()}))


@app.get("/api/live/sessions/{session_id}")
def live_state(session_id: str):
    return JSONResponse(_jsonable(_session(session_id).state()))


@app.delete("/api/live/sessions/{session_id}")
def live_delete(session_id: str):
    _session(session_id)
    live.delete_session(session_id)
    return {"deleted": session_id}
