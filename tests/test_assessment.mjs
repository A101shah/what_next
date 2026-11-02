import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const graph = JSON.parse(read("data/learning_v2/graph.json"));
const bank = JSON.parse(read("data/learning_v2/diagnostic_questions.json"));
const browser = {};
runInNewContext(read("learning.js"), { window: browser });
const engine = browser.WhatNextLearning;

test("all six careers have valid concept scopes and at least one knowledge check", () => {
  for (const career of ["ai","ds","software","cyber","cloud","product"]) {
    const scoped = engine.scope(graph, career);
    assert.ok(scoped.required.size >= scoped.focus.size);
    assert.ok(engine.checksForCareer(graph, bank, career).length > 0, career);
    assert.ok(engine.recommend(graph, career, {}, 5).recommendations.length > 0);
  }
});
test("all 45 editorial questions have valid keys and exactly three questions per concept", () => {
  const ids = new Set(graph.concepts.map(x => x.concept_id));
  assert.equal(bank.questions.length, 45);
  const counts = new Map(), questionIds = new Set();
  for (const q of bank.questions) {
    assert.ok(ids.has(q.concept_id));
    assert.ok(!questionIds.has(q.question_id));
    questionIds.add(q.question_id);
    assert.equal(q.options.length, 4);
    assert.ok(Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index <= 3);
    assert.equal(q.provenance, "editorial_unvalidated_practice_check");
    counts.set(q.concept_id, (counts.get(q.concept_id)||0)+1);
  }
  assert.equal(counts.size, 15);
  for (const count of counts.values()) assert.equal(count, 3);
});
test("only passed checks and separately labeled self-reports unlock prerequisites", () => {
  const empty = engine.recommend(graph, "ai", {});
  const checked = engine.recommend(graph, "ai", { assessmentResults: {"python-basics":{passed:true}} });
  const declared = engine.recommend(graph, "ai", { selfReportedConcepts:["python-basics"] });
  assert.ok(empty.recommendations.some(r=>r.concept_id === "python-basics"));
  assert.ok(!empty.recommendations.some(r=>r.concept_id === "python-control-flow"));
  assert.ok(checked.recommendations.some(r=>r.concept_id === "python-control-flow"));
  assert.ok(declared.recommendations.some(r=>r.concept_id === "python-control-flow"));
  assert.equal(checked.checked_in_scope, 1);
  assert.equal(declared.checked_in_scope, 0);
  assert.equal(declared.self_reported_in_scope, 1);
  assert.ok(declared.recommendations.find(r=>r.concept_id === "python-control-flow")
    .self_reported_prerequisite_ids.includes("python-basics"));
});
test("graded checks require all answers and three correct for pass", () => {
  const qs = engine.checksForCareer(graph, bank, "ai").find(x=>x.concept_id==="python-basics").items;
  const correct = qs.map(q=>q.correct_index);
  assert.equal(engine.grade(qs, correct).passed, true);
  assert.equal(engine.grade(qs, correct).score, 3);
  assert.equal(engine.grade(qs, [correct[0],correct[1],(correct[2]+1)%4]).passed, false);
  assert.throws(()=>engine.grade(qs, [correct[0],correct[1],null]), /Answer all three/);
});
test("graph prerequisite cycles and bad career IDs fail closed", () => {
  assert.throws(()=>engine.scope(graph, "nonsense"), /Unknown/);
  const broken = structuredClone(graph);
  broken.concepts.find(x=>x.concept_id==="python-basics").prerequisite_ids=["python-functions"];
  assert.throws(()=>engine.recommend(broken, "ai"), /Circular/);
});
test("V3 flat data is consistent with graph and questions", () => {
  const lines = read("data/learning_v2/WhatNext_Compiled_Learning_Dataset_V3.csv").trim().split(/\r?\n/);
  const cols = JSON.parse("[" + lines.shift() + "]");
  assert.equal(cols.length,23);
  assert.equal(lines.length,170);
  const counts = new Map();
  for(const q of bank.questions) counts.set(q.concept_id,(counts.get(q.concept_id)||0)+1);
  const known = new Set(graph.concepts.map(c=>c.concept_id));
  for(const line of lines){
    const values = JSON.parse("[" + line + "]");
    assert.equal(values.length,cols.length);
    const row = Object.fromEntries(cols.map((k,i)=>[k,values[i]]));
    assert.ok(known.has(row.concept_id));
    assert.equal(Number(row.practice_question_count),counts.get(row.concept_id)||0);
    assert.equal(row.mastery_evidence_status,"not_measured");
  }
});
test("diagnostic question CSV has one row per editorial question", () => {
  const lines = read("data/learning_v2/WhatNext_Diagnostic_Question_Bank_V1.csv").trim().split(/\r?\n/);
  assert.equal(lines.length,46);
  const cols = JSON.parse("["+lines.shift()+"]");
  assert.equal(cols.length,10);
  for(const line of lines){
    const values=JSON.parse("["+line+"]");
    assert.equal(values.length,10);
    const row=Object.fromEntries(cols.map((key,i)=>[key,values[i]]));
    assert.equal(row.question_provenance,"editorial_unvalidated_practice_check");
    assert.ok(["1","2","3","4"].includes(row.correct_option_1_based));
  }
});
test("assessments are connected to the original HTML and app navigation", () => {
  const html=read("index.html"),app=read("app.js");
  for(const name of ["assessment-quiz","assessment-feedback","assessment-concept-select",
    "assessment-check-list","learning-suggestions","learning-preview","learning-roadmap-bridge"]){
    assert.ok(html.includes('id="'+name+'"'),name);
  }
  assert.ok(html.includes('src="assessment-ui.js"'));
  assert.ok(html.includes('data-view="assessment"'));
  assert.ok(app.includes("WhatNextAssessment?.refresh()"));
});
test("browser assessment view loads from public JSON and saves no answer selections", async () => {
  const listeners=new Map(),nodes=new Map(),saved=new Map();
  const element=(key)=>{
    if(!nodes.has(key)){
      const events = {};
      nodes.set(key, {
        innerHTML:"",textContent:"",value:"",disabled:false, className:"",
        addEventListener(name,listener){events[name]=listener;},
        trigger(name,event){ if(events[name]) return events[name](event); },
        classList:{add(){},remove(){}},
        scrollIntoView(){}, click(){}, setAttribute(){}, dataset:{}
      });
    }
    return nodes.get(key);
  };
  const localStorage={
    getItem(key){return saved.get(key)||null;},
    setItem(key,value){saved.set(key,value);}
  };
  localStorage.setItem("whatnext:profile:v1",JSON.stringify({career:"ai"}));
  const document={
    querySelector:element,
    addEventListener(name,fn){listeners.set(name,fn);}
  };
  const root = {WhatNextLearning:engine, clearTimeout(){}, setTimeout(){return 1}};
  const fetch = async (name)=>({
    ok:true, json:async()=>JSON.parse(read(name))
  });
  runInNewContext(read("assessment-ui.js"),{
    window:root,document,localStorage,fetch,Event:class {},Date,console,Set,Map,Number,Array,String
  });
  await listeners.get("DOMContentLoaded")();
  assert.ok(element("#learning-suggestions").innerHTML.includes("python"));
  assert.ok(element("#assessment-quiz").innerHTML.includes("practice"));
  assert.ok(element("#learning-preview").innerHTML.includes("practice checks passed"));
  assert.equal(saved.has("whatnext:learning:evidence:v1"),false);
});
