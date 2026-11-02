/**
 * WhatNext AI: deterministic, offline V2 curriculum graph build.
 * No user data, online API, model training, or GitHub Actions.
 * Usage: node scripts/build_learning_graph.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const folder = "data/learning_v2";
const read = (root, name) => fs.readFileSync(path.join(root, name), "utf8");
const json = (obj) => JSON.stringify(obj, null, 2) + "\n";
const unique = (arr) => [...new Set(arr)];
const assert = (ok, description) => { if (!ok) throw Error(description); };

// Input CSV fields are quoted JSON string literals. They contain no newlines.
export function readQuotedCsv(text) {
  const rows = text.trim().split(/\r?\n/).map((row) => JSON.parse("[" + row + "]"));
  const columns = rows.shift();
  assert(columns && new Set(columns).size === columns.length, "Invalid CSV columns");
  return rows.map((values, line) => {
    assert(values.length === columns.length, "CSV column count mismatch at line " + (line + 2));
    return Object.fromEntries(columns.map((name, i) => [name, values[i]]));
  });
}

export function toQuotedCsv(fields, rows) {
  return [fields.join(","), ...rows.map((row) => fields.map((field) => JSON.stringify(String(row[field] ?? ""))).join(","))].join("\n") + "\n";
}
function gitBlobSha(text) {
  const bytes = Buffer.from(text, "utf8");
  return crypto.createHash("sha1").update(Buffer.from("blob " + bytes.length + "\0")).update(bytes).digest("hex");
}

export function makeLearningGraph(root = ROOT) {
  const syllabusText = read(root, "data/paths.json");
  const syllabus = JSON.parse(syllabusText);
  const concepts = JSON.parse(read(root, folder + "/concepts.json"));
  const topicLinks = readQuotedCsv(read(root, folder + "/topic_concepts.csv"));
  const sourceManifest = JSON.parse(read(root, folder + "/manifest.json"));

  const topicById = new Map();
  const careerById = new Map();
  for (const career of syllabus) {
    assert(!careerById.has(career.id), "Duplicate career " + career.id);
    careerById.set(career.id, career);
    for (const topic of career.topics) {
      assert(!topicById.has(topic.id), "Duplicate topic " + topic.id);
      topicById.set(topic.id, { ...topic, career_id: career.id });
    }
  }
  const conceptById = new Map();
  for (const concept of concepts) {
    const id = concept.concept_id;
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), "Bad concept ID " + id);
    assert(!conceptById.has(id), "Duplicate concept ID " + id);
    assert(["beginner", "intermediate", "advanced"].includes(concept.level), "Invalid difficulty " + id);
    assert(typeof concept.name === "string" && concept.name.length >= 4, "Missing concept name " + id);
    assert(typeof concept.demonstration_task === "string" && concept.demonstration_task.length >= 15, "Missing exercise " + id);
    assert(concept.provenance === "human_curated_v2" && concept.mastery_evidence === "not_measured", "Misleading provenance " + id);
    assert(Array.isArray(concept.prerequisite_ids), "Prerequisites must be a list " + id);
    assert(unique(concept.prerequisite_ids).length === concept.prerequisite_ids.length, "Repeated prerequisite " + id);
    conceptById.set(id, concept);
  }
  const visiting = new Set();
  const visited = new Set();
  function walk(id) {
    assert(conceptById.has(id), "Missing prerequisite " + id);
    if (visiting.has(id)) throw Error("Prerequisite cycle at " + id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const req of conceptById.get(id).prerequisite_ids) {
      assert(req !== id, "Self prerequisite " + id);
      walk(req);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of conceptById.keys()) walk(id);
  const uniqueLinks = new Set();
  for (const link of topicLinks) {
    assert(topicById.has(link.topic_id), "Unknown topic in mapping " + link.topic_id);
    assert(conceptById.has(link.concept_id), "Unknown concept in mapping " + link.concept_id);
    assert(link.relationship === "curriculum_mapping" && link.provenance === "human_curated_v2", "Invalid mapping provenance");
    const pair = link.topic_id + "|" + link.concept_id;
    assert(!uniqueLinks.has(pair), "Duplicate topic/concept pair " + pair);
    uniqueLinks.add(pair);
  }
  for (const id of topicById.keys()) assert(topicLinks.some((link) => link.topic_id === id), "Unmapped topic " + id);
  for (const id of conceptById.keys()) assert(topicLinks.some((link) => link.concept_id === id), "Unmapped concept " + id);

  const byCareerAndConcept = new Map();
  for (const link of topicLinks) {
    const career = topicById.get(link.topic_id).career_id;
    const item = { career_id: career, concept_id: link.concept_id, provenance: "curriculum_derived_v2" };
    byCareerAndConcept.set(career + "|" + link.concept_id, item);
  }
  const careerLinks = [...byCareerAndConcept.values()].sort(
    (a,b) => a.career_id.localeCompare(b.career_id) || a.concept_id.localeCompare(b.concept_id)
  );
  const edges = concepts.flatMap((c) => c.prerequisite_ids.map((pre) => ({
    prerequisite_concept_id: pre, concept_id: c.concept_id,
    relationship: "recommended_before", provenance: "human_curated_v2"
  })));
  const counts = {
    careers: syllabus.length, source_topics: topicById.size, atomic_concepts: concepts.length,
    prerequisite_edges: edges.length, topic_concept_links: topicLinks.length,
    career_concept_links: careerLinks.length
  };
  const manifest = {
    version: "2.0.0",
    created_utc: sourceManifest.created_utc,
    original_syllabus: "data/paths.json",
    original_syllabus_blob_sha: gitBlobSha(syllabusText),
    catalog_provenance: "editorial human-curated teaching concepts; NOT published skill importance, diagnosed proficiency, measured learning outcomes, or verified job requirements",
    career_links_provenance: "derived from the existing six human-curated pathway topic associations; NOT empirical O*NET skills",
    counts,
    verification: {
      structure: "passed", external_resource_urls: "no_new_urls_in_v2",
      education_effectiveness: "not_tested", student_outcomes: "none"
    },
    validation_errors: []
  };
  return {
    syllabus, concepts, topicLinks, careerLinks, edges, counts,
    generated: {
      [folder + "/graph.json"]: json({
        version: "2.0.0", concepts, topic_concepts: topicLinks,
        career_concepts: careerLinks, prerequisites: edges
      }),
      [folder + "/career_concepts.csv"]: toQuotedCsv(["career_id","concept_id","provenance"], careerLinks),
      [folder + "/concept_prerequisites.csv"]: toQuotedCsv(
        ["prerequisite_concept_id","concept_id","relationship","provenance"], edges),
      [folder + "/manifest.json"]: json(manifest)
    }
  };
}

const directExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directExecution) {
  try {
    const check = process.argv.includes("--check");
    const result = makeLearningGraph();
    for (const [name, expected] of Object.entries(result.generated)) {
      const target = path.join(ROOT, name);
      if (check) {
        assert(fs.existsSync(target) && fs.readFileSync(target, "utf8") === expected,
          "Outdated generated file: " + name + " — run node scripts/build_learning_graph.mjs");
      } else fs.writeFileSync(target, expected, "utf8");
    }
    console.log((check ? "Validated" : "Regenerated") + " curriculum graph: " + JSON.stringify(result.counts));
  } catch (e) {
    console.error("Learning graph build failed:", e.message);
    process.exitCode = 1;
  }
}
