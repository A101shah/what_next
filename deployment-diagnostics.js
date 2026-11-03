/* Self-check runs from the actual hosted origin on explicit user click.
   Its result is a live browser-side check, NOT independent server monitoring. */
(function(root){
  "use strict";
  const $=selector=>document.querySelector(selector);
  const files=[
    {path:"data/learning_v2/graph.json",kind:"graph"},
    {path:"data/learning_v2/diagnostic_questions.json",kind:"questions"},
    {path:"data/real_learning/public_evidence_dashboard.json",kind:"research"},
    {path:"data/learning_v2/WhatNext_Compiled_Learning_Dataset_V3.csv",kind:"curriculum"},
    {path:"learning.js",kind:"learning"},
    {path:"app.js",kind:"app"},
    {path:"assessment-ui.js",kind:"assessment"},
    {path:"neural.js",kind:"neural"},
    {path:"search.js",kind:"search"},
    {path:"skills.js",kind:"skills"},
    {path:"data/paths.json",kind:"paths"},
    {path:"data/career_hybrid_nn.json",kind:"hybrid"},
    {path:"data/model.json",kind:"occupations"},
    {path:"data/role_skills.json",kind:"role_skills"},
    {path:"styles.css",kind:"stylesheet"}
  ];
  const status=(ok,label,detail)=>({ok,label,detail});
  function validate(kind,content){
    if(["learning","app","assessment","neural","search","skills","stylesheet"].includes(kind)){
      if(typeof content!=="string"||content.length<100)return false;
      const fingerprints={
        learning:"WhatNextLearning",
        app:'data/career_hybrid_nn.json',
        assessment:"WhatNextAssessment",
        neural:"WhatNextNeural",
        search:"WhatNextSearch",
        skills:"WhatNextSkills",
        stylesheet:".sidebar"
      };
      return content.includes(fingerprints[kind]);
    }
    if(kind==="curriculum"){
      const first=content.split(/\r?\n/)[0];
      return first.includes("concept_id")&&first.includes("career_id")&&first.includes("practice_question_count");
    }
    if(kind==="graph")return Array.isArray(content.concepts)&&content.concepts.length===107&&
      Array.isArray(content.prerequisites)&&content.prerequisites.length===139;
    if(kind==="questions")return Array.isArray(content.questions)&&content.questions.length===45;
    if(kind==="research")return Array.isArray(content.sources)&&content.sources.length===5&&
      content.model_status?.validated_recommendation_accuracy===null;
    if(kind==="paths")return Array.isArray(content)&&content.length===6&&
      content.every(p=>p.id&&Array.isArray(p.topics)&&p.topics.length>0);
    if(kind==="hybrid")return content.model_type==="PCA_KMEANS_DISTANCE_FEATURES_MLP"&&
      Array.isArray(content.nn?.shape)&&content.nn.shape.join(",")==="31,20,12,12"&&
      content.pca?.n_components===7&&content.kmeans?.n_clusters===4;
    if(kind==="occupations")return Array.isArray(content.occupations)&&content.occupations.length>=200;
    if(kind==="role_skills")return content.roles&&typeof content.roles==="object"&&
      Number(content.source_rows)>=30000;
    return false;
  }
  async function run(fetcher=root.fetch.bind(root)){
    const query="?verify="+Date.now();
    const results=await Promise.all(files.map(async item=>{
      try{
        const response=await fetcher(item.path+query,{cache:"no-store"});
        if(!response.ok)return status(false,item.path,"HTTP "+response.status);
        const content=(["learning","app","assessment","neural","search","skills","stylesheet","curriculum"].includes(item.kind))
          ?await response.text():await response.json();
        return status(validate(item.kind,content),item.path,"Response received; expected structure "+(validate(item.kind,content)?"confirmed":"did not match"));
      }catch(error){return status(false,item.path,"Network or parsing error: "+String(error.message||error));}
    }));
    return {passed:results.filter(item=>item.ok).length,total:results.length,
      results,origin:root.location?.origin||"unknown",at:new Date().toISOString()};
  }
  function display(report){
    const el=$("#deployment-check-result");
    if(!el)return;
    const good=report.passed===report.total;
    el.className="deployment-check-results "+(good?"success":"warning");
    el.textContent=(good?"All public resources passed this browser-side check. ":"Some resources failed. ")+
      report.passed+"/"+report.total+" resources verified at "+report.origin+
      ". This does not certify worldwide availability or neural recommendation accuracy.\n"+
      report.results.map(r=>(r.ok?"✓ ":"✗ ")+r.label+" — "+r.detail).join("\n");
  }
  function init(){
    const button=$("#run-deployment-check");
    if(!button)return;
    button.addEventListener("click",async()=>{
      button.disabled=true;
      const area=$("#deployment-check-result");
      if(area)area.textContent="Checking the actual files served to your browser…";
      try{display(await run());}
      catch(error){if(area)area.textContent="Browser-side check failed: "+error.message;}
      finally{button.disabled=false;}
    });
  }
  root.WhatNextDeploymentDiagnostics=Object.freeze({run,validate});
  document.addEventListener("DOMContentLoaded",init);
})(window);
