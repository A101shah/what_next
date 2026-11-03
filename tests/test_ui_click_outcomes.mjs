/** WhatNext UI interaction regression tests.
 * Run locally: node --test tests/test_ui_click_outcomes.mjs
 * These use actual app scripts and committed data in an isolated DOM mock.
 * They do not replace real Chromium/phone/browser or external-link testing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {runInNewContext} from "node:vm";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const json=p=>JSON.parse(read(p));
function environment(){
  const elements=new Map(),stored=new Map(),domHandlers=new Map();
  const suggestions=["machine learning","statistics","neural networks","rag","deployment"].map(helpTerm=>({
    dataset:{helpTerm},listeners:{},addEventListener(t,fn){this.listeners[t]=fn}
  }));
  const element=sel=>{
    if(!elements.has(sel)){
      const flags=new Set();
      elements.set(sel,{
        value:"",innerHTML:"",textContent:"",href:"",disabled:false,hidden:false,
        dataset:{},listeners:{},attrs:{},className:"",
        style:{setProperty(){}},
        classList:{
          add(name){flags.add(name)},remove(name){flags.delete(name)},
          toggle(name){if(flags.has(name)){flags.delete(name);return false;}flags.add(name);return true;}
        },
        addEventListener(t,fn){this.listeners[t]=fn},
        setAttribute(k,v){this.attrs[k]=v},
        after(){},click(){this.wasClicked=true},remove(){},scrollIntoView(){},
        dispatchEvent(){this.wasDispatched=true}
      });
    }
    return elements.get(sel);
  };
  const document={
    querySelector:element,
    querySelectorAll:s=>s===".help-suggestions [data-help-term]"?suggestions:[],
    addEventListener(type,fn){domHandlers.set(type,fn)},
    createElement:t=>element("#created-"+t),
    body:{append(){}},head:{appendChild(){}}
  };
  const dataPaths=[
    "data/paths.json","data/model.json","data/research.json",
    "data/careers.json","data/skill_evidence.json","data/career_hybrid_nn.json",
    "data/search_config.json","data/role_skills.json","data/skill_taxonomy.json",
    "data/learning_v2/graph.json","data/learning_v2/diagnostic_questions.json"
  ];
  const data=Object.fromEntries(dataPaths.map(p=>[p,json(p)]));
  let resumeHtml=null,printed=false;
  const url={createObjectURL(blob){resumeHtml=blob.parts.join("");return "blob:test"},revokeObjectURL(){}};
  const localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
  const context={document,localStorage,console,atob:globalThis.atob,
    location:{origin:"http://localhost"},clearTimeout(){},setTimeout(){return 1},
    scrollTo(){},print(){printed=true},URL:url,
    Blob:class{constructor(parts){this.parts=parts}},
    fetch:async url=>{
      const resource=data[url.split("?")[0]];
      return {ok:!!resource,json:async()=>resource};
    },
    Event:class{}
  };
  context.window=context;
  return {context,document,element,suggestions,stored,domHandlers,data,
    resume:()=>resumeHtml,printed:()=>printed};
}
test("static buttons and DOM IDs are unique; JavaScript assets exist",()=>{
  const html=read("index.html");
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length);
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(x=>x[1]);
  assert.ok(scripts.length>=8);
  for(const src of scripts)assert.ok(existsSync(new URL("../"+src,import.meta.url)),src);
  assert.match(html,/id="mobile-menu"[^>]*aria-expanded="false"/);
  assert.match(html,/id="run-deployment-check"/);
  assert.doesNotMatch(html,/catboost/i);
});
test("app starts, search suggestions work, skill/roadmap/NN/profile and resume buttons have results",async()=>{
  const e=environment(),c=e.context;
  for(const script of ["search.js","skills.js","neural.js"])runInNewContext(read(script),c);
  runInNewContext(read("app.js")+
    "\n;globalThis.__testApp={state,start,navigate};",c);
  const app=c.__testApp,el=e.element;
  el("#skill-scope").value="career";
  el("#skill-category").value="all";
  await app.start();
  assert.equal(app.state.paths.length,6);
  assert.match(el("#roadmap-list").innerHTML,/Python Foundations/);
  assert.match(el("#nn-performance").innerHTML,/41\.41%/);
  assert.ok(e.suggestions.every(x=>typeof x.listeners.click==="function"));
  e.suggestions[1].listeners.click();
  assert.equal(el("#help-query").value,"statistics");
  assert.match(el("#help-results").innerHTML,/statistics/i);
  assert.match(el("#help-google-link").href,/statistics/);
  el("#mobile-menu").listeners.click();
  assert.equal(el("#mobile-menu").attrs["aria-expanded"],"true");
  app.navigate("roadmap");
  assert.equal(el("#mobile-menu").attrs["aria-expanded"],"false");
  el("#custom-skill-input").value="Python";
  el("#custom-skill-form").listeners.submit({preventDefault(){}});
  assert.ok(app.state.profile.technicalSkills.some(x=>/python/i.test(x)));
  el("#roadmap-list").listeners.click({
    target:{closest:sel=>sel==="[data-complete]"?{dataset:{complete:"ai-0"}}:null}
  });
  assert.ok(app.state.profile.completed.includes("ai-0"));
  c.WhatNextNeural.SKILLS.forEach(([key],i)=>{el("#nn-"+key).value=String([4,4,4,4,3,4,3][i])});
  el("#nn-years").value="4";
  el("#nn-level").value="3";
  el("#nn-field").value="7";
  el("#nn-form").listeners.submit({preventDefault(){}});
  assert.match(el("#nn-output").innerHTML,/Information and communications technology professionals/);
  el("#resume-name").value="Sample Learner";
  el("#resume-name").listeners.input();
  el("#download-resume").listeners.click();
  assert.match(e.resume(),/<\/head><body>/);
  assert.match(e.resume(),/Sample Learner/);
  assert.match(e.resume(),/<\/body><\/html>$/);
  el("#print-resume").listeners.click();
  assert.equal(e.printed(),true);
  el("#career-select").value="ds";
  el("#student-name").value="Test Learner";
  el("#hours-range").value="9";
  el("#profile-form").listeners.submit({preventDefault(){}});
  assert.equal(app.state.profile.career,"ds");
  assert.equal(app.state.profile.name,"Test Learner");
  assert.equal(app.state.profile.hours,9);
});
test("skill self-report buttons give correct messages; a completed quiz saves a pass",async()=>{
  const e=environment(),c=e.context,el=e.element;
  let correctAnswers=null;
  const original=e.document.querySelector;
  e.document.querySelector=sel=>{
    if(sel.includes('assessment-quiz input[name=')&&sel.includes(':checked')){
      const i=Number(sel.match(/assessment-q-(\d+)/)?.[1]);
      return correctAnswers?.[i]!==undefined?{value:String(correctAnswers[i])}:null;
    }
    return original(sel);
  };
  runInNewContext(read("learning.js"),c);
  runInNewContext(read("assessment-ui.js"),c);
  await e.domHandlers.get("DOMContentLoaded")();
  const click=id=>el("#learning-suggestions").listeners.click({
    target:{closest:selector=>selector==="[data-mark-concept]"?
      {dataset:{markConcept:id}}:null}
  });
  const saved=()=>JSON.parse(e.stored.get("whatnext:learning:evidence:v1"));
  click("python-basics");
  assert.ok(saved().selfReportedConcepts.includes("python-basics"));
  assert.match(el("#toast").textContent,/marked as self-reported/);
  click("python-basics");
  assert.ok(!saved().selfReportedConcepts.includes("python-basics"));
  assert.match(el("#toast").textContent,/removed/);
  const selected=el("#assessment-concept-select").innerHTML
    .match(/<option value="([^"]+)" selected/)?.[1];
  assert.ok(selected);
  correctAnswers=c.WhatNextLearning.checksForCareer(e.data["data/learning_v2/graph.json"],
    e.data["data/learning_v2/diagnostic_questions.json"],"ai")
    .find(x=>x.concept_id===selected).items.map(x=>x.correct_index);
  el("#assessment-quiz").listeners.submit({preventDefault(){}});
  assert.equal(saved().assessmentResults[selected].passed,true);
  assert.equal(saved().assessmentResults[selected].lastScore,3);
  assert.match(el("#assessment-feedback").textContent,/3\/3 correct/);
});
