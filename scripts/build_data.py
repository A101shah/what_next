"""Build real occupational clusters from primary-source O*NET CSV files.

Outputs data/model.json; NO synthetic records, student labels or fictional scores.
"""
import csv
import hashlib
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.impute import SimpleImputer
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://www.onetcenter.org/dl_files/database/db_31_0_csv/"
FILES = ["occupation_data.csv", "essential_skills.csv", "software_skills.csv"]


def load_csv(filename):
    url = BASE + filename
    req = Request(url, headers={"User-Agent": "WhatNextAI-academic-project/1.0 (source attribution: O*NET)"})
    try:
        with urlopen(req, timeout=50) as response:
            raw = response.read()
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"Unable to retrieve official O*NET file {url}: {exc}") from exc
    decoded = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(decoded))
    if not reader.fieldnames:
        raise RuntimeError(f"Official file is empty or invalid: {filename}")
    return list(reader), {"url": url, "sha256": hashlib.sha256(raw).hexdigest(), "rows": 0}


def build():
    files = {}
    provenance = {}
    for filename in FILES:
        rows, info = load_csv(filename)
        if not rows:
            raise RuntimeError(f"Official file contains no rows: {filename}")
        info["rows"] = len(rows)
        files[filename] = rows
        provenance[filename] = info

    occupations = {}
    for row in files["occupation_data.csv"]:
        code = row.get("O*NET-SOC Code", "").strip()
        title = row.get("Title", "").strip()
        if code and title and code.startswith(("11-", "13-", "15-", "17-", "27-")):
            occupations[code] = title

    skill_ratings = {}
    labels = set()
    for row in files["essential_skills.csv"]:
        code = row.get("O*NET-SOC Code", "").strip()
        scale = row.get("Scale ID", "").strip().upper()
        label = row.get("Element Name", "").strip()
        raw = row.get("Data Value", "").strip()
        if code not in occupations or scale not in ("IM", "IMPORTANCE") or not label:
            continue
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        if not 0 <= value <= 7:
            continue
        skill_ratings.setdefault(code, {})[label] = value
        labels.add(label)

    all_labels = sorted(labels)
    if len(all_labels) < 10:
        raise RuntimeError("O*NET essential-skill feature extraction failed (fewer than 10 features).")

    codes = [code for code in sorted(skill_ratings) if len(skill_ratings[code]) >= 10]
    if len(codes) < 30:
        raise RuntimeError("Not enough genuine occupational observations to train K-Means.")

    matrix = np.array([[skill_ratings[code].get(label, np.nan) for label in all_labels] for code in codes])
    matrix = SimpleImputer(strategy="median").fit_transform(matrix)
    scaled = StandardScaler().fit_transform(matrix)
    reduced = PCA(n_components=2, random_state=42).fit_transform(scaled)
    k = min(6, max(2, len(codes) // 25))
    labels_pred = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(scaled)
    quality = float(silhouette_score(scaled, labels_pred))

    software = {}
    for row in files["software_skills.csv"]:
        code = row.get("O*NET-SOC Code", "").strip()
        name = (row.get("Example") or row.get("Commodity Title") or "").strip()
        if code in occupations and name and len(name) < 75:
            software.setdefault(code, set()).add(name)

    records = []
    for index, code in enumerate(codes):
        top = sorted(skill_ratings[code].items(), key=lambda v: v[1], reverse=True)[:7]
        records.append({
            "code": code,
            "title": occupations[code],
            "cluster": int(labels_pred[index]),
            "pca": [round(float(v), 3) for v in reduced[index]],
            "skills": [{"name": name, "importance": round(value, 2)} for name, value in top],
            "tools": sorted(software.get(code, set()))[:12]
        })

    output = {
        "source": "O*NET 31.0 Database",
        "source_url": "https://www.onetcenter.org/database.html",
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "model": "StandardScaler → PCA (visualization) + KMeans (occupational clustering)",
        "data_note": "Real occupation-level skill ratings; NOT student-specific skill mastery or verified course sequencing.",
        "n_occupations": len(records),
        "n_skills": len(all_labels),
        "n_clusters": k,
        "silhouette": round(quality, 3),
        "files": provenance,
        "occupations": records
    }
    output_path = ROOT / "data" / "model.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Trained K-Means on {len(records)} verified O*NET occupations × {len(all_labels)} real skill ratings.")
    print(f"Silhouette = {quality:.3f}; saved {output_path}")


if __name__ == "__main__":
    build()
