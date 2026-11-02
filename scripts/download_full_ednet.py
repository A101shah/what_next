"""Acquire *official* EdNet KT1 and Contents without publishing learner records.

Requires: pip install gdown
Official original links are the ones published by https://github.com/riiid/ednet .
Downloads are large (~1.2GB KT1 and separate metadata) and must be run on a
networked computer with enough free disk. No files are uploaded to GitHub.
"""
import argparse
import csv
import io
import json
import shutil
import zipfile
from pathlib import Path

OFFICIAL_KT1_GOOGLE_DRIVE_ID="1AmGcOs5U31wIIqvthn9ARqJMrMTFTcaw"
OFFICIAL_CONTENTS_GOOGLE_DRIVE_ID="117aYJAWG3GU48suS66NPaB82HwFj6xWS"
OFFICIAL_REPO="https://github.com/riiid/ednet"


def extract_questions(contents_zip, destination):
    with zipfile.ZipFile(contents_zip) as archive:
        matches=[entry for entry in archive.infolist()
                 if not entry.is_dir() and Path(entry.filename).name.lower()=="questions.csv"]
        if len(matches)!=1:
            raise ValueError("Expected one official Contents/questions.csv")
        with archive.open(matches[0]) as source:
            wrapper=io.TextIOWrapper(source,encoding="utf-8-sig",newline="")
            reader=csv.DictReader(wrapper)
            if not {"question_id","correct_answer"}.issubset(reader.fieldnames or []):
                raise ValueError("Official question answer-key columns missing")
            count=sum(bool(r.get("question_id")) for r in reader)
        if count<10000:
            raise ValueError("Expected at least 10,000 original EdNet questions")
        with archive.open(matches[0]) as source,destination.open("wb") as target:
            shutil.copyfileobj(source,target)
    return count


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out",type=Path,default=Path("out/real_learning/ednet_source"))
    parser.add_argument("--skip-download",action="store_true",
                        help="Use original official files already present in --out")
    args=parser.parse_args()
    args.out.mkdir(parents=True,exist_ok=True)
    kt1=args.out/"EdNet-KT1.zip"
    contents=args.out/"EdNet-Contents.zip"
    if not args.skip_download:
        try:
            import gdown
        except ImportError as e:
            parser.error("Install official Google Drive downloader: python -m pip install gdown")
        for file_id,target in [(OFFICIAL_KT1_GOOGLE_DRIVE_ID,kt1),
                               (OFFICIAL_CONTENTS_GOOGLE_DRIVE_ID,contents)]:
            if not target.exists():
                result=gdown.download(id=file_id,output=str(target),quiet=False,resume=True)
                if not result or not target.is_file():
                    raise RuntimeError("Official dataset download failed: "+file_id)
    if not kt1.is_file() or not contents.is_file():
        raise FileNotFoundError("Both official ZIP files must exist in "+str(args.out))
    count=extract_questions(contents,args.out/"questions.csv")
    # Import the validator only when needed so a standard Python install can download.
    from scripts.verify_full_ednet import inspect
    report=inspect(kt1,args.out/"questions.csv")
    summary={"source":OFFICIAL_REPO,"questions":count,"readiness":report,
             "data_redistributed":False,"full_training_executed":False}
    (args.out/"official_acquisition_status.json").write_text(json.dumps(summary,indent=2)+"\n")
    print(json.dumps(summary,indent=2))
    if not report["ready"]:
        raise SystemExit("Incomplete official EdNet input; do not start training.")


if __name__=="__main__":
    main()
