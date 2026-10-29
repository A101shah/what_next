"""Small deterministic checks on human-curated learning path integrity and survey aggregation logic."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class LearningPathTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.paths = json.loads((ROOT / "data" / "paths.json").read_text(encoding="utf-8"))

    def test_unique_ids_and_prerequisite_references(self):
        self.assertGreaterEqual(len(self.paths), 4)
        for path in self.paths:
            topics = path["topics"]
            ids = [topic["id"] for topic in topics]
            titles = {topic["title"] for topic in topics}
            self.assertEqual(len(ids), len(set(ids)))
            self.assertEqual(len(titles), len(topics))
            for topic in topics:
                self.assertGreater(topic["hours"], 0)
                self.assertTrue(topic["resource"].startswith("https://"))
                for prereq in topic["prerequisites"]:
                    self.assertIn(prereq, titles, f"{topic['title']} refers to unknown prerequisite")

    def test_no_circular_prerequisites(self):
        for path in self.paths:
            topics = {topic["title"]: topic for topic in path["topics"]}
            visited = set()
            processing = set()

            def visit(name):
                if name in processing:
                    self.fail(f"Circular prerequisite in {path['id']}: {name}")
                if name in visited:
                    return
                processing.add(name)
                for dependency in topics[name]["prerequisites"]:
                    visit(dependency)
                processing.remove(name)
                visited.add(name)

            for title in topics:
                visit(title)

    def test_each_path_has_official_broad_occupation_mapping(self):
        for path in self.paths:
            self.assertRegex(path.get("isco2", ""), r"^\d{2}$")


class RealDataAggregationTests(unittest.TestCase):
    def test_education_distribution_uses_real_input_weights(self):
        from scripts.build_careers import category_distribution
        values = category_distribution({"1": 3.0, "2": 1.0})
        self.assertEqual(values[0], {"code": "1", "pct": 75.0})
        self.assertEqual(values[1], {"code": "2", "pct": 25.0})

    def test_unusable_weights_cannot_generate_statistics(self):
        from scripts.build_careers import category_distribution
        self.assertEqual(category_distribution({}), [])
        self.assertEqual(category_distribution({"1": 0.0}), [])


if __name__ == "__main__":
    unittest.main()
