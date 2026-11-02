import fs from "node:fs";
import path from "node:path";
import { makeLearningGraph, ROOT } from "./build_learning_graph.mjs";
try {
  const graph = makeLearningGraph();
  for (const [file, expected] of Object.entries(graph.generated)) {
    if (fs.readFileSync(path.join(ROOT, file), "utf8") !== expected)
      throw Error("Stale output: " + file);
  }
  console.log("Learning graph validated: " + JSON.stringify(graph.counts));
} catch (error) {
  console.error("Learning graph validation failed:", error.message);
  process.exitCode = 1;
}
