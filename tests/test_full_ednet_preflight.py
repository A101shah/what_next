"""Test full EdNet acquisition readiness without posing fixtures as real training data."""
import tempfile, unittest, zipfile
from pathlib import Path
from scripts.verify_full_ednet import inspect, MIN_LEARNER_FILES

class FullEdNetReadinessTests(unittest.TestCase):
    def test_missing_official_archive_fails_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)
            report=inspect(p/"absent.zip",p/"absent.csv")
            self.assertFalse(report["ready"])
            self.assertFalse(report["full_data_training_executed"])
            self.assertTrue(any("missing" in x.lower() for x in report["issues"]))
    def test_tiny_fixture_must_not_pass_actual_full_release_thresholds(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)
            archive=p/"fake.zip"
            with zipfile.ZipFile(archive,"w") as f:
                f.writestr("KT1/u123.csv",
                   "timestamp,solving_id,question_id,user_answer,elapsed_time\n"
                   "1000,1,q1,a,12000\n")
            key=p/"questions.csv"
            key.write_text("question_id,correct_answer\nq1,a\n",encoding="utf-8")
            result=inspect(archive,key)
            self.assertFalse(result["ready"])
            self.assertEqual(result["learner_file_count"],1)
            self.assertGreaterEqual(MIN_LEARNER_FILES,700000)
    def test_fixture_only_can_be_parsed_with_explicit_lowered_test_limits(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)
            with zipfile.ZipFile(p/"fixture.zip","w") as f:
                f.writestr("KT1/u1.csv",
                   "timestamp,solving_id,question_id,user_answer,elapsed_time\n"
                   "1000,1,q1,a,12000\n")
            (p/"questions.csv").write_text("question_id,correct_answer\nq1,a\n",encoding="utf-8")
            report=inspect(p/"fixture.zip",p/"questions.csv",min_bytes=1,min_files=1)
            self.assertTrue(report["ready"])
            self.assertFalse(report["full_data_training_executed"])

if __name__=="__main__":unittest.main()
