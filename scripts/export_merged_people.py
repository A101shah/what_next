"""Create ONE real-data, de-identified career-intelligence CSV.

Input: five official OECD PIAAC Cycle 2 (2023) public-use files.
Rows: employed respondents with valid broad ISCO-08 occupational groups.
Peer benchmarks: survey-weighted mean work-skill USE within the same country and
occupation family. These are NOT skill mastery, job fit, or personal trait scores.
No names, original respondent identifiers, or invented seniority.
"""
import csv
import math
from collections import defaultdict
from pathlib import Path

from scripts.build_careers import (
    BASE, COUNTRIES, FAMILIES, ED_LEVELS, download, read_codebook, valid_number
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "out" / "WhatNext_Career_Intelligence_Combined.csv"

# Variable names verified against the OECD PIAAC Cycle 2 codebook.
# These are INDICES OF SKILL USE AT WORK, not competence tests or aptitude.
WORK_SKILLS = {
    "ict": ("ICTWORKC2", "ICTWORKC2_WLE_CA"),
    "numeracy": ("NUMWORKC2", "NUMWORKC2_WLE_CA"),
    "reading": ("READWORKC2_T1", "READWORKC2_WLE_CA_T1"),
    "writing": ("WRITWORKC2", "WRITWORKC2_WLE_CA"),
    "learning": ("LEARNATWORKC2", "LEARNATWORKC2_WLE_CA"),
    "influence": ("INFLUENCEC2_T1", "INFLUENCEC2_WLE_CA_T1"),
    "task_discretion": ("TASKDISCC2_T1", "TASKDISCC2_WLE_CA_T1"),
}
MIN_PEER_N = 25
MIN_SKILL_N = 20

# ILO ISCO-08 Occupational *skill level* for broad major groups;
# NEVER interpret these as junior/mid/senior worker rankings.
ISCO_LEVEL = {"1": "3-4", "2": "4", "3": "3"}
ISCO_MAJOR = {"1": "Managers", "2": "Professionals",
              "3": "Technicians and associate professionals"}

def real_value(raw):
    number = valid_number(raw)
    return number if number is not None else None

def value_text(raw):
    """Keep real numeric values only; blank for country disclosure/survey missing codes."""
    number = real_value(raw)
    return str(raw).strip() if number is not None else ""

def main():
    field_labels, _ = read_codebook()
    respondents = []
    totals = defaultdict(lambda: {"n": 0, "skills": defaultdict(lambda: [0.0, 0.0, 0])})
    for country, filename in sorted(COUNTRIES.items()):
        origin = BASE + filename
        path = download(origin, filename)
        count = 0
        with path.open(encoding="utf-8-sig", newline="") as src:
            reader = csv.DictReader(src, delimiter=";")
            required = {"ISCO2C", "EDFIELD", "EDLEVEL3", "SPFWT0", "C2_D05", "C2_Q10_C"}
            required.update(index for index, band in WORK_SKILLS.values())
            if not required.issubset(set(reader.fieldnames or ())):
                raise ValueError(f"Invalid official file {country}; missing {sorted(required-set(reader.fieldnames or ()))}")
            for survey_row in reader:
                if survey_row.get("C2_D05", "").strip() != "1":
                    continue
                occupation = survey_row.get("ISCO2C", "").strip()
                if occupation not in FAMILIES:
                    continue
                weight = real_value(survey_row.get("SPFWT0"))
                if weight is None or weight <= 0:
                    continue
                edu = survey_row.get("EDFIELD", "").strip()
                level = survey_row.get("EDLEVEL3", "").strip()
                lifetime = real_value(survey_row.get("C2_Q10_C"))
                if lifetime is not None and not (0 <= lifetime <= 47):
                    lifetime = None
                country_family=(country,occupation)
                benchmarks=totals[country_family]
                benchmarks["n"] += 1
                record = {
                    "anonymous_record_id": f"ANON-{len(respondents)+1:06d}",
                    "country": country,
                    "occupation_isco08_2digit": occupation,
                    "occupation_family": FAMILIES[occupation],
                    "occupation_major_group": ISCO_MAJOR[occupation[0]],
                    "isco_occupation_skill_level": ISCO_LEVEL[occupation[0]],
                    "individual_career_seniority": "", # Not observed or reported reliably.
                    "highest_education_field": field_labels.get(edu, ""),
                    "highest_education_field_code": edu if edu in field_labels else "",
                    "education_level": ED_LEVELS.get(level, ""),
                    "education_level_code": level if level in ED_LEVELS else "",
                    "lifetime_paid_work_years_topcoded_at_47": (str(int(lifetime)) if lifetime is not None and lifetime.is_integer() else (str(lifetime) if lifetime is not None else "")),
                    "formal_education_years_required_for_current_job": value_text(survey_row.get("YRSGETC2")),
                    "employment_status": "Employed",
                    "survey_final_weight": value_text(survey_row.get("SPFWT0")),
                    "official_source": "OECD PIAAC Cycle 2 (2023)",
                    "official_country_csv_url": origin,
                    "survey_codebook_url": "https://www.oecd.org/content/dam/oecd/en/about/programmes/edu/piaac/data-materials/cycle-2/piaac-cy2-international-codebook.xlsx",
                }
                for label,(raw_index,raw_band) in WORK_SKILLS.items():
                    number=real_value(survey_row.get(raw_index))
                    record[f"skill_use_{label}_index"] = value_text(survey_row.get(raw_index))
                    band=survey_row.get(raw_band,"").strip()
                    record[f"skill_use_{label}_band_0to5"] = band if band in {"0","1","2","3","4","5"} else ""
                    if number is not None:
                        stats=benchmarks["skills"][label]
                        stats[0] += weight*number
                        stats[1] += weight
                        stats[2] += 1
                respondents.append((record,country_family))
                count += 1
        print(country, "valid employed observations:", count, flush=True)

    if len(respondents) < 1000:
        raise RuntimeError("Insufficient authentic OECD observations; not exporting.")

    columns=[
        "anonymous_record_id","country","occupation_isco08_2digit",
        "occupation_family","occupation_major_group","isco_occupation_skill_level",
        "individual_career_seniority","highest_education_field",
        "highest_education_field_code","education_level","education_level_code",
        "lifetime_paid_work_years_topcoded_at_47",
        "formal_education_years_required_for_current_job",
        "employment_status","survey_final_weight"
    ]
    for label in WORK_SKILLS:
        columns.extend([f"skill_use_{label}_index",f"skill_use_{label}_band_0to5"])
    columns.append("peer_group_country_occupation_sample_n")
    for label in WORK_SKILLS:
        columns.append(f"peer_group_weighted_mean_{label}_skill_use_index")
        columns.append(f"peer_group_{label}_skill_valid_n")
    columns.extend(["official_source","official_country_csv_url","survey_codebook_url"])

    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    with OUTPUT.open("w",encoding="utf-8-sig",newline="") as dest:
        writer=csv.DictWriter(dest,fieldnames=columns)
        writer.writeheader()
        for record,key in respondents:
            aggregate=totals[key]
            record["peer_group_country_occupation_sample_n"]=aggregate["n"]
            for label in WORK_SKILLS:
                weighted_sum,weighted_count,n=aggregate["skills"].get(label,(0.0,0.0,0))
                mean=(weighted_sum/weighted_count) if weighted_count>0 and n>=MIN_SKILL_N and aggregate["n"]>=MIN_PEER_N else None
                record[f"peer_group_weighted_mean_{label}_skill_use_index"] = f"{mean:.5f}" if mean is not None else ""
                record[f"peer_group_{label}_skill_valid_n"]=n if n>=MIN_SKILL_N and aggregate["n"]>=MIN_PEER_N else ""
            writer.writerow(record)
    with OUTPUT.open("r",encoding="utf-8-sig",newline="") as check:
        reader=csv.DictReader(check)
        if len(set(reader.fieldnames))!=len(columns):
            raise RuntimeError("Repeated CSV column names.")
        csv_n=0
        for row in reader:
            csv_n+=1
            if row["individual_career_seniority"]:
                raise RuntimeError("Seniority must not be invented.")
            if row["occupation_isco08_2digit"] not in FAMILIES:
                raise RuntimeError("Invalid occupation family.")
            if row["skill_use_ict_index"] and real_value(row["skill_use_ict_index"]) is None:
                raise RuntimeError("Invalid skill use index.")
        if csv_n!=len(respondents):
            raise RuntimeError("CSV row count verification failed.")
    populated={label:sum(bool(record[f"skill_use_{label}_index"]) for record,_ in respondents) for label in WORK_SKILLS}
    print(f"FINAL_CSV_READY rows={csv_n} columns={len(columns)} country_groups={len(totals)} output={OUTPUT}",flush=True)
    print("NONMISSING_SKILL_INDICES",populated,flush=True)
    print("All exported observations are actual, de-identified employed survey respondents.",flush=True)

if __name__=="__main__":
    main()
