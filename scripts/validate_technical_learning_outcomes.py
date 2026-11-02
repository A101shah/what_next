"""Audit consented, genuine technical-topic learning outcomes before neural ranking.

This gate never fabricates student data, trains a model, or claims causal
benefit. A passing schema test alone is NOT validation of a next-lesson model.

Expected private CSV: learner_id,concept_id,lesson_id,pre_score,post_score,
observed_at,post_observed_at,consent_for_research
Keep this file under ignored out/ -- never publish learner-level records.
"""
import argparse,csv,json
from collections import Counter
from datetime import datetime
from pathlib import Path

REQUIRED={"learner_id","concept_id","lesson_id","pre_score","post_score",
          "observed_at","post_observed_at","consent_for_research"}
def audit(path,min_learners=200,min_events=5000,min_concepts=10):
    issues=[];learners=set();concepts=set();events=0;later=0;rows_rejected=0
    if not Path(path).is_file():
        return {"ready_for_model_research":False,"issues":["No observed technical learning outcome file provided"],
                "events":0,"learners":0,"concepts":0}
    with Path(path).open(newline="",encoding="utf-8-sig") as file:
        rd=csv.DictReader(file)
        missing=REQUIRED-set(rd.fieldnames or [])
        if missing:return {"ready_for_model_research":False,"issues":["Missing fields: "+", ".join(sorted(missing))],
                           "events":0,"learners":0,"concepts":0}
        for row in rd:
            if row["consent_for_research"].lower() not in ("true","1","yes"):
                rows_rejected+=1;continue
            if not all(row.get(k) for k in ("learner_id","concept_id","lesson_id")):
                rows_rejected+=1;continue
            try:
                a=float(row["pre_score"]);b=float(row["post_score"])
                t1=datetime.fromisoformat(row["observed_at"].replace("Z","+00:00"))
                t2=datetime.fromisoformat(row["post_observed_at"].replace("Z","+00:00"))
                if not (0<=a<=1 and 0<=b<=1 and t2>t1):raise ValueError()
            except (ValueError,TypeError):
                rows_rejected+=1;continue
            learners.add(row["learner_id"]);concepts.add(row["concept_id"])
            events+=1;later+=int(b>a)
    if len(learners)<min_learners:issues.append("Insufficient distinct consented learners")
    if events<min_events:issues.append("Insufficient paired pre/post outcome observations")
    if len(concepts)<min_concepts:issues.append("Insufficient technical concept coverage")
    issues.append("Needs student-disjoint evaluation, baselines, policy-bias analysis and pedagogical review before production")
    return {"ready_for_model_research":events>=min_events and len(learners)>=min_learners
            and len(concepts)>=min_concepts,
            "validated_for_production":False,
            "events":events,"learners":len(learners),"concepts":len(concepts),
            "improved_score_events":later,"invalid_or_unconsented_rows_excluded":rows_rejected,
            "issues":issues}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input",type=Path,required=True)
    p.add_argument("--out",type=Path,default=Path("out/technical_outcomes_audit.json"))
    args=p.parse_args()
    results=audit(args.input)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(results,indent=2)+"\n")
    print(json.dumps(results,indent=2))
    if not results["ready_for_model_research"]:raise SystemExit(2)

if __name__=="__main__":main()
