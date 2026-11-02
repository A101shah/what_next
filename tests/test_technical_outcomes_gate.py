"""Synthetic fixtures for auditing real technical-outcome evidence, not training data."""
import csv
import tempfile
import unittest
from pathlib import Path
from scripts.validate_technical_learning_outcomes import audit


class TechnicalOutcomesAuditTests(unittest.TestCase):
    def test_missing_observations_never_count_as_validated(self):
        with tempfile.TemporaryDirectory() as temp:
            result=audit(Path(temp)/"missing.csv")
            self.assertFalse(result["ready_for_model_research"])
            self.assertEqual(result["events"],0)

    def test_real_outcomes_schema_gate_distinguishes_readiness_from_validation(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/"fixture.csv"
            columns=["learner_id","concept_id","lesson_id","pre_score","post_score",
                     "observed_at","post_observed_at","consent_for_research"]
            with path.open("w",newline="") as f:
                writer=csv.DictWriter(f,fieldnames=columns);writer.writeheader()
                for i,(student,concept,consent) in enumerate([
                    ("a","python-basics","true"),("a","python-control-flow","yes"),
                    ("b","python-basics","1"),("b","python-control-flow","true"),
                    ("c","python-control-flow","no")]):
                    writer.writerow({"learner_id":student,"concept_id":concept,
                       "lesson_id":"l1","pre_score":".2","post_score":".8",
                       "observed_at":"2026-01-01T00:00:00Z",
                       "post_observed_at":"2026-01-02T00:00:00Z",
                       "consent_for_research":consent})
            result=audit(path,min_learners=2,min_events=4,min_concepts=2)
            self.assertTrue(result["ready_for_model_research"])
            self.assertFalse(result["validated_for_production"])
            self.assertEqual(result["events"],4)
            self.assertEqual(result["invalid_or_unconsented_rows_excluded"],1)

    def test_typical_tiny_pilot_does_not_pass_real_thresholds(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/"pilot.csv"
            p.write_text("learner_id,concept_id,lesson_id,pre_score,post_score,observed_at,post_observed_at,consent_for_research\n"
                         "a,python-basics,l1,0.2,0.8,2026-01-01,2026-01-02,true\n")
            result=audit(p)
            self.assertFalse(result["ready_for_model_research"])
            self.assertFalse(result["validated_for_production"])

if __name__=="__main__":unittest.main()
