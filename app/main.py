"""FastAPI app: upload a test file, get a plain-language prediction back.

One JSON endpoint per PS3 subsystem. The Next.js app in web/ is the
frontend and proxies /api/* to this server; this file only handles the
file upload and JSON shape -- all prediction logic stays in ps3/predict.py.
"""
import os
import tempfile

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ps3 import predict

app = FastAPI(title="NebulaX PS3 - Fault Prediction")

# The Next.js dev server proxies through this via next.config.ts rewrites,
# so same-origin browser requests never hit CORS. This only matters if the
# frontend is ever pointed at the API directly (e.g. a different dev port).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


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
        result = predict.run(key, tmp_path)
    except Exception as exc:
        raise HTTPException(
            422, f"Couldn't read this file as {meta['label']} data: {exc}")
    finally:
        os.unlink(tmp_path)

    return JSONResponse(_jsonable({"subsystem": key, **result}))
