"""Rail corrugation: classify a 1-second, 10 kHz, 128-channel axle-box
recording as Normal / Side I / Side II.

Layout: column 0 is the rotating-speed tooth counter (90 teeth, 0.85 m wheel).
Columns 1-128 are vibration and shock for 64 axle boxes at positions 1-8.
Odd positions are Side I, even positions are Side II, so the features are
built per side and the model learns which side is worse.

Model: soft vote of gradient boosting, RBF-SVM and logistic regression
(make_model) on the 57 side features plus 16 loudest-axle-box features.
Training data are augmented with a side-swapped copy of every corrugated
recording (augment): the same recording seen from the mirrored side is a valid
example of the other class, which grows each fault class from 14 / 24 to 38.

Measured on 20 fresh 5-fold splits (seeds not used for any other choice, 272
training files): macro F1 0.87 +- 0.03, against 0.83 +- 0.03 for the same
ensemble without mirrored copies (better on 17 of 20). Per class: Normal
0.983, Side II 0.897, Side I 0.724. Mirroring every recording, or mirroring
with the older single gradient-boosted model, gave no gain. With only 14
Side I files (about 4 expected in the test set) the realised score can move
+-0.1. Report that range, not a point estimate.

Speed is a weak confound, not a dominant one: speed alone gives macro F1
0.399 against a 0.33 always-Normal floor, and dropping it costs only 0.02.
Wavelength-normalised bands are still included because corrugation frequency
is speed / wavelength and speeds span 0-67 km/h across files.
"""
import os
import re

import numpy as np
import pandas as pd

from .urgency import urgency

FS = 10_000
WHEEL_DIAMETER_M = 0.85
TEETH = 90
FREQ_BANDS = [(50, 150), (150, 300), (300, 600), (600, 1200), (1200, 2500), (2500, 5000)]
WAVELENGTH_BANDS_MM = [(20, 40), (40, 80), (80, 160), (160, 320)]
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model_rail.joblib")
EVIDENCE_FEATURES = ["I_rms", "II_rms", "I_vib_wheel_max", "II_vib_wheel_max"]
SPEED_NEIGHBOURS = 40      # Normal training recordings closest in speed, for the evidence
_M = None


def _channel_groups(columns) -> dict:
    pos = [int(re.search(r"position (\d)", c).group(1)) for c in columns[1:]]
    kind = ["vib" if c.startswith("Vibration") else "shk" for c in columns[1:]]
    idx = lambda odd, k: [i + 1 for i, (p, kk) in enumerate(zip(pos, kind))
                          if (p % 2 == 1) == odd and kk == k]
    return {"I": idx(True, "vib"), "II": idx(False, "vib"),
            "sI": idx(True, "shk"), "sII": idx(False, "shk")}


def speed_kmh(tooth_signal: np.ndarray) -> float:
    transitions = np.abs(np.diff(tooth_signal)).sum()
    rev_per_s = transitions / 2 / TEETH
    return float(rev_per_s * np.pi * WHEEL_DIAMETER_M * 3.6)


def _side_features(A: np.ndarray, tag: str, v_ms: float, out: dict,
                   freqs: np.ndarray) -> None:
    rms = np.sqrt((A ** 2).mean(0))
    out[f"{tag}_rms"] = rms.mean()
    out[f"{tag}_rms_max"] = rms.max()
    z = A - A.mean(0)
    out[f"{tag}_kurt"] = np.nanmean((z ** 4).mean(0) / (z.std(0) ** 4 + 1e-12))
    out[f"{tag}_crest"] = np.nanmean(np.abs(A).max(0) / (rms + 1e-12))

    P = (np.abs(np.fft.rfft(z, axis=0)) ** 2).mean(1)
    tot = P.sum() + 1e-12
    for lo, hi in FREQ_BANDS:
        out[f"{tag}_bE_{lo}"] = P[(freqs >= lo) & (freqs < hi)].sum() / tot

    if v_ms > 1:   # wavelength only means something when the train is moving
        lam_mm = v_ms / np.clip(freqs, 1e-9, None) * 1000
        for lo, hi in WAVELENGTH_BANDS_MM:
            out[f"{tag}_lam_{lo}"] = P[(lam_mm >= lo) & (lam_mm < hi)].sum() / tot
    else:
        for lo, _ in WAVELENGTH_BANDS_MM:
            out[f"{tag}_lam_{lo}"] = np.nan


def featurize(path) -> pd.Series:
    """path: a CSV file or a DataFrame with the same 129 columns.
    ~0.3 s per file; all 272 training files extract in a few minutes."""
    df = pd.read_csv(path, dtype=np.float32) if isinstance(path, str) else path.astype(np.float32)
    groups = _channel_groups(list(df.columns))
    a = df.to_numpy()
    v_ms = speed_kmh(a[:, 0]) / 3.6
    freqs = np.fft.rfftfreq(a.shape[0], 1 / FS)

    out = {"speed": v_ms * 3.6}
    for tag, cols in groups.items():
        _side_features(a[:, cols], tag, v_ms, out, freqs)
    _wheel_features(a, groups, out)
    return pd.Series(out)


def _wheel_features(a: np.ndarray, groups: dict, out: dict) -> None:
    """Loudest-axle-box statistics per side. Corrugation shows up as a few very
    loud axle boxes on the affected side, which side-averaged features dilute
    (median-over-wheels contrasts scored 0.46 macro F1 in CV)."""
    def log_rms(cols):
        return np.log10(np.sqrt((a[:, cols].astype(np.float64) ** 2).mean(0)) + 1e-9)
    for kind, (key_i, key_ii) in {"vib": ("I", "II"), "shk": ("sI", "sII")}.items():
        file_med = np.median(np.concatenate([log_rms(groups[key_i]), log_rms(groups[key_ii])]))
        for side, key in (("I", key_i), ("II", key_ii)):
            v = np.sort(log_rms(groups[key]))
            out[f"{side}_{kind}_wheel_max"] = v[-1]
            out[f"{side}_{kind}_wheel_top3"] = v[-3:].mean()
            out[f"{side}_{kind}_wheel_med"] = np.median(v)
            out[f"{side}_{kind}_wheel_excess"] = v[-1] - file_med


def swap_sides(F: pd.DataFrame) -> pd.DataFrame:
    """The same recording with Side I and Side II exchanged: every I_/sI_ feature
    swaps with its II_/sII_ twin. Used to augment training data, because a
    Side I corrugation seen from the mirrored side is a valid Side II example."""
    def twin(c):
        for a, b in (("sII_", "sI_"), ("sI_", "sII_"), ("II_", "I_"), ("I_", "II_")):
            if c.startswith(a):
                return b + c[len(a):]
        return c
    return F.rename(columns={c: twin(c) for c in F.columns})[list(F.columns)]


MIRROR = {"Normal": "Normal", "Side I": "Side II", "Side II": "Side I"}


def augment(F: pd.DataFrame, y) -> tuple[pd.DataFrame, np.ndarray]:
    """Training set plus a side-swapped copy of every corrugated recording."""
    y = np.asarray(y)
    fault = y != "Normal"
    S = swap_sides(F[fault])
    return (pd.concat([F, S], ignore_index=True),
            np.concatenate([y, [MIRROR[v] for v in y[fault]]]))


def make_model():
    """Soft vote of three different learners. Averaging their class
    probabilities was the only change that beat the single gradient-boosted
    model consistently in cross-validation."""
    from sklearn.ensemble import HistGradientBoostingClassifier, VotingClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.svm import SVC
    return VotingClassifier([
        ("hgb", HistGradientBoostingClassifier(max_iter=300, class_weight="balanced", random_state=0)),
        ("svm", make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                              SVC(C=3, class_weight="balanced", probability=True, random_state=0))),
        ("lr", make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                             LogisticRegression(C=0.1, class_weight="balanced", max_iter=5000))),
    ], voting="soft")


def predict(path) -> dict:
    """path: a CSV file or a DataFrame with the same 129 columns."""
    global _M
    if _M is None:
        import joblib
        _M = joblib.load(MODEL_PATH)
    model, feature_names = _M["model"], _M["features"]

    f = featurize(path)
    X = f.reindex(feature_names).to_frame().T
    label = model.predict(X)[0]
    proba = dict(zip(model.classes_, model.predict_proba(X)[0]))

    ratio = float(f["I_rms"] / (f["II_rms"] + 1e-12))
    return {
        "prediction": str(label),
        "detail": {
            "confidence": {k: round(float(v), 4) for k, v in
                           sorted(proba.items(), key=lambda kv: -kv[1])},
            "speed_kmh": round(float(f["speed"]), 1),
            "side_I_rms": round(float(f["I_rms"]), 5),
            "side_II_rms": round(float(f["II_rms"]), 5),
            "side_I_over_II": round(ratio, 3),
            "stationary": bool(f["speed"] < 5),
            **_evidence(_M["reference"], f, str(label), proba),
            "urgency": vibration_urgency(_M["reference"], f, str(label)),
            "note": ("Side I vibration is higher" if ratio > 1.05 else
                     "Side II vibration is higher" if ratio < 0.95 else
                     "Both sides comparable") +
                    f"; recording at {f['speed']:.0f} km/h.",
        },
    }


def reference_stats(F: pd.DataFrame, y) -> dict:
    """Speed and evidence features of the Normal training recordings; saved
    with the model so each prediction can be compared with them."""
    N = F[np.asarray(y) == "Normal"]
    return {"normal_speed": [round(float(v), 3) for v in N["speed"]],
            "normal": {c: [round(float(v), 6) for v in N[c]] for c in EVIDENCE_FEATURES},
            "speed_range_kmh": [round(float(F["speed"].min()), 1), round(float(F["speed"].max()), 1)]}


def _speed_matched_share(ref: dict, col: str, value: float, speed: float) -> float:
    """Share of the Normal training recordings closest in speed that are below
    `value`. Vibration rises with speed (r = 0.85 on Normal files), so the
    comparison is made at similar speed."""
    idx = np.argsort(np.abs(np.asarray(ref["normal_speed"]) - speed))[:SPEED_NEIGHBOURS]
    return float((np.asarray(ref["normal"][col])[idx] < value).mean())


def _evidence(ref: dict, f: pd.Series, label: str, proba: dict) -> dict:
    """Findings measured against the Normal training recordings, plus a priority."""
    probs = ", ".join(f"{k} {v:.0%}" for k, v in sorted(proba.items(), key=lambda kv: -kv[1]))
    ev = [f"Model probabilities: {probs}."]
    for side in (["I", "II"] if label == "Normal" else [label.split()[-1]]):
        box = _speed_matched_share(ref, f"{side}_vib_wheel_max", f[f"{side}_vib_wheel_max"], f["speed"])
        avg = _speed_matched_share(ref, f"{side}_rms", f[f"{side}_rms"], f["speed"])
        share = lambda v: "all" if v >= 1 else f"{v:.0%}"
        ev.append(f"Side {side}: loudest axle box above {share(box)} of the {SPEED_NEIGHBOURS} "
                  f"Normal training recordings closest in speed; side average above "
                  f"{share(avg)} of them.")
    lo, hi = ref["speed_range_kmh"]
    stationary = f["speed"] < 5
    ev.append(f"Recorded at {f['speed']:.0f} km/h (training recordings: {lo:.0f} to {hi:.0f} km/h)."
              + (" The train is (nearly) stationary, so the spectral evidence is unreliable."
                 if stationary else ""))

    p = float(proba[label])
    p_corr = 1 - float(proba.get("Normal", 0.0))
    if label != "Normal" and p >= 0.7:
        priority, reason = "high", f"Corrugation on {label} with {p:.0%} model probability."
    elif label != "Normal":
        priority, reason = "medium", (f"Corrugation on {label} with only {p:.0%} model "
                                      "probability: confirm with a track inspection.")
    elif p_corr >= 0.3:
        priority, reason = "medium", (f"Predicted Normal, but {p_corr:.0%} probability of "
                                      "corrugation: borderline, re-check on the next run.")
    else:
        priority, reason = "low", f"Predicted Normal with {p:.0%} model probability."
    if stationary and priority == "high":
        priority, reason = "medium", reason + " Re-record while moving to confirm."
    return {"evidence": ev, "priority": priority, "priority_reason": reason}


def vibration_urgency(ref: dict, f: pd.Series, label: str) -> dict:
    """How far the loudest axle box is above normal recordings at similar speed
    (median of the SPEED_NEIGHBOURS closest Normal training recordings); the
    alert level is the level 95% of those recordings stay below. Not given for
    a (nearly) stationary train: those recordings are all at the noise floor,
    so the alert level collapses to about 1% and would overstate urgency."""
    if f["speed"] < 5:
        return urgency("normal", "loudest axle box vs normal recordings at similar speed",
                       "vibration RMS", None, None, None, 0.0,
                       "Not available: the train is (nearly) stationary, so vibration "
                       "levels say nothing about the rail.")
    idx = np.argsort(np.abs(np.asarray(ref["normal_speed"]) - f["speed"]))[:SPEED_NEIGHBOURS]
    rows = {}
    for side in ("I", "II"):
        vals = np.asarray(ref["normal"][f"{side}_vib_wheel_max"])[idx]      # log10 RMS
        med, p95 = np.median(vals), np.percentile(vals, 95)
        rows[side] = (10 ** med, 10 ** f[f"{side}_vib_wheel_max"],
                      (10 ** (f[f"{side}_vib_wheel_max"] - med) - 1) * 100, (10 ** (p95 - med) - 1) * 100)
    side = label.split()[-1] if label != "Normal" else max(rows, key=lambda s: rows[s][2] / rows[s][3])
    normal, value, pct, thr = rows[side]
    word = "above" if pct >= 0 else "below"
    return urgency("normal", f"loudest Side {side} axle box vs normal recordings at similar speed",
                   "vibration RMS", normal, value, pct, thr,
                   f"Side {side} loudest axle box {abs(pct):.0f}% {word} normal for this speed; "
                   f"alert at {thr:.0f}% above ({pct / thr:.1f}x the alert level)")
