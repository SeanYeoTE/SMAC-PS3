"""Fits the ACV car ranker on the labelled cases -> ps3/model_acv.joblib.

    python fit_acv.py <ACV dataset folder>     (the folder holding Train/ and Train_Labels.csv)

Prints leave-one-case-out rank decay for the model and for the physics score
(0.979 for both on the six cases). Rerun it as more labelled fault cases
become available; the model is the part that improves with more cases."""
import os, sys
import joblib, numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ps3 import acv


def rank_decay(order, truth):
    return (len(order) - order.index(truth)) / len(order)


def main(root):
    lab = pd.read_csv(os.path.join(root, "Train_Labels.csv"), dtype=str)
    cases = []
    for f, car in zip(lab["filename"], lab["faulty_car"]):
        X, raw = acv.car_features(acv.read(os.path.join(root, "Train", f)))
        cases.append((f, X, raw, car))
    stack = lambda cs: (pd.concat([X for _, X, _, _ in cs]),
                        np.concatenate([(X.index == car).astype(int) for _, X, _, car in cs]))

    print("leave-one-case-out:")
    s_model, s_phys = [], []
    for i, (f, X, dev, car) in enumerate(cases):
        Xtr, ytr = stack(cases[:i] + cases[i + 1:])
        prob = acv.car_probabilities(acv.make_model().fit(Xtr, ytr), X).sort_values(ascending=False)
        s_model.append(rank_decay(list(prob.index), car))
        s_phys.append(rank_decay(list(dev["dev"].sort_values(ascending=False).index), car))
        print(f"  {f}: leaking car {car} ranked {list(prob.index).index(car) + 1} "
              f"(model p={prob[car]:.2f}, top p={prob.iloc[0]:.2f})")
    print(f"rank decay: model {np.mean(s_model):.3f}   physics score {np.mean(s_phys):.3f}")

    Xall, yall = stack(cases)
    model = acv.make_model().fit(Xall, yall)
    print("weights:", {k: round(float(w), 3) for k, w in zip(acv.FEATURES, model.coef_[0])})

    reference = {"n_cases": len(cases)}
    for col, key in (("dev", "dev"), ("dev_outdoor_hot", "hot")):
        leak = pd.Series([raw.at[car, col] for _, _, raw, car in cases]).dropna()
        normal = pd.concat([raw[col].drop(car) for _, _, raw, car in cases]).dropna()
        reference.update({f"leak_{key}_degC_min": round(float(leak.min()), 4),
                          f"leak_{key}_degC_max": round(float(leak.max()), 4),
                          f"normal_{key}_degC_max": round(float(normal.max()), 4)})
    print("reference:", reference)
    joblib.dump({"model": model, "features": acv.FEATURES, "reference": reference},
                acv.MODEL_PATH)
    print("saved", acv.MODEL_PATH)


if __name__ == "__main__":
    main(sys.argv[1])
