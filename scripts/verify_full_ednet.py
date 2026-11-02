"""Verify the *official full EdNet KT1 archive* is present before training.

This is a preflight gate, not a downloader or a claim training was executed.
Usage:
 python scripts/verify_full_ednet.py --kt1 "D:\\Datasets\\EdNet-KT1.zip" --questions "D:\\Datasets\\questions.csv"
Output is a machine-readable readiness report, with no student records.
"""
import argparse, csv, hashlib, json, re, sys, zipfile
from pathlib import Path

OFFICIAL_URL="https://github.com/riiid/ednet"
# Expected are deliberately conservative floors rather than exact numbers;
# official release reports 784,309 learner files and ~1.2 GB compressed.
MIN_ARCHIVE_BYTES=900_000_000
MIN_LEARNER_FILES=700_000
MANDATORY_QUESTIONS={"question_id","correct_answer"}

def inspect(archive:Path, questions:Path, min_bytes=MIN_ARCHIVE_BYTES, min_files=MIN_LEARNER_FILES):
    report={
      "source":OFFICIAL_URL,"official_release":"EdNet KT1",
      "archive_path":str(archive),"questions_path":str(questions),
      "ready":False,"full_data_training_executed":False,"issues":[]
    }
    if not archive.is_file():
        report["issues"].append("Official KT1 ZIP missing; download it from the Riiid EdNet source.")
        return report
    report["archive_size_bytes"]=archive.stat().st_size
    if report["archive_size_bytes"]<min_bytes:
        report["issues"].append("Archive smaller than official full KT1 size threshold.")
    try:
        with zipfile.ZipFile(archive) as zipped:
            bad=zipped.testzip() if report["archive_size_bytes"]<100_000_000 else None
            if bad:report["issues"].append("Corrupt archive member: "+bad)
            names=[info.filename for info in zipped.infolist() if
                   not info.is_dir() and
                   re.search(r"(?:^|/)u[0-9]+\.csv$",info.filename,re.I)]
            report["learner_file_count"]=len(names)
            if len(names)<min_files:report["issues"].append("Too few official learner files.")
            if names:
                with zipped.open(names[0]) as first:
                    header=first.readline().decode("utf-8-sig").strip().split(",")
                required={"timestamp","question_id","user_answer","elapsed_time"}
                if not required.issubset(set(header)):
                    report["issues"].append("KT1 learner CSV fields do not match the expected schema.")
    except (zipfile.BadZipFile,OSError,UnicodeDecodeError) as error:
        report["issues"].append("Invalid official KT1 archive: "+str(error))
    if not questions.is_file():
        report["issues"].append("Official EdNet Contents/questions.csv missing.")
    else:
        try:
            with questions.open(newline="",encoding="utf-8-sig") as source:
                reader=csv.DictReader(source)
                if not MANDATORY_QUESTIONS.issubset(reader.fieldnames or []):
                    report["issues"].append("Wrong questions.csv schema: expected official answer key.")
                else:
                    count=0
                    for r in reader:
                        if r.get("question_id") and r.get("correct_answer","").lower() in ("a","b","c","d"):
                            count+=1
                    report["answer_key_entries"]=count
                    if count<10000 and min_files==MIN_LEARNER_FILES:
                        report["issues"].append("Question answer key is too small for the official full release.")
        except (OSError,UnicodeDecodeError,csv.Error) as error:
            report["issues"].append("Cannot parse official question answer key: "+str(error))
    report["ready"]=not report["issues"]
    return report

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--kt1",type=Path,required=True)
    p.add_argument("--questions",type=Path,required=True)
    p.add_argument("--report",type=Path,default=Path("out/real_learning/ednet_readiness.json"))
    args=p.parse_args()
    report=inspect(args.kt1,args.questions)
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2))
    if not report["ready"]:
        print("Training NOT RUN: full official source is unavailable or invalid.",file=sys.stderr)
        sys.exit(2)

if __name__=="__main__":main()
