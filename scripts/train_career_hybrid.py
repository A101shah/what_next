"""Train a PCA → K-Means distance features → Neural Network model on original OECD data.

Put the original, private 6517-row dataset at out/WhatNext_Career_Intelligence_Combined.csv.
Run: python -m scripts.train_career_hybrid
PCA, K-Means, imputer, scalers, and MLP are fitted ONLY using training data.
Inner validation chooses 3/5/7 PCA components and 2/4/6 clusters.
This predicts occupation families, NEVER the best next learning topic.
"""
import base64
import csv
import json
from pathlib import Path

import numpy as np
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "out" / "WhatNext_Career_Intelligence_Combined.csv"
OUTPUT = ROOT / "data" / "career_hybrid_nn.json"
REPORT = ROOT / "data" / "career_hybrid_experiment.json"
SKILLS = ("ict", "numeracy", "reading", "writing", "learning", "influence", "task_discretion")


def finite(raw):
    try:
        x = float(raw)
        return x if np.isfinite(x) else None
    except (ValueError, TypeError):
        return None


def row_vector(row):
    features = []
    for key in SKILLS:
        value = finite(row.get("skill_use_" + key + "_band_0to5"))
        features.append(value if value in (0, 1, 2, 3, 4, 5) else np.nan)
    years = finite(row.get("lifetime_paid_work_years_topcoded_at_47"))
    features.append(years if years is not None and 0 <= years <= 47 else np.nan)
    level = str(row.get("education_level_code") or "").strip()
    features.extend(float(level == str(i)) for i in (1, 2, 3))
    field = str(row.get("highest_education_field_code") or "").strip()
    features.extend(float(field == str(i)) for i in range(1, 17))
    return features



def prepare(train, other, components, clusters):
    imp = SimpleImputer(strategy="median", keep_empty_features=True).fit(train)
    std = StandardScaler().fit(imp.transform(train))
    ztr = std.transform(imp.transform(train))
    zev = std.transform(imp.transform(other))
    # PCA is used only on seven numerical skill-use bands plus work years.
    pca = PCA(n_components=components, svd_solver="full", random_state=42).fit(ztr[:, :8])
    ptr, pev = pca.transform(ztr[:, :8]), pca.transform(zev[:, :8])
    km = KMeans(n_clusters=clusters, n_init=15, random_state=42).fit(ptr)
    distances = StandardScaler().fit(km.transform(ptr))
    return (np.column_stack((ztr, distances.transform(km.transform(ptr)))),
            np.column_stack((zev, distances.transform(km.transform(pev)))),
            (imp, std, pca, km, distances))

def train_nn(x, y):
    from warnings import catch_warnings, simplefilter
    network = MLPClassifier(hidden_layer_sizes=(20, 12), activation="relu",
        alpha=1.0, early_stopping=True, validation_fraction=0.15,
        n_iter_no_change=22, max_iter=330, learning_rate_init=0.001,
        random_state=42)
    with catch_warnings():
        simplefilter("ignore", category=UserWarning)
        network.fit(x, y)
    return network

def scores(y, prediction):
    return {
      "accuracy": round(float(accuracy_score(y, prediction)), 5),
      "macro_f1": round(float(f1_score(y, prediction, average="macro", zero_division=0)), 5),
      "balanced_accuracy": round(float(balanced_accuracy_score(y, prediction)), 5)
    }

def pack(array):
    quant = np.rint(np.asarray(array) * 1000)
    if np.max(np.abs(quant)) > 32767:
        raise ValueError("MLP weights exceed safe int16 quantization range")
    return base64.b64encode(quant.astype("<i2").tobytes()).decode("ascii")

def main():
    with SOURCE.open(encoding="utf-8-sig", newline="") as file:
        rows = list(csv.DictReader(file))
    if len(rows) < 6000:
        raise ValueError("Original respondent dataset is missing or incomplete")
    x = np.array([row_vector(r) for r in rows], dtype=float)
    y = np.array([int(r["occupation_isco08_2digit"]) for r in rows])
    if x.shape[1] != 27 or len(np.unique(y)) != 12:
        raise ValueError("Original dataset has an unexpected classification schema")
    train, test = train_test_split(np.arange(len(y)), test_size=.2,
                                   stratify=y, random_state=42)
    subtrain, validation = train_test_split(train, test_size=.22,
                                           stratify=y[train], random_state=104)
    candidates = []
    for pcs in (3, 5, 7):
        for k in (2, 4, 6):
            inner_tr, inner_val, _ = prepare(x[subtrain], x[validation], pcs, k)
            nn = train_nn(inner_tr, y[subtrain])
            candidates.append({"components": pcs, "clusters": k,
                               "validation": scores(y[validation], nn.predict(inner_val))})
    selected = max(candidates, key=lambda r:
                   (r["validation"]["macro_f1"], r["validation"]["accuracy"]))

    # Refit all preprocessing and the MLP on all 5,213 training observations.
    xtr, xte, (imp, std, pca, km, dsc) = prepare(
        x[train], x[test], selected["components"], selected["clusters"])
    nn = train_nn(xtr, y[train])
    float_scores = scores(y[test], nn.predict(xte))

    # Reconstruct the exact serialized int16 model on the untouched test rows.
    weights = [np.rint(w*1000).astype("<i2").astype(float)/1000 for w in nn.coefs_]
    biases = [np.rint(b*1000).astype("<i2").astype(float)/1000 for b in nn.intercepts_]
    features = xte.copy()
    for w, b in zip(weights[:-1], biases[:-1]):
        features = np.maximum(0, features@w + b)
    features = features@weights[-1] + biases[-1]
    quant_scores = scores(y[test], nn.classes_[features.argmax(axis=1)])
    if abs(quant_scores["accuracy"] - float_scores["accuracy"]) > .01:
        raise ValueError("Quantized model does not match original NN accuracy")

    # Reference baseline trained on the same data and split.
    baseline_imp = SimpleImputer(strategy="median", keep_empty_features=True).fit(x[train])
    baseline_std = StandardScaler().fit(baseline_imp.transform(x[train]))
    baseline_nn = train_nn(baseline_std.transform(baseline_imp.transform(x[train])), y[train])
    baseline_scores = scores(y[test],
        baseline_nn.predict(baseline_std.transform(baseline_imp.transform(x[test]))))
    raw_features = ([f"skill_use_{k}_band_0to5" for k in SKILLS] +
        ["lifetime_paid_work_years_topcoded_at_47"] +
        [f"education_level_{i}" for i in (1,2,3)] +
        [f"education_field_code_{i}" for i in range(1,17)])
    payload = {
      "version":2, "model_type":"PCA_KMEANS_DISTANCE_FEATURES_MLP",
      "task":"12 broad occupational classes; NOT prediction of next learning topic",
      "source":"OECD PIAAC Cycle 2, 2023, anonymized original respondents",
      "samples":len(rows),"training_samples":len(train),"test_samples":len(test),
      "classes":nn.classes_.astype(int).tolist(),"input_features":raw_features,
      "prep":{"median":imp.statistics_.round(9).tolist(),
        "mean":std.mean_.round(9).tolist(),"scale":std.scale_.round(9).tolist()},
      "pca":{"input_columns":list(range(8)),"components":pca.components_.round(9).tolist(),
        "mean":pca.mean_.round(9).tolist(),"n_components":selected["components"],
        "explained_variance":round(float(pca.explained_variance_ratio_.sum()),7)},
      "kmeans":{"centers":km.cluster_centers_.round(9).tolist(),"n_clusters":selected["clusters"],
        "distance_mean":dsc.mean_.round(9).tolist(),"distance_scale":dsc.scale_.round(9).tolist(),
        "feature_type":"standardized_distance_to_each_centroid"},
      "nn":{"shape":[xtr.shape[1],20,12,len(nn.classes_)],"quantization":1000,
        "weights":[pack(w) for w in nn.coefs_],"biases":[pack(b) for b in nn.intercepts_],
        "hidden":"relu","output":"softmax"},
      "metrics":{"accuracy":quant_scores["accuracy"],"macro_f1":quant_scores["macro_f1"],
        "balanced_accuracy":quant_scores["balanced_accuracy"],
        "reference_mlp_accuracy":baseline_scores["accuracy"],
        "train_size":len(train),"test_size":len(test),
        "split":"Stratified 80/20 seed 42; internal 22% validation seed 104; train-only preprocessing",
        "interpretation":"Occupation family classification, NOT learning recommendations; same historical test set is not independent external validation."},
      "limitations":["Original workforce survey, not student learning outcomes",
        "PCA retains high-variance directions, not guaranteed predictive features",
        "K-Means clusters are feature-engineering groups, not validated careers",
        "Scores are uncalibrated; random heldout does not prove cross-country generalization"]
    }
    report={"dataset_rows":len(rows),"train_rows":len(train),"test_rows":len(test),
      "baseline":baseline_scores,"candidates":candidates,"selected":selected,
      "hybrid_float":float_scores,"hybrid_quantized":quant_scores,
      "hybrid_pca_explained_variance":payload["pca"]["explained_variance"],
      "production_recommended":quant_scores["accuracy"]>=baseline_scores["accuracy"]
                             and quant_scores["macro_f1"]>=baseline_scores["macro_f1"]}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload,separators=(",",":"))+"\n",encoding="utf-8")
    REPORT.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2))
if __name__ == "__main__":
    main()
