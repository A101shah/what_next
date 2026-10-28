"""Inspect only public OECD PIAAC schema and anonymous categorical value ranges."""
import csv,io,re,urllib.request
from openpyxl import load_workbook

codebook_url="https://www.oecd.org/content/dam/oecd/en/about/programmes/edu/piaac/data-materials/cycle-2/piaac-cy2-international-codebook.xlsx"
req=urllib.request.Request(codebook_url,headers={"User-Agent":"WhatNextAI/1.0 research inspection"})
with urllib.request.urlopen(req,timeout=50) as f: wb=load_workbook(io.BytesIO(f.read()),read_only=True,data_only=True)
ws=wb["PUF"]
for row in ws.iter_rows(values_only=True):
    row=[str(x) if x is not None else "" for x in row]
    name=row[1] if len(row)>1 else ""
    description=row[2] if len(row)>2 else ""
    if name in {"ISCO08_C","ISCO08_L","EDLEVEL3","EDLEVEL4","EDFIELD","ISCO1C","ISCO2C","ICTWORKC2","C2_D05","D2_Q12a","B2_Q01","B2_D01d","B2_D03d","E2_Q10a","SPFWT0","SPFWT1","SPFWT","W_FNL","AGE_R","GENDER_R"} or re.search(r"(field of study|sample weight|final weight|qualification required|occupational skill|ICT skills)",description,re.I):
        print("CODE",name,description[:120],"VALUES",row[8][:350] if len(row)>8 else "",flush=True)

for country,file in [("Estonia","prgestp2.csv"),("United States","prgusap2.csv"),("Chile","prgchlp2.csv"),("Poland","prgpolp2.csv"),("Singapore","prgsgpp2.csv")]:
    url="https://webfs.oecd.org/piaac/cy2-puf-data/CSV/"+file
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"WhatNextAI/1.0 research inspection"})
        with urllib.request.urlopen(req,timeout=50) as resp:
            reader=csv.DictReader(io.TextIOWrapper(resp,encoding="utf-8-sig"),delimiter=";")
            cols=reader.fieldnames
            print("COUNTRY",country,"FIELDS",len(cols),"SIZE",resp.headers.get("Content-Length"))
            present=[v for v in ["CNTRYID","ISCO08_C","ISCO08_L","ISCO1C","ISCO2C","EDFIELD","EDLEVEL3","ICTWORKC2","C2_D05","D2_Q12a","B2_Q01","B2_D01d","B2_D03d","SPFWT0","SPFWT","W_FNL","AGE_R","GENDER_R"] if v in cols]
            print("PRESENT",present)
            print("ALL_RELEVANT",[v for v in cols if re.search(r"(ISCO|ISCED|EDLEVEL|EDFIELD|FOS|W_FNL|SPFWT|WEIGHT|PVLIT|PVNUM|B2_D0)",v,re.I)][:100])
            seen={v:set() for v in present}
            examples=[]
            for i,row in enumerate(reader):
                if i>=400:break
                for key in present:
                    if len(seen[key])<20:seen[key].add(row.get(key,""))
                if i<1:examples.append({k:row.get(k) for k in present})
            print("VALUES",{k:sorted(v) for k,v in seen.items()})
            print("EXAMPLES",examples)
    except Exception as e: print("COUNTRY_ERROR",country,str(e),flush=True)
