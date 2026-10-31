"""Offline reproducible train/test experiment for the WhatNext career NN.

Train this MODEL from the authentic, de-identified 47-column OECD PIAAC CSV.
This task predicts broad occupational family, NOT which lesson helps a student
learn best. We deliberately do not use occupation codes, O*NET targets, peer
group means, respondent IDs, or other target-leaking columns as predictors.

1. Place your downloaded CSV at out/WhatNext_Career_Intelligence_Combined.csv
2. pip install -r requirements.txt
3. python -m scripts.train_career_nn
4. Verify the metrics before committing data/career_nn.json

Training is offline; NO GitHub Actions or deployed inference server.
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

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "out" / "WhatNext_Career_Intelligence_Combined.csv"
OUTPUT = ROOT / "data" / "career_nn.json"
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


def main():
    with SOURCE.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    if len(rows) < 5000:
        raise RuntimeError("Too few original observations; refusing to train.")
    labels = np.array([int(row["occupation_isco08_2digit"]) for row in rows])
    X = np.asarray([row_vector(row) for row in rows], dtype=float)
    idx = np.arange(len(labels))
    train_idx, test_idx = train_test_split(
        idx, test_size=0.2, stratify=labels, random_state=42
    )
    x_train, x_test = X[train_idx].copy(), X[test_idx].copy()
    medians = np.nanmedian(x_train, axis=0)
    x_train = np.where(np.isfinite(x_train), x_train, medians)
    x_test = np.where(np.isfinite(x_test), x_test, medians)
    scaler = StandardScaler()
    x_train = scaler.fit_transform(x_train)
    x_test = scaler.transform(x_test)

    network = MLPClassifier(
        hidden_layer_sizes=(20, 12), activation="relu", alpha=1.0,
        early_stopping=True, validation_fraction=0.15, n_iter_no_change=22,
        max_iter=400, learning_rate_init=0.001, random_state=42
    )
    network.fit(x_train, labels[train_idx])
    test_predictions = network.predict(x_test)
    majority_baseline = np.unique(labels, return_counts=True)[1].max() / len(labels)
    metric = {
        "split": "Stratified random 80/20, random_state 42. All imputers and scalers trained on train only; internal early stopping uses 15% of training subset.",
        "accuracy": round(float(accuracy_score(labels[test_idx], test_predictions)), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(labels[test_idx], test_predictions)), 4),
        "macro_f1": round(float(f1_score(labels[test_idx], test_predictions, average="macro", zero_division=0)), 4),
        "majority_baseline_accuracy": round(float(majority_baseline), 4),
        "train_size": len(train_idx), "test_size": len(test_idx),
        "interpretation": "Occupation-label classification only. Not next-lesson recommendation accuracy or individual aptitude."
    }

    # Quantize weights for small static/browser model; verify resulting predictions
    # on exactly the held-out test set after quantization.
    factor = 1000
    def pack(arr):
        as_int = np.rint(np.asarray(arr) * factor).astype("<i2")
        return base64.b64encode(as_int.tobytes()).decode("ascii")
    weight_arrays = [np.rint(arr * factor).astype("<i2").astype(float) / factor for arr in network.coefs_]
    bias_arrays = [np.rint(arr * factor).astype("<i2").astype(float) / factor for arr in network.intercepts_]
    activations = x_test.copy()
    for w, b in zip(weight_arrays[:-1], bias_arrays[:-1]):
        activations = np.maximum(0, activations @ w + b)
    activations = activations @ weight_arrays[-1] + bias_arrays[-1]
    quant_labels = network.classes_[np.argmax(activations, axis=1)]
    quant_accuracy = accuracy_score(labels[test_idx], quant_labels)
    if abs(quant_accuracy - metric["accuracy"]) > 0.01:
        raise RuntimeError("Quantization changed holdout accuracy too much.")
    labels_txt = [f"skill_use_{s}_band_0to5" for s in SKILLS]
    labels_txt += ["lifetime_paid_work_years_topcoded_at_47"]
    labels_txt += [f"education_level_{i}" for i in (1, 2, 3)]
    labels_txt += [f"education_field_code_{i}" for i in range(1, 17)]
    payload = {
        "version": 1,
        "task": "Broad occupation-family classification; not next-lesson prediction",
        "source": "OECD PIAAC Cycle 2 2023 public-use anonymized respondents",
        "samples": len(rows), "training_samples": len(train_idx),
        "test_samples": len(test_idx), "classes": network.classes_.tolist(),
        "input_features": labels_txt,
        "prep": {
            "median": np.round(medians, 5).tolist(),
            "mean": np.round(scaler.mean_, 5).tolist(),
            "scale": np.round(scaler.scale_, 5).tolist()
        },
        "nn": {
            "shape": [27, 20, 12, len(network.classes_)],
            "quantization": factor,
            "weights": [pack(arr) for arr in network.coefs_],
            "biases": [pack(arr) for arr in network.intercepts_],
            "hidden": "relu", "output": "softmax"
        },
        "metrics": metric,
        "limitations": [
            "Responses reflect employed adults, not student outcomes",
            "Input responses are approximate self-reports, not a calibrated PIAAC test",
            "No individual job seniority labels, no causal skill recommendations, no employment likelihood predictions",
            "Multiple target careers map to a broad two-digit occupation family; model cannot distinguish AI/ML from cyber/cloud",
            "Validation is random holdout, not external-country generalization and may be optimistic."
        ]
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print("NEURAL_NETWORK_TRAINED", metric)
    print("BROWSER_QUANTIZED_TEST_ACCURACY", round(float(quant_accuracy), 4))
    print("MODEL_SAVED", OUTPUT)


if __name__ == "__main__":
    main()
