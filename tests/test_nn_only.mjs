// Regression tests for the SINGLE deployed OECD career classifier: an actual MLP.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = file => readFileSync(new URL("../"+file,import.meta.url),"utf8");
const html=read("index.html"), js=read("app.js"), weights=JSON.parse(read("data/career_hybrid_nn.json"));

test("Career Intelligence exposes only the MLP model without alternative model selection",()=>{
  for(const source of [html,js,read("README.md"),read("requirements.txt")]){
    assert.doesNotMatch(source,/catboost|cat.boost/i);
  }
  assert.doesNotMatch(html,/id="nn-model-select"/);
  assert.match(html,/src="neural.js"/);
  assert.match(html,/nn-model-intro/);
  assert.match(js,/state\.neuralModel/);
  assert.doesNotMatch(js,/career_catboost|WhatNextCatBoost|catboostModel/);
  for(const old of ["catboost.js","data/career_catboost.json",
                     "scripts/train_catboost.py","tests/test_catboost_search.mjs"])
    assert.equal(existsSync(new URL("../"+old,import.meta.url)),false,old);
  assert.doesNotMatch(read("requirements.txt"),/\bcatboost\b/i);
});

test("the actual PCA/KMeans/31→20→12→12 NN still scores a valid input",()=>{
  const controls=new Map();
  const element=selector=>{
    if(!controls.has(selector))controls.set(selector,{
      textContent:"",innerHTML:"",value:"",hidden:false,disabled:false,
      classList:{add(){},remove(){}},addEventListener(){}
    });
    return controls.get(selector);
  };
  const context={ document:{
      querySelector:element,querySelectorAll:()=>[],
      addEventListener(){}
    },
    atob:globalThis.atob,
    localStorage:{getItem:()=>null,setItem(){}},
    console,
    fetch:async()=>({ok:false}),
    setTimeout:()=>1,clearTimeout(){}
  };
  context.window=context;
  runInNewContext(read("neural.js"),context);
  runInNewContext(js+"\n;globalThis.__testApp={state,renderNeuralStatus,runCareerNeuralNetwork};",context);
  const engine=context.WhatNextNeural,app=context.__testApp;
  app.state.neuralModel=weights;
  app.state.paths=[];
  app.renderNeuralStatus();
  assert.equal(element("#nn-run").disabled,false);
  assert.match(element("#nn-performance").innerHTML,/41\.41%/);
  assert.match(element("#nn-performance").innerHTML,/NEURAL NETWORK/);
  assert.match(element("#nn-performance").innerHTML,/35\.76%/);
  const inputs=[4,4,4,4,3,4,3];
  engine.SKILLS.forEach(([id],index)=>{element("#nn-"+id).value=String(inputs[index]);});
  element("#nn-years").value="4";
  element("#nn-level").value="3";
  element("#nn-field").value="7";
  app.runCareerNeuralNetwork({preventDefault(){}});
  const result=element("#nn-output").innerHTML;
  assert.match(result,/NEURAL NETWORK/);
  assert.match(result,/Information and communications technology professionals/);
  assert.doesNotMatch(result,/catboost/i);
  const direct=engine.predict(weights,{bands:inputs,years:4,educationLevel:3,educationField:7});
  assert.equal(direct.length,12);
  assert.equal(direct[0].code,"25");
  assert.ok(Math.abs(direct.reduce((sum,x)=>sum+x.probability,0)-1)<1e-9);
});

test("model metrics are the existing documented occupational holdout, not lesson accuracy",()=>{
  assert.deepEqual(weights.nn.shape,[31,20,12,12]);
  assert.equal(weights.samples,6517);
  assert.equal(weights.training_samples,5213);
  assert.equal(weights.test_samples,1304);
  assert.equal(weights.metrics.accuracy,.41411);
  assert.equal(weights.metrics.macro_f1,.35764);
  const dashboard=JSON.parse(read("data/real_learning/public_evidence_dashboard.json"));
  assert.match(dashboard.model_status.occupational_classification,/Single deployed PCA.*K-Means.*MLP/);
  assert.equal(dashboard.model_status.validated_recommendation_accuracy,null);
});
