"""FastAPI app: upload a test file, get a plain-language prediction back.

One JSON endpoint per PS3 subsystem. The Next.js app in web/ is the
frontend and proxies /api/* to this server; this file only handles the
file upload and JSON shape -- all prediction logic stays in ps3/predict.py.
"""
import asyncio
import os
import tempfile

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ps3 import predict

app = FastAPI(title="NebulaX PS3 - Fault Prediction")

# predict.run is CPU-bound (pandas/numpy/sklearn); asyncio.to_thread lets
# requests overlap instead of queuing on the event loop, but each one still
# competes for real CPU and memory. Cap how many run at once to the actual
# core count so a burst of concurrent uploads (a large multi-file batch)
# can't oversubscribe a small instance and get OOM-killed mid-request.
_predict_semaphore = asyncio.Semaphore(max(1, os.cpu_count() or 1))

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
        async with _predict_semaphore:
            result = await asyncio.to_thread(predict.run, key, tmp_path)
    except Exception as exc:
        raise HTTPException(
            422, f"Couldn't read this file as {meta['label']} data: {exc}")
    finally:
        os.unlink(tmp_path)

    return JSONResponse(_jsonable({"subsystem": key, **result}))
