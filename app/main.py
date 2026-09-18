"""FastAPI app: upload a test file, get a plain-language prediction back.

One JSON endpoint per PS3 subsystem. The Next.js app in web/ is the
frontend and proxies /api/* to this server; this file only handles the
file upload and JSON shape -- all prediction logic stays in ps3/predict.py.
"""
import asyncio
import os
import tempfile

import pandas as pd
from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ps3 import predict, rca

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
