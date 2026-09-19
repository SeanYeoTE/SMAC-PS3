"""SHM: cumulative fatigue damage from a dynamic stress time series.

The Info Kit says the reference labels were computed with rainflow counting and
Miner's rule. How the rainflow counting is done matters: the labels are matched
best by fatpack's rainflow counting with its default 64 load classes, the
residue closed by repeating it (full cycles). The 2-parameter Miner formula
D = sum(amp^m) / C fitted on those cycles misses the labels by 0.79% on average,
against 2.6% on exact rainflow cycles with half-counted residue; 63 or 65 load
classes give 1.08%, so 64 is a sharp optimum.

Model: ridge regression on log damage, trained on the 64 labelled files, on 9
features log( sum_i amp_i^m ) for m = 3.0, 3.5 ... 7.0 over those cycles.
Repeated 5-fold CV MAPE 0.56% (20 seeds; leave-one-out 0.54%, score about
0.995), against 2.45% for the previous model (rainflow-package cycles plus 21
signal statistics). The fitted Miner formula is still computed for every file
and shown in `detail` as a cross-check.
"""
import json
import os

import numpy as np
import pandas as pd

from .urgency import urgency

PARAMS_PATH = os.path.join(os.path.dirname(__file__), "params_shm.json")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model_shm.joblib")
DAMAGE_EXPONENTS = np.arange(3.0, 7.01, 0.5)
REVIEW_DAMAGE = 0.5        # priority "medium" from half the fatigue capacity used (policy, not learned)
_P = None
_M = None


def _params() -> dict:
    global _P
    if _P is None:
        with open(PARAMS_PATH) as f:
            _P = json.load(f)
    return _P


def _model() -> dict:
    global _M
    if _M is None:
        import joblib
        _M = joblib.load(MODEL_PATH)
    return _M


def load_series(path: str) -> np.ndarray:
    """Files are headerless single-column CSVs, 581,120 samples each."""
    s = pd.read_csv(path, header=None, dtype=np.float64).iloc[:, 0].to_numpy()
    return s[np.isfinite(s)]


LOAD_CLASSES = 64          # fatpack's default; reproduces the labels best (see above)


def cycles(x: np.ndarray) -> np.ndarray:
    """Rainflow cycles -> array of (amplitude, count), one row per distinct
    amplitude. fatpack sorts the signal into 64 load classes and closes the
    residue by repeating it, so every cycle is a full cycle."""
    import fatpack
    rng = fatpack.find_rainflow_ranges(x, k=LOAD_CLASSES)
    amp, cnt = np.unique(rng[rng > 0] / 2.0, return_counts=True)
    return np.stack([amp, cnt.astype(float)], 1)


def damage_sum(c: np.ndarray, m: float) -> float:
    return float(np.sum(c[:, 0] ** m * c[:, 1]))


def features(c: np.ndarray) -> pd.Series:
    """The 9 model inputs: log damage sums over the rainflow cycles."""
    return pd.Series({f"rf_logdmg_m{m:.1f}": np.log(damage_sum(c, m)) for m in DAMAGE_EXPONENTS})


def featurize(path: str) -> pd.Series:
    return features(cycles(load_series(path)))


def make_model():
    """Standardised features -> ridge regression on log(damage); the
    regularisation strength is chosen by internal cross-validation."""
    from sklearn.linear_model import RidgeCV
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    return make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-4, 2, 13)))


def predict(path) -> dict:
    """path: a CSV file, or the stress samples themselves (array-like)."""
    p = _params()
    x = load_series(path) if isinstance(path, str) else np.asarray(path, dtype=np.float64)
    c = cycles(x)
    M = _model()
    X = features(c).reindex(M["features"]).to_frame().T
    D = float(np.exp(M["model"].predict(X)[0]))
    D_formula = damage_sum(c, p["m"]) / p["C"]

    # explanation: which amplitude bands drive the damage
    edges = np.array([0, 5, 10, 15, 20, 25, 30, np.inf])
    contrib = c[:, 0] ** p["m"] * c[:, 1]
    bands = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        sel = (c[:, 0] >= lo) & (c[:, 0] < hi)
        if sel.any():
            bands.append({
                "amplitude_range": f"{lo:.0f}-{'inf' if np.isinf(hi) else f'{hi:.0f}'}",
                "cycles": float(c[sel, 1].sum()),
                "share_of_damage": round(float(contrib[sel].sum() / contrib.sum()), 4),
            })
    bands.sort(key=lambda b: -b["share_of_damage"])

    return {
        "prediction": round(D, 6),
        "detail": {
            "model": "ridge regression on rainflow damage sums (fatpack, 64 load classes)",
            "miners_rule_estimate": round(float(D_formula), 6),
            "model_vs_formula_pct": round(100 * (D / D_formula - 1), 2),
            "samples": int(len(x)),
            "rainflow_cycles": int(c[:, 1].sum()),
            "largest_amplitude": round(float(c[:, 0].max()), 3),
            "sn_exponent_m": p["m"],
            "sn_constant_C": p["C"],
            "damage_by_amplitude_band": bands[:4],
            "remaining_capacity": round(max(0.0, 1.0 - D), 4),
            "urgency": damage_urgency(D),
            **_evidence(M["reference"], D, float(D_formula), float(c[:, 0].max()), bands),
            "note": "A handful of the largest stress swings drive most of the "
                    "fatigue damage: a swing twice as big does roughly "
                    f"{2 ** p['m']:.0f}x the damage, so small vibrations barely "
                    "matter compared to the few big ones.",
        },
    }


def reference_stats(model, X: pd.DataFrame, y: np.ndarray, cyc: list) -> dict:
    """Training damage values, largest amplitudes and model-vs-formula gaps;
    saved with the model so each prediction can be compared with them."""
    p = _params()
    fit = np.exp(model.predict(X))
    formula = np.array([damage_sum(c, p["m"]) / p["C"] for c in cyc])
    gap = 100 * (fit / formula - 1)
    return {"n_files": int(len(y)),
            "damage_sorted": sorted(round(float(v), 6) for v in y),
            "largest_amplitude_sorted": sorted(round(float(c[:, 0].max()), 4) for c in cyc),
            "model_vs_formula_pct_range": [round(float(gap.min()), 2), round(float(gap.max()), 2)]}


def _evidence(ref: dict, D: float, D_formula: float, amp_max: float, bands: list) -> dict:
    """Findings measured against the training recordings, plus a priority."""
    n = ref["n_files"]
    dmg = np.asarray(ref["damage_sorted"])
    below = float(np.searchsorted(dmg, D) / n)
    amp_below = float(np.searchsorted(ref["largest_amplitude_sorted"], amp_max) / n)
    gap = 100 * (D / D_formula - 1)
    g_lo, g_hi = ref["model_vs_formula_pct_range"]

    ev = [f"Predicted cumulative damage D = {D:.3f}: {max(0.0, 1 - D):.0%} of the fatigue "
          "capacity remains (fatigue failure occurs at D >= 1).",
          f"Higher than {below:.0%} of the {n} training recordings (their damage ranged "
          f"{dmg[0]:.3f} to {dmg[-1]:.3f})"
          + ("; this is outside that range, so the model is extrapolating."
             if D < dmg[0] or D > dmg[-1] else ".")]
    if bands:
        ev.append(f"{bands[0]['share_of_damage']:.0%} of the damage comes from stress "
                  f"amplitudes {bands[0]['amplitude_range']}; the largest amplitude "
                  f"({amp_max:.1f}) is higher than in {amp_below:.0%} of the training recordings.")
    ev.append(f"Model and Miner's-rule formula differ by {gap:+.1f}% (training: {g_lo:+.1f}% "
              f"to {g_hi:+.1f}%)" + (": unusual for this model, treat with caution."
                                     if not g_lo <= gap <= g_hi else "."))

    priority = damage_priority(D)
    if D >= 1:
        reason = "D >= 1: the fatigue failure criterion is reached."
    elif D >= REVIEW_DAMAGE:
        reason = f"More than half of the fatigue capacity is used ({D:.0%})."
    else:
        reason = f"{1 - D:.0%} of the fatigue capacity remains."
    return {"evidence": ev, "priority": priority, "priority_reason": reason}


def damage_urgency(D: float) -> dict:
    """Share of the fatigue limit used (failure at D = 1, from the Info Kit);
    the review level is REVIEW_DAMAGE (50%)."""
    return urgency("limit", "cumulative fatigue damage vs the failure limit D = 1", "",
                   1.0, D, D * 100, REVIEW_DAMAGE * 100,
                   f"{D * 100:.0f}% of the fatigue limit used; review from "
                   f"{REVIEW_DAMAGE * 100:.0f}%, failure at 100%")


def damage_priority(D: float) -> str:
    return "high" if D >= 1 else "medium" if D >= REVIEW_DAMAGE else "low"
