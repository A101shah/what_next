"""Rebuild the actual WhatNext CatBoost classifier from genuine OECD PIAAC data.

OFFLINE ONLY. No GitHub Actions, hosted runtime, or respondent export.

1. Download the verified anonymized 47-column CSV into
   out/WhatNext_Career_Intelligence_Combined.csv
2. pip install -r requirements.txt
3. python -m scripts.train_catboost
4. Review the metrics and commit only data/career_catboost.json

This *classifies broad current occupational families*. It does NOT learn
which educational intervention is causally best for a student.
"""
import base64
import csv
import json
import math
from pathlib import Path

import numpy as np
from catboost import CatBoostClassifier
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score
from sklearn.model_selection import StratifiedKFold, train_test_split

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"out"/"WhatNext_Career_Intelligence_Combined.csv"
OUTPUT=ROOT/"data"/"career_catboost.json"
SKILLS=("ict","numeracy","reading","writing","learning","influence","task_discretion")
FEATURES=([f"skill_use_{skill}_band_0to5" for skill in SKILLS]
          +["lifetime_paid_work_years_topcoded_at_47"]
          +[f"education_level_{n}" for n in range(1,4)]
          +[f"education_field_code_{n}" for n in range(1,17)])
PARAMS=dict(depth=5,learning_rate=.05,l2_leaf_reg=5,loss_function="MultiClass",
            thread_count=4,random_seed=42,verbose=False,allow_writing_files=False)


def valid_number(raw):
    try:
        number=float(raw)
        return number if math.isfinite(number) else np.nan
    except (ValueError,TypeError):
        return np.nan


def features(row):
    output=[]
    for skill in SKILLS:
        value=valid_number(row.get("skill_use_"+skill+"_band_0to5"))
        output.append(value if value in (0,1,2,3,4,5) else np.nan)
    years=valid_number(row.get("lifetime_paid_work_years_topcoded_at_47"))
    output.append(years if 0<=years<=47 else np.nan)
    level=str(row.get("education_level_code") or "").strip()
    output.extend(float(level==str(i)) for i in range(1,4))
    study=str(row.get("highest_education_field_code") or "").strip()
    output.extend(float(study==str(i)) for i in range(1,17))
    return output


def scores(actual,predicted):
    return {
        "accuracy":round(float(accuracy_score(actual,predicted)),4),
        "macro_f1":round(float(f1_score(actual,predicted,average="macro",zero_division=0)),4),
        "balanced_accuracy":round(float(balanced_accuracy_score(actual,predicted)),4)
    }


def build():
    with SOURCE.open(encoding="utf-8-sig",newline="") as f:
        rows=list(csv.DictReader(f))
    if len(rows)<5000:raise RuntimeError("Insufficient original OECD observations.")
    x=np.array([features(row) for row in rows],dtype=float)
    y=np.array([int(row["occupation_isco08_2digit"]) for row in rows],dtype=int)
    if x.shape[1]!=27 or len(np.unique(y))!=12:
        raise RuntimeError("Unexpected real-data schema.")
    train,test=train_test_split(np.arange(len(y)),test_size=.2,stratify=y,random_state=42)
    medians=np.nanmedian(x[train],axis=0)
    x_train=np.where(np.isfinite(x[train]),x[train],medians)
    x_test=np.where(np.isfinite(x[test]),x[test],medians)
    y_train,y_test=y[train],y[test]

    # Choose iterations on TRAIN folds alone. The final 20% holdout was used
    # in earlier exploratory comparisons, so interpret the result cautiously.
    folds=StratifiedKFold(n_splits=3,shuffle=True,random_state=143)
    evaluation=[]
    for iterations in (220,350):
        results=[]
        for a,b in folds.split(x_train,y_train):
            candidate=CatBoostClassifier(iterations=iterations,**PARAMS)
            candidate.fit(x_train[a],y_train[a])
            results.append(scores(y_train[b],candidate.predict(x_train[b]).reshape(-1)))
        evaluation.append({
            "iterations":iterations,"folds":results,
            "mean_macro_f1":round(float(np.mean([r["macro_f1"] for r in results])),4),
            "mean_accuracy":round(float(np.mean([r["accuracy"] for r in results])),4)
        })
    selected=max(evaluation,key=lambda group:group["mean_macro_f1"])["iterations"]
    model=CatBoostClassifier(iterations=selected,**PARAMS)
    model.fit(x_train,y_train)
    native_pred=model.predict(x_test).reshape(-1)
    metrics=scores(y_test,native_pred)
    metrics.update({
        "rows":len(rows),"train_rows":len(train),"test_rows":len(test),
        "majority_baseline_accuracy":round(float(np.bincount(y_train).max()/len(y_train)),4),
        "split":"Stratified random 80/20; random_state=42; preprocessing fitted on train only",
        "note":"Random test split reused in earlier exploratory comparisons; not independent model-selection evidence."
    })

    # Export symmetric CatBoost trees as browser-readable quantized int16
    # arrays rather than shipping the Python/C++ CatBoost library to clients.
    original=OUTPUT.with_suffix(".native-temp.json")
    model.save_model(str(original),format="json")
    native=json.loads(original.read_text(encoding="utf-8"))
    original.unlink(missing_ok=True)
    trees=native["oblivious_trees"]
    if any(any(s["split_type"]!="FloatFeature" for s in t["splits"]) for t in trees):
        raise RuntimeError("Unexpected categorical split; change inference implementation.")
    max_abs=max(abs(v) for tree in trees for v in tree["leaf_values"])
    factor=int(min(10000,math.floor(32000/max_abs)))
    if factor<1000:raise RuntimeError("Leaf values cannot be quantized safely.")
    classes=[int(label) for label in model.classes_]
    def encode(values):
        quantized=np.rint(np.asarray(values)*factor)
        if np.any(np.abs(quantized)>32767):raise RuntimeError("Int16 overflow")
        return base64.b64encode(quantized.astype("<i2").tobytes()).decode("ascii")
    exported=[]
    for tree in trees:
        exported.append({
            "features":[int(s["float_feature_index"]) for s in tree["splits"]],
            "borders":[float(s["border"]) for s in tree["splits"]],
            "leaves":encode(tree["leaf_values"])
        })
    scale,bias=native["scale_and_bias"]
    # Decode quantized tree leaves and check all test-set class predictions.
    def reproduce_one(example):
        logits=np.array(bias,dtype=float)
        for tree in trees:
            leaf=sum(1<<j for j,split in enumerate(tree["splits"])
                     if example[int(split["float_feature_index"])]>float(split["border"]))
            vec=tree["leaf_values"][leaf*len(classes):(leaf+1)*len(classes)]
            logits+=scale*np.rint(np.asarray(vec)*factor)/factor
        exp=np.exp(logits-np.max(logits))
        return exp/np.sum(exp)
    quantized_predictions=[classes[int(np.argmax(reproduce_one(row)))] for row in x_test]
    quantized_accuracy=float(accuracy_score(y_test,quantized_predictions))
    if abs(quantized_accuracy-metrics["accuracy"])>.005:
        raise RuntimeError("Quantization changed test accuracy.")
    native_probabilities=model.predict_proba(x_test)
    max_delta=max(float(np.max(np.abs(reproduce_one(x_test[i])-native_probabilities[i])))
                  for i in (0,1,10,20,70,300,700,1150))
    if max_delta>.01:raise RuntimeError("Exported model probability mismatch.")
    metrics["browser_quantized_test_accuracy"]=round(quantized_accuracy,4)
    metrics["max_probability_delta_8_test_cases"]=round(max_delta,6)
    payload={
        "version":1,
        "model":"CatBoost multi-class symmetric gradient-boosted trees",
        "prediction_task":"Classify broad ISCO-08 occupational families of employed adults, NOT student aptitude or next skill",
        "source":"OECD PIAAC Cycle 2 (2023), five-country anonymous employed respondents",
        "source_url":"https://www.oecd.org/en/data/datasets/piaac-2nd-cycle-database.html",
        "classes":classes,"input_features":FEATURES,
        "median":np.round(medians,8).tolist(),
        "quantization":factor,"trees":exported,
        "scale":scale,"bias":bias,"n_trees":len(trees),
        "max_depth":max(len(t["splits"]) for t in trees),
        "train_cross_validation":evaluation,"metrics":metrics,
        "training":{
            "params":{key:val for key,val in PARAMS.items()
                      if key not in ("thread_count","verbose","allow_writing_files")},
            "selected_iterations":selected,
            "method":"3-fold stratified CV on train only; select rounds by macro-F1 then evaluate stratified test."
        },
        "limitations":[
            "Broad occupation families, not exact job titles",
            "Workers data, not outcomes of learning interventions",
            "Workplace skill use does not equal mastery",
            "Softmax values are uncalibrated class scores, not hiring probabilities",
            "Holdout already used in exploratory comparisons and may give optimistic impression",
            "No causal inference; does not predict the best next course"
        ]
    }
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(payload,separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf-8")
    print("CATBOOST_TRAINED",metrics)
    print("BROWSER_MODEL_READY",len(trees),"trees",len(classes),"occupational classes",OUTPUT)


if __name__=="__main__":
    build()
