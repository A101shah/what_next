"""Offline smoke tests use tiny GENERATED FIXTURES only; no fake training claims.

Run: python -m unittest tests.test_real_data_pipeline -v
"""
import csv, tempfile, unittest, zipfile, io
from pathlib import Path
from scripts.import_real_learning_data import ednet_events, assist_events, question_lookup, write_rows
from scripts.download_onet_31_skills import convert

class RealDataImportTests(unittest.TestCase):
    def test_ednet_correctness_from_real_format_answer_keys(self):
        with tempfile.TemporaryDirectory() as dirname:
            p=Path(dirname)
            key=p/"questions.csv"
            key.write_text("question_id,correct_answer,tags\nq1,b,5\nq2,d,6\n")
            archive=p/"ednet.zip"
            with zipfile.ZipFile(archive,"w") as z:
                for student in ("u1","u2"):
                    z.writestr("KT1/"+student+".csv",
                        "timestamp,solving_id,question_id,user_answer,elapsed_time\n"
                        "1000,1,q1,b,5000\n1100,2,q2,a,7000\n")
            rows=list(ednet_events(archive,question_lookup(key),2,100,42))
            self.assertEqual(len(rows),4)
            self.assertEqual(sum(int(r["is_correct"]) for r in rows),2)
            self.assertEqual(len({r["student_id"] for r in rows}),2)
            self.assertTrue(all(r["domain"]=="TOEIC_English" for r in rows))
            self.assertTrue(all("u1" not in r["student_id"] for r in rows))
            stats=write_rows(p/"private"/"ednet_interactions.csv",rows)
            self.assertEqual(stats["rows"],4)
            self.assertEqual(stats["correct"],2)
    def test_run_scoped_keyed_ids_are_consistent_within_an_import(self):
        from scripts.import_real_learning_data import pseudonym
        import hashlib
        first=pseudonym("ednet","u123456")
        self.assertEqual(first,pseudonym("ednet","u123456"))
        self.assertNotEqual(first,pseudonym("ednet","u123457"))
        plain="ednet_"+hashlib.sha256(b"whatnext-v1|ednet|u123456").hexdigest()[:20]
        self.assertNotEqual(first,plain)

    def test_missing_ednet_answers_does_not_invent_correctness(self):
        with tempfile.TemporaryDirectory() as dirname:
            p=Path(dirname)
            with zipfile.ZipFile(p/"ednet.zip","w") as z:
                z.writestr("KT1/u1.csv",
                    "timestamp,question_id,user_answer,elapsed_time\n1000,q1,a,5000\n")
            self.assertEqual(list(ednet_events(p/"ednet.zip",{},10,100,42)),[])
    def test_assist_real_format_schema(self):
        with tempfile.TemporaryDirectory() as dirname:
            p=Path(dirname)/"assist.csv"
            p.write_text("user_id,problem_id,correct,order_id,skill_id\n"
                         "person1,100,1,1,5\nperson1,101,0,2,5\n")
            rows=list(assist_events(p,100))
            self.assertEqual([r["is_correct"] for r in rows],["1","0"])
            self.assertEqual(len({r["student_id"] for r in rows}),1)
    def test_official_onet_schema_mapping(self):
        row={"O*NET-SOC Code":"15-2051.00","Title":"Data Scientists",
             "Element ID":"X","Element Name":"Critical Thinking",
             "Scale ID":"IM","Scale Name":"Importance","Data Value":"4.0"}
        mapped=list(convert([row],"https://www.onetcenter.org/"))[0]
        self.assertEqual(mapped["occupation_code"],"15-2051.00")
        self.assertEqual(mapped["rating_value"],"4.0")
        self.assertEqual(mapped["source_version"],"31.0")

try:
    import torch
    from scripts.train_knowledge_tracing import DKT,encode,pad_batch
except ImportError:
    torch=None

@unittest.skipIf(torch is None,"torch is not installed")
class RealDataModelTests(unittest.TestCase):
    def test_100_row_pilot_is_rejected_for_training(self):
        from argparse import Namespace
        from scripts.train_knowledge_tracing import train
        with tempfile.TemporaryDirectory() as dirname:
            path=Path(dirname)/"pilot.csv"
            with path.open("w",newline="") as handle:
                writer=csv.writer(handle)
                writer.writerow(["student_id","timestamp_or_order","question_id","is_correct","domain"])
                for i in range(5):
                    for t in range(20):
                        writer.writerow([f"pilot{i}",1000+t,f"q{t}",str(t%2),"TOEIC_English"])
            with self.assertRaisesRegex(ValueError,"Insufficient independent real data"):
                train(Namespace(seed=42,input=path,min_students=30,min_interactions=1000))

    def test_gru_predicts_next_question_not_current_outcome(self):
        torch.manual_seed(1)
        histories=[("research_fixture",[(1,"q1",1),(2,"q2",0),(3,"q3",1)])]
        sequences=encode(histories,{"q1":1,"q2":2,"q3":3},80)
        inp,target,y,mask=pad_batch(sequences)
        self.assertEqual(inp.tolist(),[[3,4]])
        self.assertEqual(target.tolist(),[[2,3]])
        self.assertEqual(y.tolist(),[[0.,1.]])
        net=DKT(4)
        with torch.no_grad(): logits=net(inp,target)
        self.assertEqual(tuple(logits.shape),(1,2))
        self.assertEqual(mask.sum().item(),2)

if __name__=="__main__":unittest.main()
