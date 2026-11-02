import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const model=JSON.parse(read("data/career_hybrid_nn.json"));
const page={};
runInNewContext(read("neural.js"),{window:page,atob:globalThis.atob});
test("hybrid contains real PCA, four K-Means clusters, and one trainable MLP",()=>{
  assert.equal(model.samples,6517);
  assert.deepEqual(model.nn.shape,[31,20,12,12]);
  assert.equal(model.pca.n_components,7);
  assert.equal(model.pca.input_columns.length,8);
  assert.equal(model.kmeans.n_clusters,4);
  assert.equal(model.nn.weights.length,3);
  assert.equal(model.metrics.accuracy,.41411);
  assert.equal(model.metrics.macro_f1,.35764);
  assert.ok(model.metrics.accuracy>model.metrics.reference_mlp_accuracy);
  assert.ok(model.pca.explained_variance>.93);
  assert.match(read("app.js"),/data\/career_hybrid_nn\.json/);
  assert.doesNotMatch(read("app.js"),/loadOptional\("data\/career_nn\.json"\)/);
});
test("browser projection, K-Means distances, and quantized NN match independent Python predictions",()=>{
  const cases=[
    {x:{bands:[4,4,4,4,3,4,3],years:4,educationLevel:3,educationField:7},code:"25",p:.40138885531214047},
    {x:{bands:[1,2,3,2,1,2,1],years:0,educationLevel:2,educationField:14},code:"23",p:.7276067681678474},
    {x:{bands:[5,5,5,5,5,5,5],years:20,educationLevel:3,educationField:9},code:"13",p:.24360702535064718}
  ];
  for(const example of cases){
    const result=page.WhatNextNeural.predict(model,example.x);
    assert.equal(result.length,12);
    assert.equal(result[0].code,example.code);
    assert.ok(Math.abs(result[0].probability-example.p)<1e-6);
    assert.ok(Math.abs(result.reduce((sum,p)=>sum+p.probability,0)-1)<1e-10);
  }
});
test("hybrid and baseline are occupational models; lesson accuracy remains unmeasured",()=>{
  const research=JSON.parse(read("data/real_learning/public_evidence_dashboard.json"));
  assert.equal(research.model_status.validated_recommendation_accuracy,null);
  assert.equal(model.task.includes("NOT prediction of next learning topic"),true);
  assert.match(research.model_status.occupational_classification,/Single deployed PCA.*K-Means.*MLP/);
  assert.equal(model.metrics.test_size,1304);
});
