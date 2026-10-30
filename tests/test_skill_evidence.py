"""Tests use tiny constructed fixtures only, never fabricated production observations."""
import unittest

from scripts.build_skill_evidence import summarize


def respondent(country="Chile", occupation="25", weight="1", band="4", reading="2.0"):
    return {
        "country":country,
        "occupation_isco08_2digit":occupation,
        "occupation_family":"Information and communications technology professionals",
        "survey_final_weight":weight,
        "education_level":"High",
        "highest_education_field":"Computer science",
        "lifetime_paid_work_years_topcoded_at_47":"5",
        "formal_education_years_required_for_current_job":"16",
        "skill_use_ict_index":"2.0",
        "skill_use_ict_band_0to5":band,
        "skill_use_numeracy_index":"1.0",
        "skill_use_numeracy_band_0to5":"3",
        "skill_use_reading_index":reading,
        "skill_use_reading_band_0to5":band,
    }


class RealSurveySkillSummariesTest(unittest.TestCase):
    def test_weighted_frequency_and_mean_stay_separate(self):
        samples=[respondent(weight="2",band="4") for _ in range(20)]
        samples += [respondent(weight="1",band="1") for _ in range(5)]
        group=summarize(samples)["Chile"]["25"]
        self.assertEqual(group["n"],25)
        self.assertEqual(group["skills"]["ict"]["index_valid_n"],25)
        self.assertAlmostEqual(group["skills"]["ict"]["high_use_band_pct"],88.9,places=1)
        self.assertEqual(group["skills"]["ict"]["mean_use_index"],2.0)
        self.assertEqual(group["experience_years"]["mean"],5.0)
        self.assertEqual(group["required_education_years"]["mean"],16.0)

    def test_country_is_never_pooled(self):
        rows=[respondent(country="Chile") for _ in range(25)]
        rows += [respondent(country="Poland",band="0") for _ in range(25)]
        out=summarize(rows)
        self.assertEqual(out["Chile"]["25"]["skills"]["ict"]["high_use_band_pct"],100)
        self.assertEqual(out["Poland"]["25"]["skills"]["ict"]["high_use_band_pct"],0)

    def test_small_groups_and_missing_skills_are_not_reported(self):
        rows=[respondent(reading="") for _ in range(25)]
        rows += [respondent(country="Italy") for _ in range(12)]
        output=summarize(rows)
        self.assertNotIn("Italy",output)
        self.assertIsNone(output["Chile"]["25"]["skills"]["reading"]["high_use_band_pct"])
        self.assertEqual(output["Chile"]["25"]["skills"]["reading"]["index_valid_n"],0)

    def test_no_person_level_data_is_exported(self):
        rows=[dict(respondent(),anonymous_record_id=f"anon{i}") for i in range(25)]
        summary=summarize(rows)["Chile"]["25"]
        self.assertNotIn("anonymous_record_id",summary)
        self.assertNotIn("person_name",summary)


if __name__=="__main__":
    unittest.main()
