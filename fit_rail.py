"""Extracts features from the Rail training files and fits the classifier
(soft vote of gradient boosting, RBF-SVM and logistic regression, see
rail.make_model) -> ps3/model_rail.joblib, together with the Normal training
recordings' reference values used for the evidence in `detail`.  ~3 min for 272 files."""
import sys, os, time
import numpy as np, pandas as pd, joblib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ps3 import rail
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import f1_score, classification_report

def main(train_dir, labels_csv, cache="rail_feats_v2.pkl"):
    lab = pd.read_csv(labels_csv)
    if os.path.exists(cache):
        F = pd.read_pickle(cache); print(f"loaded cached features {F.shape}")
    else:
        t0 = time.time(); rows = []
        for i, r in lab.iterrows():
            rows.append(rail.featurize(os.path.join(train_dir, r.filename)))
            if i % 40 == 0: print(f"  {i}/{len(lab)}  {time.time()-t0:.0f}s", flush=True)
        F = pd.DataFrame(rows); F.to_pickle(cache)
    X = F.drop(columns=[c for c in ("filename", "label") if c in F.columns])
    X = X[sorted(X.columns)]
    y = lab["label"].to_numpy()
    # 5-fold CV; each training fold gets side-swapped copies of its corrugated
    # recordings (rail.augment), each test fold is scored on the originals only
    p = np.empty(len(y), dtype=object)
    for tr, te in StratifiedKFold(5, shuffle=True, random_state=0).split(X, y):
        p[te] = rail.make_model().fit(*rail.augment(X.iloc[tr], y[tr])).predict(X.iloc[te])
    print(f"\nCV macro F1 = {f1_score(y, p, average='macro'):.4f}")
    print(classification_report(y, p, digits=3))
    m = rail.make_model().fit(*rail.augment(X, y))
    joblib.dump({"model": m, "features": list(X.columns),
                 "reference": rail.reference_stats(X, y)}, rail.MODEL_PATH)
    print("saved", rail.MODEL_PATH)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
