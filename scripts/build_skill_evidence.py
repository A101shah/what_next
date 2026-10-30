"""Summarize the exact 47-column WhatNext merged CSV for the public app.

Source is the verified OECD PIAAC 2023 employed-respondent CSV generated in CI.
No individual respondents are committed or published. Survey sampling weights
are used within each COUNTRY × two-digit ISCO-08 family; no cross-country pooling.
"""
import csv
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "out" / "WhatNext_Career_Intelligence_Combined.csv"
OUTPUT = ROOT / "data" / "skill_evidence.json"
SKILLS = ("ict", "numeracy", "reading", "writing", "learning", "influence", "task_discretion")
MIN_GROUP = 25
MIN_VALID = 20

def number(raw):
    try:
        x = float(raw)
        return x if math.isfinite(x) else None
    except (ValueError, TypeError):
        return None

def summarize(records):
    """Return grouped, strictly aggregate survey evidence from authentic CSV rows."""
    buckets = defaultdict(lambda: {
        "n": 0, "levels": defaultdict(lambda: [0.,0]),
        "fields": defaultdict(lambda: [0.,0]),
        "years": [0.,0.,0], "job_years": [0.,0.,0],
        "skills": defaultdict(lambda: {
            "sum": 0., "weight": 0., "n": 0,
            "high_weight": 0., "band_weight": 0., "band_n": 0
        })
    })
    for row in records:
        code = row["occupation_isco08_2digit"]
        country = row["country"]
        weight = number(row["survey_final_weight"])
        if weight is None or weight <= 0:
            continue
        slot = buckets[(country,code,row["occupation_family"])]
        slot["n"] += 1
        level = row.get("education_level", "")
        field = row.get("highest_education_field", "")
        if level in ("Low","Medium","High"):
            slot["levels"][level][0] += weight
            slot["levels"][level][1] += 1
        if field:
            slot["fields"][field][0] += weight
            slot["fields"][field][1] += 1
        for key,column in (("years","lifetime_paid_work_years_topcoded_at_47"),
                            ("job_years","formal_education_years_required_for_current_job")):
            val=number(row.get(column))
            if val is not None and 0 <= val <= 60:
                slot[key][0] += weight*val
                slot[key][1] += weight
                slot[key][2] += 1
        for skill in SKILLS:
            dat=slot["skills"][skill]
            raw=number(row.get("skill_use_"+skill+"_index"))
            if raw is not None:
                dat["sum"] += raw*weight
                dat["weight"] += weight
                dat["n"] += 1
            band = row.get("skill_use_"+skill+"_band_0to5", "")
            if band in ("0","1","2","3","4","5"):
                dat["band_weight"] += weight
                dat["band_n"] += 1
                if band in ("4","5"):
                    dat["high_weight"] += weight
    out={}
    for (country,code,title), slot in sorted(buckets.items()):
        if slot["n"] < MIN_GROUP:
            continue
        skill_info={}
        for skill in SKILLS:
            item=slot["skills"][skill]
            enough = item["n"] >= MIN_VALID and item["band_n"] >= MIN_VALID
            skill_info[skill] = {
                "mean_use_index": round(item["sum"]/item["weight"],3) if item["weight"]>0 and enough else None,
                "high_use_band_pct": round(100*item["high_weight"]/item["band_weight"],1) if item["band_weight"]>0 and enough else None,
                "index_valid_n": item["n"],
                "band_valid_n": item["band_n"],
            }
        def education_dist(which):
            items=slot[which]
            eligible={name:val for name,val in items.items() if val[1] >= 1}
            total=sum(val[0] for val in eligible.values())
            count=sum(val[1] for val in eligible.values())
            if count < MIN_VALID or total <= 0:
                return []
            return [{"label":name,"pct":round(100*val[0]/total,1)} for name,val in sorted(eligible.items(),key=lambda x:-x[1][0])]
        def mean(key):
            a=slot[key]
            return {"mean":round(a[0]/a[1],1) if a[1]>0 and a[2]>=MIN_VALID else None,
                    "valid_n":a[2]}
        out.setdefault(country,{})[code]={
            "occupation_family":title,"n":slot["n"],
            "education_fields":education_dist("fields"),
            "education_levels":education_dist("levels"),
            "experience_years":mean("years"),
            "required_education_years":mean("job_years"),
            "skills":skill_info,
        }
    return out

def main():
    with INPUT.open("r",encoding="utf-8-sig",newline="") as src:
        reader=csv.DictReader(src)
        required={"country","occupation_isco08_2digit","occupation_family","survey_final_weight"}
        required |= {"skill_use_"+skill+"_index" for skill in SKILLS}
        required |= {"skill_use_"+skill+"_band_0to5" for skill in SKILLS}
        if not required.issubset(set(reader.fieldnames or [])):
            raise RuntimeError("Final merged CSV lacks verified skill-use columns.")
        groups=summarize(reader)
    if len(groups)<2 or sum(map(len,groups.values()))<10:
        raise RuntimeError("Insufficient real OECD survey groups; no fabricated fallback.")
    payload={
        "source":"OECD PIAAC Cycle 2 (2023) public-use files",
        "source_url":"https://www.oecd.org/en/data/datasets/piaac-2nd-cycle-database.html",
        "derived_from":"WhatNext_Career_Intelligence_Combined.csv (47 columns)",
        "generated_utc":datetime.now(timezone.utc).isoformat(),
        "countries":groups,
        "skill_labels":{
            "ict":"Digital / ICT use","numeracy":"Numeracy use",
            "reading":"Reading use","writing":"Writing use",
            "learning":"Learning at work","influence":"Influencing at work",
            "task_discretion":"Task discretion"
        },
        "method":"Within-country and broad ISCO-08 occupational-family weighted descriptive statistics using SPFWT0; only groups with >=25 respondents and skill indicators with >=20 valid observations.",
        "high_band_definition":"Survey index categories 4 or 5, measuring reported use of each skill domain at work; not a skill-mastery rating.",
        "limitations":[
            "Not individual job seniority or an employability score.",
            "Occupational families are broad: an AI Engineer is not distinguished from another ICT professional.",
            "Self-reported workplace skill-use indicators do not establish competence, good traits or causal success.",
            "Skill indices have distinct scales; do not compare index means between different domains.",
            "Survey-weighted descriptive estimates exclude replicate-weight confidence intervals.",
            "Some country occupation indicators are suppressed or missing; never interpret missing as zero."
        ]
    }
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(payload,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print("SKILL_EVIDENCE_READY countries="+str(len(groups))+" groups="+str(sum(map(len,groups.values()))),flush=True)

if __name__=="__main__":
    main()
