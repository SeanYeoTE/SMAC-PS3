"""Urgency: how far a reading is past its alert level, in percent.

Door, ACV and Rail compare a reading with what is normal for that same asset
and moment ("% above normal"); the alert level is expressed the same way, so
`times_threshold` says how many times past the alert level the reading is.
SHM has no "normal" damage (every training file is a healthy structure), so
its urgency is the share of the fatigue limit D = 1 used, the failure
criterion given in the Info Kit.
"""
import math


def urgency(basis: str, measure: str, unit: str, reference, value, pct,
            threshold_pct: float, summary: str) -> dict:
    """basis: "normal" (pct = % beyond normal) or "limit" (pct = % of the limit used)."""
    ok = pct is not None and not (isinstance(pct, float) and math.isnan(pct))
    r = lambda v, d: None if v is None or (isinstance(v, float) and math.isnan(v)) else round(float(v), d)
    return {
        "basis": basis,
        "measure": measure,
        "unit": unit,
        "reference": r(reference, 4),
        "value": r(value, 4),
        "pct": r(pct, 1) if ok else None,
        "threshold_pct": round(float(threshold_pct), 1),
        "times_threshold": round(float(pct) / threshold_pct, 2) if ok and threshold_pct else None,
        "summary": summary,
    }
