import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const read = file => readFileSync(new URL("../"+file, import.meta.url), "utf8");
const summary = JSON.parse(read("data/real_learning/public_evidence_dashboard.json"));
test("public counts match signed preview provenance and source catalog",()=>{
 const sample=summary.source_summary.preview;
 const provenance=JSON.parse(read("data/real_learning/manifest.json"));
 assert.equal(sample.records,100);
 assert.equal(sample.correct+sample.incorrect,sample.records);
 assert.equal(sample.learners,5);
 assert.equal(sample.unique_questions,91);
 assert.equal(sample.sha256,provenance.preview_expected_sha256);
 assert.equal(summary.source_summary.onet.records,31821);
 assert.ok(summary.model_status.validated_recommendation_accuracy===null);
 assert.ok(summary.model_status.trained_gru_next_response_accuracy===null);
 assert.equal(summary.sources.length,5);
});
test("research page and navigation are present without learner-level data",()=>{
 const html=read("index.html"),app=read("app.js");
 assert.ok(html.includes('data-view="research"'));
 assert.ok(html.includes('src="research-evidence.js"'));
 assert.ok(html.includes('id="research-source-list"'));
 assert.ok(html.includes("WhatNext_Compiled_Learning_Dataset_V3.csv"));
 assert.ok(app.includes('research:"Research data lab"'));
 const dump=read("data/real_learning/public_evidence_dashboard.json");
 assert.ok(!dump.includes("source_student_id"));
 assert.ok(!dump.includes("user_answer"));
});
test("research script renders and filters source rows using actual metadata",async()=>{
 const listeners=new Map(),nodes=new Map();
 const element=selector=>{
   if(!nodes.has(selector)){
     const handlers=new Map();
     nodes.set(selector,{
       innerHTML:"",textContent:"",dataset:{},style:{},
       classList:{toggle(){}},setAttribute(name,value){this[name]=value;},
       addEventListener(event,cb){handlers.set(event,cb)},
       dispatch(event,evt){handlers.get(event)?.(evt);}
     });
   }
   return nodes.get(selector);
 };
 const filters=["all","Career evidence","Learning behavior"].map(id=>({
   dataset:{researchFilter:id},classList:{toggle(){}},setAttribute(){}
 }));
 element("#research-accuracy-bar span");
 const doc={
   querySelector:element,
   querySelectorAll:()=>filters,
   addEventListener:(event,cb)=>listeners.set(event,cb)
 };
 const context={window:{},document:doc,fetch:async()=>({
   ok:true,json:async()=>summary
 })};
 runInNewContext(read("research-evidence.js"),context);
 await listeners.get("DOMContentLoaded")();
 assert.ok(element("#research-stat-grid").innerHTML.includes("31,821"));
 assert.equal((element("#research-source-list").innerHTML.match(/<article/g)||[]).length,5);
 assert.ok(element("#research-model-status").innerHTML.includes("Not trained"));
 assert.equal(element("#research-accuracy-bar span").style.width,"67%");
 element(".research-filters").dispatch("click",{
   target:{closest:()=>({dataset:{researchFilter:"Learning behavior"}})}
 });
 assert.equal((element("#research-source-list").innerHTML.match(/<article/g)||[]).length,2);
});


test("actual GRU holdout is reported below the simple baseline, never as recommendation accuracy",()=>{
 const m=JSON.parse(read("data/real_learning/assist2009_gru_pilot_metrics.json"));
 const dashboard=JSON.parse(read("data/real_learning/public_evidence_dashboard.json"));
 assert.equal(m.interactions_total,2624);
 assert.equal(m.learners_total,52);
 assert.equal(m.learners_holdout,11);
 assert.equal(m.holdout_next_response_events,509);
 assert.equal(m.gru_accuracy,0.536346);
 assert.equal(m.majority_class_accuracy_baseline,0.595285);
 assert.ok(m.gru_accuracy < m.majority_class_accuracy_baseline);
 assert.equal(dashboard.model_status.gru_mathematics_pilot_accuracy,m.gru_accuracy);
 assert.equal(dashboard.model_status.gru_mathematics_pilot_baseline_accuracy,m.majority_class_accuracy_baseline);
 assert.equal(dashboard.model_status.trained_gru_next_response_accuracy,null);
 assert.equal(m.not_production_ready,true);
 assert.equal(m.not_whatnext_next_lesson_accuracy,true);
});
test("research interface clearly distinguishes small math pilot from model deployed for next lessons",()=>{
 const html=read("index.html"),script=read("research-evidence.js");
 assert.ok(html.includes('id="research-pilot-metrics"'));
 assert.ok(html.includes('id="research-pilot-warning"'));
 assert.ok(script.includes("Underperformed the simple baseline"));
 assert.ok(script.includes("trace-disjoint"));
 assert.ok(html.includes("assist2009_gru_pilot_metrics.json"));
});
