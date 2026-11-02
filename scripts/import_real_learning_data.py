"""Import REAL public educational interactions, retaining source provenance.

Requires Python 3.10+ and only the standard library. Never commits student
rows to GitHub: output defaults under ignored out/. No fabricated labels.

EdNet: official KT1 ZIP/directory + original questions.csv answer key.
ASSISTments: locally downloaded corrected Skill Builder CSV.
"""
import argparse, csv, hashlib, json, random, zipfile, io
from pathlib import Path
from collections import Counter

EDNET_URL="https://github.com/riiid/ednet"
ASSIST_URL="https://sites.google.com/site/assistmentsdata/home/2009-2010-assistment-data/skill-builder-data-2009-2010"
COLUMNS=["student_id","timestamp_or_order","question_id","is_correct","skill_tags",
         "elapsed_time_ms","source_dataset","domain","evidence"]
def pseudonym(source, raw):
    # Stable locally for longitudinal sequences; no source IDs exported.
    return source+"_"+hashlib.sha256(("whatnext-v1|"+source+"|"+raw).encode()).hexdigest()[:20]
def write_rows(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    count=Counter()
    with path.open("w",newline="",encoding="utf-8") as handle:
        writer=csv.DictWriter(handle,fieldnames=COLUMNS)
        writer.writeheader()
        for row in rows:
            if row["is_correct"] not in ("0","1"): continue
            writer.writerow(row)
            count["rows"]+=1
            count["correct"]+=int(row["is_correct"])
    return dict(count)
def question_lookup(path):
    with path.open(newline="",encoding="utf-8-sig") as handle:
        reader=csv.DictReader(handle)
        if not {"question_id","correct_answer"}.issubset(reader.fieldnames or []):
            raise ValueError("Official questions.csv must contain question_id,correct_answer")
        return {r["question_id"]:(r["correct_answer"].strip().lower(),r.get("tags",""))
                for r in reader if r.get("question_id")}
def ednet_events(path, questions, max_students, max_rows, seed):
    archive=zipfile.ZipFile(path) if path.is_file() else None
    try:
        names=sorted(n for n in (archive.namelist() if archive else
            (str(p) for p in path.rglob("*.csv"))) if n.endswith(".csv") and
            Path(n).stem.startswith("u") and "__MACOSX" not in n)
        if not names: raise ValueError("No KT1 user CSV files found")
        random.Random(seed).shuffle(names)
        seen=0
        for name in names[:max_students]:
            stream=archive.open(name) if archive else open(name,"rb")
            with stream, io.TextIOWrapper(stream,encoding="utf-8-sig",newline="") as fh:
                reader=csv.DictReader(fh)
                if not {"timestamp","question_id","user_answer","elapsed_time"}.issubset(reader.fieldnames or []):
                    raise ValueError("Unexpected KT1 CSV schema: "+name)
                uid=pseudonym("ednet",Path(name).stem)
                last=-1
                for r in reader:
                    try:
                        timestamp=int(r["timestamp"]); duration=int(r["elapsed_time"])
                    except (ValueError,TypeError): continue
                    if timestamp<last: raise ValueError("Nonchronological KT1 history: "+name)
                    last=timestamp
                    answer,tags=questions.get(r["question_id"],("",""))
                    user_answer=(r.get("user_answer") or "").strip().lower()
                    if not answer or user_answer not in ("a","b","c","d"): continue
                    yield {"student_id":uid,"timestamp_or_order":timestamp,
                           "question_id":r["question_id"],"is_correct":str(int(user_answer==answer)),
                           "skill_tags":tags,"elapsed_time_ms":duration,"source_dataset":"EdNet_KT1",
                           "domain":"TOEIC_English","evidence":"observed_student_response"}
                    seen+=1
                    if seen>=max_rows:return
    finally:
        if archive: archive.close()
def assist_events(path, max_rows):
    with path.open(newline="",encoding="latin-1") as fh:
        reader=csv.DictReader(fh)
        if not {"user_id","problem_id","correct"}.issubset(reader.fieldnames or []):
            raise ValueError("Not an ASSISTments corrected Skill Builder CSV")
        for n,r in enumerate(reader):
            if n>=max_rows:break
            correct=(r.get("correct") or "").strip()
            if correct not in ("0","1","0.0","1.0"):continue
            yield {"student_id":pseudonym("assist",r["user_id"]),
                   "timestamp_or_order":r.get("order_id",""),"question_id":r["problem_id"],
                   "is_correct":str(int(float(correct))),"skill_tags":r.get("skill_id",""),
                   "elapsed_time_ms":r.get("ms_first_response",""),
                   "source_dataset":"ASSISTments_2009_2010_corrected",
                   "domain":"school_mathematics","evidence":"observed_student_response"}
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source",choices=["ednet","assist"])
    parser.add_argument("--input",type=Path,required=True,help="Official KT1 ZIP/directory or corrected ASSISTments CSV")
    parser.add_argument("--questions",type=Path,help="Required EdNet contents/questions.csv")
    parser.add_argument("--max-students",type=int,default=5000)
    parser.add_argument("--max-rows",type=int,default=100000)
    parser.add_argument("--seed",type=int,default=42)
    parser.add_argument("--out",type=Path,default=Path("out/real_learning"))
    args=parser.parse_args()
    if args.max_rows<=0 or args.max_students<=0:parser.error("row/student limits must be positive")
    if args.source=="ednet":
        if not args.questions:parser.error("--questions is required to establish true correctness labels")
        rows=ednet_events(args.input,question_lookup(args.questions),args.max_students,args.max_rows,args.seed)
    else:rows=assist_events(args.input,args.max_rows)
    target=args.out/(args.source+"_interactions.csv")
    totals=write_rows(target,rows)
    if not totals.get("rows"):raise SystemExit("No validated genuine interaction rows found")
    metadata={"source":args.source,"source_url":EDNET_URL if args.source=="ednet" else ASSIST_URL,
              "records_exported":totals["rows"],"correct_responses":totals["correct"],
              "unit":"real_student_question_interaction","anonymous_ids":"hashed_source_identifiers",
              "domain":"TOEIC_English" if args.source=="ednet" else "school_mathematics",
              "source_license":"CC BY-NC 4.0" if args.source=="ednet" else "consult_original_provider_terms",
              "split_policy":"student_disjoint_train_validation","restricted_to_local_output":True,
              "warning":"Not evidence of student skills in Python, ML, or any other WhatNext career curriculum"}
    (args.out/(args.source+"_provenance.json")).write_text(json.dumps(metadata,indent=2)+"\n",encoding="utf-8")
    print("Imported genuine observations:",totals["rows"],"->",target)
if __name__=="__main__": main()
