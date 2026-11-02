"""Download O*NET 31.0 official occupation-level essential/transferable skills.

Output goes into ignored out/real_learning. This data is about OCCUPATIONS,
not observations of individual student skills. Requires internet and Python 3.10+.
"""
import csv, hashlib, json, urllib.request
from pathlib import Path
from argparse import ArgumentParser

BASE="https://www.onetcenter.org/dl_files/database/db_31_0_csv/"
FILES={"essential_skills.csv":18200,"transferable_skills.csv":45500}
COLUMNS=["occupation_code","occupation_title","skill_id","skill_name",
         "rating_scale_id","rating_scale","rating_value","date_updated",
         "precision_warning","not_relevant","source_version","source_url"]

def convert(rows,source_url):
    for r in rows:
        yield {
            "occupation_code":r["O*NET-SOC Code"],"occupation_title":r["Title"],
            "skill_id":r["Element ID"],"skill_name":r["Element Name"],
            "rating_scale_id":r["Scale ID"],"rating_scale":r["Scale Name"],
            "rating_value":r["Data Value"],"date_updated":r.get("Date",""),
            "precision_warning":r.get("Recommend Suppress",""),
            "not_relevant":r.get("Not Relevant",""),
            "source_version":"31.0","source_url":source_url
        }

def main():
    p=ArgumentParser(description=__doc__)
    p.add_argument("--out",type=Path,default=Path("out/real_learning"))
    args=p.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    stats={}
    for name,expected in FILES.items():
        url=BASE+name
        destination=args.out/name
        if not destination.exists():
            print("Downloading:",url)
            try:
                with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"WhatNext AI research; source attributed"}),timeout=90) as response:
                    blob=response.read()
                if len(blob)<1000:raise ValueError("Unexpected empty or truncated O*NET source")
                destination.write_bytes(blob)
            except Exception as exc:
                raise SystemExit("Could not obtain official "+url+": "+str(exc)) from exc
        with destination.open(newline="",encoding="utf-8-sig") as stream:
            reader=csv.DictReader(stream)
            if not {"O*NET-SOC Code","Title","Element ID","Element Name","Scale ID","Scale Name","Data Value"}.issubset(reader.fieldnames or []):
                raise ValueError("Unexpected O*NET source file "+name)
            original=list(reader)
        if len(original)!=expected:raise ValueError(name+": expected "+str(expected)+" official rows; got "+str(len(original)))
        target=args.out/("WhatNext_ONET31_"+name)
        with target.open("w",newline="",encoding="utf-8") as stream:
            writer=csv.DictWriter(stream,fieldnames=COLUMNS);writer.writeheader()
            writer.writerows(convert(original,url))
        stats[name]={"rows":len(original),"sha256":hashlib.sha256(destination.read_bytes()).hexdigest(),"download_url":url}
        print("Verified",len(original),"source rows; exported",target)
    (args.out/"onet31_manifest.json").write_text(json.dumps({"license":"CC BY 4.0","attribution":"U.S. Department of Labor, Employment and Training Administration, O*NET Program","files":stats},indent=2)+"\n",encoding="utf-8")
if __name__=="__main__":main()
