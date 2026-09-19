"""ACV: identify which car has the refrigerant leak, as a ranked list.

A refrigerant leak means lost cooling capacity, so the leaking car's cabin runs
warmer than the other cars of the same train under the same ambient and duty
cycle. Every feature is therefore measured against the other cars at the same
timestamp, which cancels ambient temperature, time of day and route.

Model: logistic regression (make_model) that scores each car from four
temperature features, z-scored across the cars of the file:
  dev            mean of (car indoor temp - median indoor temp of all cars)
  dev_hot        the same, over the hotter half of the recording only
  warmest_share  share of timestamps at which the car is the warmest
  dev_setpoint   mean of (indoor temp - setpoint), relative to the other cars
fit_acv.py trains it on the 6 labelled cases (48 cars, 6 of them leaking).
Exactly one car leaks per file, so each car's probability is normalised
across the cars of the file and the cars are ranked by it.

Leave-one-case-out rank decay: 0.979 (true car 1st in five cases, 2nd in case
04). The physics score `dev` on its own also scores 0.979; it is still
computed for every file and returned in `detail` as a cross-check. Adding the
other logged signals (cooling mode, load halving, manual control, spread)
lowered the model to 0.958, so they are not used.

Caveat for the write-up: six cases is very little, which the ACV Info Kit
itself names as the core difficulty. Two of the six physics margins are thin
(0.018 C and 0.085 C), so expect 0.88-1.00 on a single held-out file rather
than 0.979.
"""
import os
import re

import numpy as np
import pandas as pd

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model_acv.joblib")
FEATURES = ["dev", "dev_hot", "warmest_share", "dev_setpoint"]
CAR_COL = re.compile(r"^Car (\d{2}) - (.+)$")
_M = None

# case_04 uses a different vocabulary for the same quantities
ALIAS = {
    "Passenger Cabin Temperature Detected Value": "Indoor Average Temperature",
    "Outside Temperature Sensor Reading": "Outdoor Average Temperature",
    "Target Temperature Value": "ACV Control Temperature (Cooling)",
}


def read(path: str) -> pd.DataFrame:
    """Reads a case workbook. python-calamine is about 9x faster than openpyxl
    on these files; if it is not installed, pandas' default reader is used."""
    try:
        return pd.read_excel(path, engine="calamine")
    except (ImportError, ValueError):
        return pd.read_excel(path)


def _model() -> dict:
    global _M
    if _M is None:
        import joblib
        _M = joblib.load(MODEL_PATH)
    return _M


def _wide(df: pd.DataFrame, param: str) -> pd.DataFrame | None:
    cols = {}
    for c in df.columns:
        m = CAR_COL.match(c)
        if m and ALIAS.get(m.group(2), m.group(2)) == param:
            cols[m.group(1)] = df[c]
    if not cols:
        return None
    return pd.DataFrame(cols)[sorted(cols)]


def _num(x: pd.DataFrame | None) -> pd.DataFrame | None:
    """Numeric values; empty cells and 0 readings (sensor dropouts) become NaN
    and are skipped by every mean and median below."""
    return None if x is None else x.apply(pd.to_numeric, errors="coerce").replace(0, np.nan)


def car_features(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """-> (model inputs, one row per car, z-scored across the cars of this
    file; physics score per car in degC)."""
    I = _num(_wide(df, "Indoor Average Temperature"))
    if I is None:
        raise ValueError("no per-car indoor temperature column found")
    med = I.median(axis=1)
    D = I.sub(med, axis=0)

    f = pd.DataFrame(index=I.columns)
    f["dev"] = D.mean()
    f["dev_hot"] = D[med >= med.median()].mean()
    f["warmest_share"] = (I.eq(I.max(axis=1), axis=0) & I.notna()).mean()
    T = _num(_wide(df, "ACV Control Temperature (Cooling)"))
    if T is not None:
        G = I - T
        f["dev_setpoint"] = G.sub(G.median(axis=1), axis=0).mean()

    z = (f - f.mean()) / f.std().replace(0, np.nan)
    return z.reindex(columns=FEATURES).fillna(0.0), f["dev"]


def make_model():
    """Logistic regression on the four z-scored features; balanced class
    weights because only 1 car in 8 leaks."""
    from sklearn.linear_model import LogisticRegression
    return LogisticRegression(C=0.5, class_weight="balanced", max_iter=5000)


def car_probabilities(model, X: pd.DataFrame) -> pd.Series:
    """Model probability per car, normalised so the cars of one file sum to 1
    (exactly one car leaks: P(car i) is proportional to p_i / (1 - p_i))."""
    p = pd.Series(model.predict_proba(X)[:, 1], index=X.index).clip(1e-9, 1 - 1e-9)
    odds = p / (1 - p)
    return odds / odds.sum()


def predict(path: str) -> dict:
    df = read(path) if isinstance(path, str) else path
    M = _model()
    X, physics = car_features(df)
    prob = car_probabilities(M["model"], X[M["features"]])

    # manual control by the crew is a corroborating signal only, shown in the UI
    setm = _wide(df, "ACV Setting Mode")
    manual = (setm.astype(str) == "Manual Control").mean() if setm is not None \
        else pd.Series(0.0, index=physics.index)

    order = pd.DataFrame({"prob": prob, "dev": physics,
                          "manual": manual.reindex(physics.index).fillna(0)})
    order = order.sort_values(["prob", "dev"], ascending=False)
    ranked = list(order.index)
    top = ranked[0]

    # physics cross-check: how much warmer the top car runs than the warmest other car
    others = order["dev"].drop(top)
    margin = float(order.at[top, "dev"] - others.max()) if len(others) else np.nan
    physics_top = str(order["dev"].idxmax())
    p_top = float(order.at[top, "prob"])
    confidence = "high" if p_top >= 0.8 else "medium" if p_top >= 0.5 else "low"

    ev = _evidence(M["reference"], top, order, physics_top, margin)
    return {
        "ranked_cars": "|".join(ranked),
        "prediction": top,
        "detail": {
            "model": "logistic regression on 4 cabin-temperature features, trained on 6 cases",
            "probability": {c: round(float(v), 4) for c, v in order["prob"].items()},
            "scores_degC": {c: round(float(v), 4) for c, v in order["dev"].items()},
            "margin_over_runner_up_degC": round(margin, 4),
            "physics_top_car": physics_top,
            "physics_agrees": physics_top == top,
            "confidence": confidence,
            "manual_control_fraction": {c: round(float(v), 3)
                                        for c, v in order["manual"].items()},
            **ev,
            "note": f"Car {top} is the most likely leak ({p_top:.0%} model "
                    f"probability). Its cabin runs {order.at[top, 'dev']:.3f} C "
                    "warmer than the train median, consistent with reduced "
                    "cooling capacity from a refrigerant leak.",
        },
    }


def _evidence(ref: dict, top: str, order: pd.DataFrame, physics_top: str,
              margin: float) -> dict:
    """Findings measured against the six training cases, plus a priority."""
    dev = float(order.at[top, "dev"])
    lo, hi = ref["leak_dev_degC_min"], ref["leak_dev_degC_max"]
    normal_max = ref["normal_dev_degC_max"]
    p_top = float(order.at[top, "prob"])

    ev = [
        f"Car {top} runs {dev:.3f} C warmer than the median of all cars; the "
        f"leaking cars in the 6 training cases ran {lo:.3f} to {hi:.3f} C warmer, "
        f"and no normal car ran more than {normal_max:.3f} C warmer.",
        f"Model probability that car {top} is the leaking car: {p_top:.0%} "
        f"(next: car {order.index[1]}, {float(order['prob'].iloc[1]):.0%}).",
        f"Physics cross-check: the warmest car relative to the others is car "
        f"{physics_top}" + (" (agrees)." if physics_top == top else
                            f" (disagrees; car {top} is {-margin:.3f} C cooler than it)."),
    ]
    if dev >= normal_max and physics_top == top:
        priority = "high"
        reason = ("Car temperature excess is above every normal car in training "
                  "and the physics cross-check agrees.")
    elif dev >= normal_max or physics_top == top:
        priority = "medium"
        reason = ("Leak signature present but not conclusive: "
                  + ("the physics cross-check disagrees." if physics_top != top else
                     "the excess is within the range seen on normal cars."))
    else:
        priority = "low"
        reason = ("No car stands out beyond the range of normal cars and the "
                  "physics cross-check disagrees; check the temperature sensors "
                  "and setpoints before inspecting.")
    return {"evidence": ev, "priority": priority, "priority_reason": reason}
