import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
const paths={
 "data/learning_v2/graph.json":"graph",
 "data/learning_v2/diagnostic_questions.json":"questions",
 "data/real_learning/public_evidence_dashboard.json":"research",
 "data/learning_v2/WhatNext_Compiled_Learning_Dataset_V3.csv":"curriculum",
 "learning.js":"script"
};
test("browser diagnostic fetch checks all real public assets",async()=>{
  const mockDocument={addEventListener(){},querySelector(){return null}};
  const host={location:{origin:"https://a101shah.github.io"},fetch:async url=>{
    const path=url.split("?")[0];
    if(!paths[path])return {ok:false,status:404};
    const content=read(path);
    return {ok:true,status:200,
      json:async()=>JSON.parse(content),text:async()=>content};
  }};
  runInNewContext(read("deployment-diagnostics.js"),{window:host,document:mockDocument,Date});
  const outcome=await host.WhatNextDeploymentDiagnostics.run();
  assert.equal(outcome.total,5);
  assert.equal(outcome.passed,5);
  assert.equal(outcome.origin,"https://a101shah.github.io");
});
test("browser diagnostic does not mistake missing/malformed assets for a successful deployment",async()=>{
  const host={location:{origin:"https://a101shah.github.io"},fetch:async()=>({ok:false,status:404})};
  runInNewContext(read("deployment-diagnostics.js"),{window:host,document:{addEventListener(){}},Date});
  const outcome=await host.WhatNextDeploymentDiagnostics.run();
  assert.equal(outcome.passed,0);
  assert.equal(outcome.total,5);
});
test("live verification control is available from Research Data Lab",()=>{
  const html=read("index.html");
  assert.ok(html.includes('id="run-deployment-check"'));
  assert.ok(html.includes('id="deployment-check-result"'));
  assert.ok(html.includes('src="deployment-diagnostics.js"'));
});
