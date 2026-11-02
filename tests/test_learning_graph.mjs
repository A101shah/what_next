import test from "node:test";
import assert from "node:assert/strict";
import { makeLearningGraph, readQuotedCsv } from "../scripts/build_learning_graph.mjs";
import { getNextConcepts } from "../scripts/recommend_learning.mjs";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../scripts/build_learning_graph.mjs";

const result = makeLearningGraph();
const graph = {
  concepts: result.concepts, topic_concepts: result.topicLinks,
  career_concepts: result.careerLinks, prerequisites: result.edges
};
test("six curricula and every topic map to canonical concepts", () => {
  assert.equal(result.counts.careers, 6);
  assert.equal(result.counts.source_topics, 48);
  assert.equal(result.counts.atomic_concepts, 107);
  assert.ok(result.counts.topic_concept_links >= 150);
});
test("all generated artifacts are reproducible byte for byte", () => {
  for (const [rel, expected] of Object.entries(result.generated)) {
    assert.equal(fs.readFileSync(path.join(ROOT, rel), "utf8"), expected, rel);
  }
});
test("no user success records or fake measured skill proficiency", () => {
  for (const concept of graph.concepts) {
    assert.equal(concept.mastery_evidence, "not_measured");
    assert.equal(concept.provenance, "human_curated_v2");
  }
});
test("recommendations respect concept prerequisites", () => {
  const baseline = getNextConcepts(graph, "ai", [], 30);
  assert.ok(baseline.recommendations.length > 0);
  assert.ok(baseline.recommendations.every((r) => r.prerequisite_ids.length === 0));
  assert.ok(!baseline.recommendations.some((r) => r.concept_id === "nn-basics"));
  const afterPython = getNextConcepts(graph, "ai", ["python-basics"], 50);
  assert.ok(afterPython.recommendations.some((r) => r.concept_id === "python-control-flow"));
  assert.ok(!afterPython.recommendations.some((r) => r.concept_id === "nn-basics"));
});
test("outside-career prerequisites are included where needed", () => {
  const product = getNextConcepts(graph, "product", [], 100);
  assert.ok(product.remaining_in_scope >= 27);
  // Product curriculum includes K-Means; its EDA prerequisite is included.
  assert.ok(product.remaining_in_scope > result.careerLinks.filter((x) => x.career_id === "product").length);
});
test("unknown career, invalid goal and invalid limit are rejected", () => {
  assert.throws(() => getNextConcepts(graph, "bad-career"));
  assert.throws(() => getNextConcepts(graph, "ai", [], 5, "cloud-iam"));
  assert.throws(() => getNextConcepts(graph, "ai", [], 0));
});
test("CSV parser round-trips a pair of links", () => {
  assert.equal(readQuotedCsv('"a","b"\n"x","y"\n')[0].a, "x");
});
