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
  assert.equal(readQuotedCsv('a,b\n"x","y"\n')[0].a, "x");
});

import os from "node:os";
function requireLikeOsTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whatnext-graph-"));
  for (const rel of ["data/paths.json", "data/learning_v2/concepts.json",
    "data/learning_v2/topic_concepts.csv", "data/learning_v2/manifest.json"]) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
  }
  return { dir };
}

test("validation rejects broken topic references", () => {
  const os = requireLikeOsTmp();
  try {
    const csvPath = path.join(os.dir, "data/learning_v2/topic_concepts.csv");
    const csv = fs.readFileSync(csvPath, "utf8");
    fs.writeFileSync(csvPath, csv.replace('"ai-0"', '"does-not-exist"'));
    assert.throws(() => makeLearningGraph(os.dir), /Unknown topic/);
  } finally { fs.rmSync(os.dir, { recursive: true, force: true }); }
});
test("validation rejects circular prerequisites", () => {
  const tmp = requireLikeOsTmp();
  try {
    const file = path.join(tmp.dir, "data/learning_v2/concepts.json");
    const concepts = JSON.parse(fs.readFileSync(file, "utf8"));
    concepts.find((c) => c.concept_id === "python-basics").prerequisite_ids = ["python-functions"];
    fs.writeFileSync(file, JSON.stringify(concepts));
    assert.throws(() => makeLearningGraph(tmp.dir), /cycle/i);
  } finally { fs.rmSync(tmp.dir, { recursive: true, force: true }); }
});


test("compiled CSV has 170 consistent topic-to-concept rows and provenance flags", () => {
  const content = fs.readFileSync(path.join(ROOT, "data/learning_v2/WhatNext_Compiled_Learning_Dataset_V2.csv"), "utf8");
  const [head, ...lines] = content.trimEnd().split(/\r?\n/);
  const cols = JSON.parse("[" + head + "]");
  const records = lines.map((line) => {
    const values = JSON.parse("[" + line + "]");
    assert.equal(values.length, cols.length);
    return Object.fromEntries(cols.map((name, i) => [name, values[i]]));
  });
  const mapped = new Set(graph.topic_concepts.map((x) => x.topic_id + "|" + x.concept_id));
  const catalog = new Map(graph.concepts.map((x) => [x.concept_id, x]));
  assert.equal(records.length, 170);
  assert.equal(cols.length, 20);
  for (const row of records) {
    assert.ok(mapped.has(row.original_topic_id + "|" + row.concept_id));
    assert.equal(row.catalog_provenance, "human_curated_v2");
    assert.equal(row.mapping_provenance, "human_curated_v2");
    assert.equal(row.mastery_evidence_status, "not_measured");
    assert.equal(row.learning_resource_verification, "not_live_verified");
    assert.equal(row.prerequisite_concept_ids, catalog.get(row.concept_id).prerequisite_ids.join(";"));
  }
});
