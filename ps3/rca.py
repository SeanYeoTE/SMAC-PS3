"""Gemini-backed root cause analysis for a prediction result.

Given the same `{prediction/ranked_cars, detail, ...}` dict predict.run()
produces, ask Gemini (via Vertex AI) for a grounded cause/action pair --
the same shape the old client-side rule-based version in
web/src/lib/rca.ts produced, but reasoned over by the model instead of
templated. Called from the FastAPI route after a prediction is made, not
as part of predict.run() itself, so a slow or failed Gemini call never
blocks or breaks the prediction response.
"""
import json
import os

from google import genai
from google.genai import types

_RCA_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "cause": {"type": "STRING"},
        "action": {"type": "STRING"},
    },
    "required": ["cause", "action"],
}

_SUBSYSTEM_CONTEXT = {
    "door": (
        "Train door resistance monitoring. `detail` gives per-cycle current "
        "draw vs an operation-specific baseline: n_segments, n_abnormal, "
        "ratio_threshold, baselines_mA, and per_segment rows (operation, "
        "cur_mean, baseline, ratio, excess_pct, abnormal)."
    ),
    "acv": (
        "Air conditioning & ventilation refrigerant leak ranking across train "
        "cars. `prediction` is the top-ranked car; `ranked_cars` is all cars "
        "most-to-least likely, pipe-separated. `detail` gives scores_degC per "
        "car, margin_over_runner_up_degC, confidence, and manual_control_fraction."
    ),
    "rail": (
        "Rail corrugation detection from vibration/shock data. `prediction` is "
        "Normal, Side I or Side II. `detail` gives per-class confidence, "
        "speed_kmh, stationary, and side_I_rms/side_II_rms/side_I_over_II."
    ),
    "shm": (
        "Structural health monitoring, cumulative fatigue damage estimate. "
        "`prediction` is the model's damage value (D=1 is the fatigue "
        "criterion). `detail` gives miners_rule_estimate as a cross-check, "
        "model_vs_formula_pct, rainflow_cycles, largest_amplitude, "
        "sn_exponent_m, sn_constant_C, and damage_by_amplitude_band."
    ),
}


def build_prompt(subsystem: str, result: dict) -> str:
    context = _SUBSYSTEM_CONTEXT.get(subsystem, f"PS3 subsystem '{subsystem}'.")
    return (
        "You are a maintenance engineer writing a root cause analysis (RCA) "
        "for a rail vehicle fault detection system.\n\n"
        f"Subsystem: {context}\n\n"
        f"Prediction result (JSON):\n{result}\n\n"
        "Using only the evidence in this result, write:\n"
        "- cause: a concise, technically grounded hypothesis for what the "
        "evidence suggests, citing the specific numbers that support it. "
        "Do not overstate certainty -- name plausible mechanical/electrical "
        "causes but be clear this data alone cannot prove them.\n"
        "- action: a concrete, actionable maintenance recommendation a "
        "technician or engineer could follow next, appropriate to the "
        "severity shown in the evidence.\n\n"
        "Keep each field to 2-4 sentences. Respond with JSON only."
    )


def call_gemini(subsystem: str, result: dict) -> dict:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "qwiklabs-gcp-04-f123337a0478")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

    client = genai.Client(vertexai=True, project=project, location=location)
    response = client.models.generate_content(
        model=model,
        contents=build_prompt(subsystem, result),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_RCA_RESPONSE_SCHEMA,
        ),
    )
    return json.loads(response.text)
