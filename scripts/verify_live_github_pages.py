"""Independently check HTTPS responses served by the PUBLIC GitHub Pages URL.

Unlike GitHub repository checks and the browser's own on-site self-check,
this requires real outgoing HTTPS access from the machine running it.
Reports DNS/network errors as NOT VERIFIED, never as deployment success.
"""
import argparse
import json
import ssl
import urllib.error
import urllib.request
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urljoin,urlsplit

URL="https://a101shah.github.io/what_next/"
ASSETS=["","learning.js","deployment-diagnostics.js",
        "data/learning_v2/graph.json",
        "data/learning_v2/diagnostic_questions.json",
        "data/real_learning/public_evidence_dashboard.json",
        "data/learning_v2/WhatNext_Compiled_Learning_Dataset_V3.csv"]

def check(path, body):
    data=body.decode("utf-8-sig")
    if path=="":
        return 'id="view-research"' in data and 'src="deployment-diagnostics.js"' in data
    if path=="learning.js":return "WhatNextLearning" in data
    if path=="deployment-diagnostics.js":return "WhatNextDeploymentDiagnostics" in data
    if path.endswith("graph.json"):
        obj=json.loads(data)
        return len(obj.get("concepts",[]))==107 and len(obj.get("prerequisites",[]))==139
    if path.endswith("diagnostic_questions.json"):
        return len(json.loads(data).get("questions",[]))==45
    if path.endswith("public_evidence_dashboard.json"):
        obj=json.loads(data)
        return len(obj.get("sources",[]))>=5 and obj["model_status"]["validated_recommendation_accuracy"] is None
    if path.endswith(".csv"):
        return "concept_id" in data.splitlines()[0] and "practice_question_count" in data.splitlines()[0]
    return False

def verify(url=URL,timeout=10):
    if urlsplit(url).scheme!="https" or urlsplit(url).hostname!="a101shah.github.io":
        raise ValueError("Only the requested public GitHub Pages HTTPS host is permitted")
    report={"site":url,"checked_utc":datetime.now(timezone.utc).isoformat(),
            "public_live_https_verified":False,"results":[]}
    for path in ASSETS:
        target=urljoin(url,path)
        try:
            request=urllib.request.Request(target,headers={"User-Agent":"WhatNext-AI-Live-Verification/1.0","Cache-Control":"no-cache"})
            with urllib.request.urlopen(request,timeout=timeout,context=ssl.create_default_context()) as response:
                status=response.status
                body=response.read(1_000_000)
            ok=status==200 and check(path,body)
            report["results"].append({"resource":path or "index.html","http_status":status,"verified":ok})
        except (urllib.error.URLError,TimeoutError,OSError,ValueError,KeyError,json.JSONDecodeError) as exc:
            report["results"].append({"resource":path or "index.html","verified":False,"error":str(exc)[:250]})
    report["public_live_https_verified"]=all(x["verified"] for x in report["results"])
    return report

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--url",default=URL)
    p.add_argument("--out",type=Path,default=Path("out/real_learning/pages_live_probe.json"))
    args=p.parse_args()
    report=verify(args.url)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2))
    if not report["public_live_https_verified"]:raise SystemExit(2)

if __name__=="__main__":main()
