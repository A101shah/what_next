import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const read = p => readFileSync(new URL("../"+p,import.meta.url),"utf8");
const graph=JSON.parse(read("data/learning_v2/graph.json"));
const bank=JSON.parse(read("data/learning_v2/diagnostic_questions.json"));
const app={};
runInNewContext(read("learning.js"),{window:app});
const model=app.WhatNextLearning;
test("all six live learning pathways are fully connected and prerequisites are enforced",()=>{
  const ids=new Set(graph.concepts.map(c=>c.concept_id));
  const choices=["ai","ds","software","cyber","cloud","product"];
  assert.equal(graph.concepts.length,107);
  assert.equal(graph.prerequisites.length,139);
  for(const career of choices){
    const scoped=model.scope(graph,career);
    assert.ok(scoped.required.size>10,career);
    for(const p of scoped.required)assert.ok(ids.has(p),"missing "+p);
    const empty=model.recommend(graph,career,{},20);
    for(const recommendation of empty.recommendations){
      const topic=graph.concepts.find(c=>c.concept_id===recommendation.concept_id);
      assert.equal(topic.prerequisite_ids.length,0,"premature "+recommendation.concept_id);
      assert.equal(recommendation.rank_basis,"editorial_prerequisite_order_not_ml");
    }
    const completions=[];
    let count=0;
    while(count++<150){
      const suggestions=model.recommend(graph,career,{
        assessmentResults:Object.fromEntries(completions.map(id=>[id,{passed:true}]))
      },20);
      if(!suggestions.remaining) break;
      assert.ok(suggestions.recommendations.length,"curriculum deadlock "+career);
      for(const proposed of suggestions.recommendations){
        assert.ok(proposed.prerequisite_ids.every(id=>completions.includes(id)),"unmet prerequisite "+proposed.concept_id);
        completions.push(proposed.concept_id);
      }
    }
    assert.equal(model.recommend(graph,career,{
      assessmentResults:Object.fromEntries(completions.map(id=>[id,{passed:true}]))
    },20).remaining,0,"unreachable topics "+career);
  }
});
test("a technical subject recommendation cannot be advertised as a neural prediction",()=>{
  const ai=model.recommend(graph,"ai",{selfReportedConcepts:["python-basics"]},5);
  assert.ok(ai.recommendations.some(r=>r.concept_id==="python-control-flow"));
  for(const r of ai.recommendations){
    assert.equal(r.rank_basis,"editorial_prerequisite_order_not_ml");
    assert.ok(r.evidence_note);
  }
  const published=JSON.parse(read("data/real_learning/public_evidence_dashboard.json"));
  assert.equal(published.model_status.validated_recommendation_accuracy,null);
});
test("all authored questions have stable skill IDs and no outcome labels for real users",()=>{
  const valid=new Set(graph.concepts.map(c=>c.concept_id));
  assert.equal(bank.questions.length,45);
  assert.ok(bank.questions.every(q=>valid.has(q.concept_id) &&
      q.provenance==="editorial_unvalidated_practice_check"));
  assert.ok(!("student_responses" in bank));
});
