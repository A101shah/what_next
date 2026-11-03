import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=read("index.html"),app=read("app.js"),styles=read("styles.css");

test("Career Studio and its resume editor are completely removed",()=>{
  assert.doesNotMatch(html,/data-view="career"|id="view-career"|id="download-resume"|id="print-resume"|id="resume-preview"/);
  assert.doesNotMatch(app,/fillResumeFields|renderResume|resumeMarkup|downloadResume|profile\.resume|navigate\("career"\)/);
  assert.doesNotMatch(styles,/#view-career|\.resume-paper|\.career-layout|\.resume-editor/);
  assert.match(html,/data-view="evidence"/);
  assert.match(html,/data-view="skills"/);
  assert.match(html,/id="profile-form"/);
  assert.equal([...html.matchAll(/<button\b/g)].length,40);
});

test("Retired sequence-model files, UI and research metrics are gone",()=>{
  for(const path of [
    "scripts/train_assistments_pilot.py","scripts/train_knowledge_tracing.py",
    "scripts/train_ednet_full_streaming.py","scripts/download_full_ednet.py",
    "scripts/verify_full_ednet.py","tests/test_full_ednet_preflight.py",
    "tests/test_full_ednet_streaming.py",
    "data/real_learning/assist2009_gru_pilot_metrics.json",
    "data/real_learning/verification_status_2026-11-02.json"
  ]) assert.equal(existsSync(new URL("../"+path,import.meta.url)),false,path);
  assert.doesNotMatch(html,/GRU|id="research-pilot-metrics"|research-pilot-result/i);
  assert.doesNotMatch(read("research-evidence.js"),/GRU|deep_knowledge_tracing|research-pilot/i);
  assert.doesNotMatch(styles,/research-pilot|GRU/i);
  const research=JSON.parse(read("data/real_learning/public_evidence_dashboard.json"));
  assert.equal(Object.keys(research.model_status).some(key=>/gru|deep_knowledge_tracing/i.test(key)),false);
  assert.equal(research.model_status.validated_recommendation_accuracy,null);
  assert.equal(research.sources.length,5);
});

test("Live PCA/KMeans/MLP model and prerequisite curriculum remain intact",()=>{
  const model=JSON.parse(read("data/career_hybrid_nn.json"));
  const graph=JSON.parse(read("data/learning_v2/graph.json"));
  assert.deepEqual(model.nn.shape,[31,20,12,12]);
  assert.equal(model.metrics.accuracy,0.41411);
  assert.equal(graph.concepts.length,107);
  assert.equal(graph.prerequisites.length,139);
  assert.match(app,/data\/career_hybrid_nn\.json/);
  assert.match(html,/id="nn-form"/);
});

test("Eight sidebar views still work and markup remains sound",()=>{
  const sidebar=[...html.matchAll(/class="nav-item(?: active)?"\s+data-view="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(sidebar,["overview","roadmap","assessment","skills","search","evidence","research","pulse"]);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  assert.equal(styles.split("{").length,styles.split("}").length);
});
