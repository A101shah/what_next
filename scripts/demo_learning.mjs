/**
 * Example:
 * node scripts/demo_learning.mjs ai python-basics,python-control-flow,python-functions
 * node scripts/demo_learning.mjs product spreadsheet-basics
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./build_learning_graph.mjs";
import { getNextConcepts } from "./recommend_learning.mjs";
const career = process.argv[2] || "ai";
const completed = (process.argv[3] || "").split(",").map((id) => id.trim()).filter(Boolean);
try {
  const graph = JSON.parse(fs.readFileSync(path.join(ROOT, "data/learning_v2/graph.json"), "utf8"));
  const results = getNextConcepts(graph, career, completed, 5);
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
