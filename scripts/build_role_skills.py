"""Create the full O*NET role/software index from an actual 31,821-row CSV.

This file is a deterministic OFFLINE build. No GitHub Actions or runtime API.
Uses *occupation-level* associations only. It must never merge software rows
into PIAAC respondents, fabricate individual skills, or infer seniority.
"""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/"data"/"onet_software_skills_31_0.csv"
TAXONOMY = ROOT/"data"/"skill_taxonomy.json"
OUTPUT = ROOT/"data"/"role_skills.json"
PRIMARY = "https://www.onetcenter.org/database.html"

def normalize(s):
    return re.sub(r" +"," ",re.sub(r"[^a-z0-9+#.]+"," ",str(s).strip().lower())).strip()

def classify(element):
    item=normalize(element)
    if re.search(r"web platform|web page creation",item):return "frontend"
    if re.search(r"data base|database|data warehouse",item):return "databases"
    if re.search(r"analytical or scientific|business intelligence|statistic",item):return "data"
    if "object or component oriented development" in item:return "languages"
    if re.search(r"application server|enterprise application integration|program testing",item):return "backend"
    if re.search(r"development environment|configuration management|cloud based|operating system|network monitoring|system software",item):return "devtools"
    if re.search(r"graphics|photo imaging|video creation|music or sound|desktop publishing|computer aided design|multimedia|audio editing|drawing",item):return "creative"
    return "business"

def build(source=SOURCE,taxonomy=TAXONOMY,dest=OUTPUT):
    cfg=json.loads(Path(taxonomy).read_text(encoding="utf-8"))
    aliases={}
    for term in cfg["terms"]:
        for label in [term["name"],*term.get("aliases",[])]:
            key=normalize(label)
            if key in aliases and aliases[key]["name"]!=term["name"]:
                raise RuntimeError("Ambiguous skill alias "+key)
            aliases[key]=term

    skills={}
    roles={}
    raw_n=hot_n=demand_n=0
    with Path(source).open(encoding="utf-8-sig",newline="") as stream:
        reader=csv.DictReader(stream)
        expected={"O*NET-SOC Code","Title","Workplace Example","Element ID",
                  "Element Name","Hot Technology","In Demand"}
        if set(reader.fieldnames or ())!=expected:
            raise RuntimeError("Unexpected O*NET technology column schema")
        for row in reader:
            code=row["O*NET-SOC Code"].strip()
            name_raw=row["Workplace Example"].strip()
            if not re.fullmatch(r"\d{2}-\d{4}\.\d{2}",code) or not name_raw:
                raise RuntimeError("Malformed source occupation or technology")
            match=aliases.get(normalize(name_raw))
            name=match["name"] if match else name_raw
            kind=match["category"] if match else classify(row["Element Name"])
            key=normalize(name)
            skills.setdefault(key,{"name":name,"category":kind,"n":0,"d":0,"h":0})
            role=roles.setdefault(code,{"title":row["Title"].strip(),"tech":{},"raw":0})
            if role["title"]!=row["Title"].strip():
                raise RuntimeError("Conflicting source occupational titles")
            flags=(1 if row["Hot Technology"]=="Y" else 0)|(2 if row["In Demand"]=="Y" else 0)
            role["tech"][key]=role["tech"].get(key,0)|flags
            role["raw"]+=1
            raw_n+=1
            hot_n+=bool(flags&1)
            demand_n+=bool(flags&2)
    if raw_n!=31821 or len(roles)!=923 or len(skills)<8000:
        raise RuntimeError("O*NET source coverage changed: check upstream and revalidate")
    ids={key:i for i,key in enumerate(sorted(skills,key=str.casefold))}
    for role in roles.values():
        for key,flag in role["tech"].items():
            s=skills[key]
            s["n"]+=1
            s["h"]+=bool(flag&1)
            s["d"]+=bool(flag&2)
    packed={}
    for code,role in sorted(roles.items()):
        encoded=[ids[key]*4+flag for key,flag in role["tech"].items()]
        encoded.sort(key=lambda v:(-(v&2),-(v&1),v//4))
        packed[code]={"title":role["title"],"n":role["raw"],"t":encoded}
    ordered=sorted(skills,key=str.casefold)
    payload={
        "version":1,
        "source":"O*NET 31.0 software skills occupational examples (via public mirrored CSV)",
        "source_url":PRIMARY,
        "mirror_url":"https://github.com/Lucialululu/SkillRadar/blob/main/data/onet/software_skills.csv",
        "mirror_blob_sha":"516c0eda74e1ca7c3941a63ac251a91cb68f665d",
        "source_validation":"31,821 rows and 7 columns matching the official source listing; original upstream checksum not independently verified.",
        "source_rows":raw_n,"hot_associations":hot_n,"in_demand_associations":demand_n,
        "source_population":"US O*NET occupations; unrelated to anonymized OECD worker-survey rows",
        "occupation_count":len(roles),"unique_skill_count":len(skills),
        "categories":cfg["categories"],
        "skills":[[skills[key][p] for p in ("name","category","n","d","h")] for key in ordered],
        "roles":packed,
        "meaning":"An O*NET role-tool association does not imply an individual worker knows it or that every employee must use it.",
        "category_method":"Curated exact-alias resume-style labels and deterministic O*NET Element Name groups."
    }
    Path(dest).write_text(json.dumps(payload,separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"ROLE_SKILLS_READY occupations={len(roles)} source_associations={raw_n} distinct_named_skills={len(skills)}")
    return payload

if __name__=="__main__":
    build()
