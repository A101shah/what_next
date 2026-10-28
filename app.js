"use strict";

const STORAGE_KEY = "whatnext:profile:v1";
const INTERESTS = [
  {id:"coding",label:"Programming"},
  {id:"modeling",label:"AI & models"},
  {id:"data",label:"Working with data"},
  {id:"math",label:"Math & reasoning"},
  {id:"research",label:"Research & discovery"},
  {id:"engineering",label:"Building systems"},
  {id:"design",label:"Creative design"},
  {id:"security",label:"Cybersecurity"}
];
const state = {
  paths: [], model: null, news: null, careers: null, evidenceCountry: null, evidenceFamily: null, view: "overview",
  profile: {name:"",career:"ai",hours:7,interests:[],completed:[],resume:{email:"",about:"",education:"",projects:""}}
};
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const clean = value => String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[character]));
const safeLink = url => typeof url === "string" && /^https:\/\//i.test(url) ? clean(url) : "#";
const currentPath = () => state.paths.find(path => path.id === state.profile.career) || state.paths[0];
const completed = id => state.profile.completed.includes(id);
const inPathCompleted = path => path.topics.filter(topic => completed(topic.id)).length;

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      state.profile.name = String(saved.name || "").slice(0,60);
      state.profile.career = String(saved.career || "ai");
      state.profile.hours = Math.max(1,Math.min(25,Number(saved.hours)||7));
      state.profile.interests = Array.isArray(saved.interests) ? saved.interests.filter(x=>typeof x==="string") : [];
      state.profile.completed = Array.isArray(saved.completed) ? saved.completed.filter(x=>typeof x==="string") : [];
      state.profile.resume = {...state.profile.resume,...(saved.resume && typeof saved.resume==="object" ? saved.resume : {})};
    }
  } catch(err) { console.warn("Stored profile unreadable; starting fresh."); }
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state.profile)); }
  catch(err) { toast("Local storage is unavailable. Your changes may not persist."); }
}
function toast(message) {
  const item = $("#toast");
  item.textContent = message;
  item.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(()=>item.classList.remove("show"),3500);
}
async function loadOptional(url) {
  try {
    const response = await fetch(url+"?v="+new Date().toISOString().slice(0,10),{cache:"no-cache"});
    if (!response.ok) return null;
    return await response.json();
  } catch(err) { return null; }
}
async function start() {
  restore();
  const [paths,model,news,careers] = await Promise.all([
    loadOptional("data/paths.json"),loadOptional("data/model.json"),loadOptional("data/research.json"),loadOptional("data/careers.json")
  ]);
  if (!Array.isArray(paths) || !paths.length) {
    $("#next-content").innerHTML = "<h2>Unable to load learning paths.</h2><p>Open this website using a web server and check data/paths.json.</p>";
    return;
  }
  state.paths = paths;
  state.model = model && Array.isArray(model.occupations) ? model : null;
  state.news = news && news.items ? news : null;
  state.careers = careers && careers.countries ? careers : null;
  if (!state.paths.some(path=>path.id===state.profile.career)) state.profile.career=state.paths[0].id;
  bindActions();
  renderProfileForm();
  fillResumeFields();
  render();
}

function navigate(view) {
  if (!$("#view-"+view)) return;
  state.view=view;
  $$(".view").forEach(node=>node.classList.toggle("active",node.id==="view-"+view));
  $$(".nav-item").forEach(node=>{
    const active=node.dataset.view===view;
    node.classList.toggle("active",active);
    if(active)node.setAttribute("aria-current","page");else node.removeAttribute("aria-current");
  });
  const names={overview:"Overview",roadmap:"Learning roadmap",pulse:"World pulse",evidence:"Career evidence",career:"Career studio",profile:"Your profile"};
  $("#current-view").textContent=names[view]||"Overview";
  $(".sidebar").classList.remove("open");
  if (view==="profile") renderProfileForm();
  window.scrollTo({top:0,behavior:"smooth"});
}
function bindActions(){
  $$("[data-view]").forEach(node=>node.addEventListener("click",()=>navigate(node.dataset.view)));
  $$("[data-go]").forEach(node=>node.addEventListener("click",()=>navigate(node.dataset.go)));
  $("#mobile-menu").addEventListener("click",()=>$(".sidebar").classList.toggle("open"));
  $("#evidence-country").addEventListener("change",event=>{state.evidenceCountry=event.target.value;state.evidenceFamily=null;renderCareerEvidence(currentPath());});
  $("#evidence-family").addEventListener("change",event=>{state.evidenceFamily=event.target.value;renderCareerEvidence(currentPath());});
  $("#profile-form").addEventListener("submit",saveProfile);
  $("#career-select").addEventListener("change",()=>drawKnownSkills($("#career-select").value));
  $("#hours-range").addEventListener("input",()=>{
    $("#hours-label").textContent=$("#hours-range").value+" hours/week";
  });
  $("#roadmap-list").addEventListener("click",event=>{
    const button=event.target.closest("[data-complete]");
    if(!button)return;
    const id=button.dataset.complete;
    if(!state.profile.completed.includes(id))state.profile.completed.push(id);
    else state.profile.completed=state.profile.completed.filter(v=>v!==id);
    persist();
    render();
    toast("Your roadmap has been updated.");
  });
  ["resume-name","resume-email","resume-about","resume-education","resume-projects"].forEach(id=>{
    $("#"+id).addEventListener("input",()=>{
      state.profile.name=$("#resume-name").value.slice(0,60);
      state.profile.resume={
        email:$("#resume-email").value,
        about:$("#resume-about").value,
        education:$("#resume-education").value,
        projects:$("#resume-projects").value
      };
      persist();renderResume();
      $("#avatar").textContent=state.profile.name.trim().charAt(0).toUpperCase()||"S";
    });
  });
  $("#download-resume").addEventListener("click",downloadResume);
  $("#print-resume").addEventListener("click",()=>{navigate("career");window.print();});
}
function renderProfileForm(){
  $("#student-name").value=state.profile.name;
  $("#career-select").innerHTML=state.paths.map(path=>
    '<option value="'+clean(path.id)+'" '+(path.id===state.profile.career?"selected":"")+'>'+clean(path.label)+'</option>'
  ).join("");
  $("#hours-range").value=state.profile.hours;
  $("#hours-label").textContent=state.profile.hours+" hours/week";
  $("#interests-list").innerHTML=INTERESTS.map(item=>
    '<button type="button" aria-pressed="'+state.profile.interests.includes(item.id)+'" class="interest-chip '+(state.profile.interests.includes(item.id)?"selected":"")+'" data-interest="'+clean(item.id)+'">'+clean(item.label)+'</button>'
  ).join("");
  $$("#interests-list [data-interest]").forEach(node=>node.addEventListener("click",()=>{
    node.classList.toggle("selected");
    node.setAttribute("aria-pressed",node.classList.contains("selected")?"true":"false");
  }));
  drawKnownSkills(state.profile.career);
}
function drawKnownSkills(pathId) {
  const path=state.paths.find(item=>item.id===pathId);
  if(!path)return;
  $("#known-skills").innerHTML=path.topics.map(topic=>
    '<label class="known-item"><input name="known" type="checkbox" value="'+clean(topic.id)+'" '+(completed(topic.id)?"checked":"")+'><span>'+clean(topic.title)+'</span></label>'
  ).join("");
}
function saveProfile(event) {
  event.preventDefault();
  const path=$("#career-select").value;
  const known=new Set($$("#known-skills input:checked").map(x=>x.value));
  state.profile.completed=[
    ...state.profile.completed.filter(id=>!id.startsWith(path+"-")),
    ...known
  ];
  state.profile.name=$("#student-name").value.trim().slice(0,60);
  state.profile.career=path;
  state.evidenceFamily=null;
  state.profile.hours=Number($("#hours-range").value);
  state.profile.interests=$$("#interests-list .selected").map(x=>x.dataset.interest);
  persist();
  fillResumeFields();
  render();
  navigate("overview");
  toast("Your personal route is ready.");
}
function topicReady(topic,path){
  return topic.prerequisites.every(name=>{
    const requirement=path.topics.find(other=>other.title===name);
    return requirement && completed(requirement.id);
  });
}
function recommendations(path) {
  return path.topics.filter(topic=>!completed(topic.id)&&topicReady(topic,path)).map(topic=>{
    const position=path.topics.indexOf(topic);
    const interest=state.profile.interests.includes(topic.category);
    return {...topic,position,interest,rank:100-position*12+(interest?7:0)};
  }).sort((a,b)=>b.rank-a.rank);
}
function render() {
  const path=currentPath();
  if(!path)return;
  const done=inPathCompleted(path);
  const pct=Math.round(done/path.topics.length*100);
  const next=recommendations(path)[0];
  $("#welcome").innerHTML=state.profile.name ?
    "Keep moving, "+clean(state.profile.name.split(/\s+/)[0])+'<span class="accent">.</span>' :
    'The future is yours to build<span class="accent">.</span>';
  $("#avatar").textContent=state.profile.name.trim().charAt(0).toUpperCase()||"S";
  $("#progress-value").textContent=pct+"%";
  $("#progress-ring").style.setProperty("--p",pct+"%");
  $("#skills-value").textContent=done+" / "+path.topics.length;
  $("#hours-value").textContent=state.profile.hours+" hours";
  $("#destination-value").textContent=path.label;
  $("#roadmap-role").textContent=path.label;
  $("#roadmap-subtitle").textContent=path.description;
  $("#roadmap-percent").textContent=pct+"%";
  if(next){
    const why=next.prerequisites.length?"You have completed the required foundation for this step.":
      "This is a foundation skill for your selected destination.";
    const extra=next.interest?" It also matches one of your interests.":"";
    $("#next-content").innerHTML='<h2>'+clean(next.title)+'</h2><p>'+clean(why+extra+" "+next.description)+'</p>'+
      '<div class="next-meta"><span>◷ '+clean(next.hours)+" focused hours</span><span>◎ "+clean(path.label)+'</span></div>'+
      '<button class="white-button" id="open-next">Explore this step ↗</button>';
    $("#open-next").addEventListener("click",()=>navigate("roadmap"));
  } else {
    $("#next-content").innerHTML='<h2>All milestones complete. Amazing progress.</h2><p>Review your projects, add portfolio evidence, or explore a new career direction.</p><button class="white-button" id="open-next">Explore another path ↗</button>';
    $("#open-next").addEventListener("click",()=>navigate("profile"));
  }
  renderRoadmap(path);
  renderResearch(path);
  renderNeighbors(path);
  renderCareerEvidence(path);
  renderResume();
}
function renderRoadmap(path) {
  $("#roadmap-list").innerHTML=path.topics.map((topic,index)=>{
    const done=completed(topic.id),ready=topicReady(topic,path);
    const status=done?"done":ready?"ready":"locked";
    const prereq=topic.prerequisites.length ? "Requires: "+topic.prerequisites.join(", ") : "Foundation topic";
    const action=done?"✓ Completed":ready?"Mark complete":"🔒 Locked";
    return '<article class="step '+status+'"><div class="step-num">'+(done?"✓":String(index+1).padStart(2,"0"))+'</div>'+
      '<div><h3>'+clean(topic.title)+'</h3><p>'+clean(topic.description)+'</p><div class="step-meta"><span>◷ '+clean(topic.hours)+' hours</span>'+
      '<span>'+clean(prereq)+'</span><a target="_blank" rel="noopener noreferrer" href="'+safeLink(topic.resource)+'">Study resource ↗</a></div>'+
      '<p style="margin-top:10px"><strong>Practice:</strong> '+clean(topic.project)+'</p><span class="step-status">'+(done?"Self-reported complete":ready?"Ready to learn":"Complete prerequisites to unlock")+'</span></div>'+
      '<button class="step-action" data-complete="'+clean(topic.id)+'" '+(!done&&!ready?"disabled":"")+'>'+action+'</button></article>';
  }).join("");
}
function renderNeighbors(path) {
  const node=$("#neighbors-content");
  if(!state.model){
    node.innerHTML='O*NET clustering data has not been built yet. The source-based ML analysis will appear after the first successful dataset refresh. <a target="_blank" rel="noopener noreferrer" href="https://www.onetcenter.org/database.html">View primary source ↗</a>';
    return;
  }
  const own=state.model.occupations.find(item=>item.code===path.soc);
  if(!own){node.textContent="Occupational mapping unavailable in this O*NET release.";return;}
  const other=state.model.occupations.filter(item=>item.cluster===own.cluster && item.code!==own.code)
    .map(item=>({...item,dist:Math.hypot(item.pca[0]-own.pca[0],item.pca[1]-own.pca[1])}))
    .sort((a,b)=>a.dist-b.dist).slice(0,3);
  node.innerHTML='<div class="quiet-state">Your selected occupation: <strong>'+clean(own.title)+'</strong></div>'+
    other.map(item=>'<div class="neighbor-item"><span>'+clean(item.title)+'</span><small>Cluster '+(item.cluster+1)+'</small></div>').join("")+
    '<p class="data-caption">K-Means trained on '+clean(state.model.n_occupations)+' real occupational skill profiles · '+clean(state.model.n_skills)+' features · silhouette '+clean(state.model.silhouette)+'. PCA distances are illustrative, not probabilities of career fit. <a href="'+safeLink(state.model.source_url)+'" target="_blank" rel="noopener noreferrer">O*NET source ↗</a></p>';
}
function currentResearch(path) {
  return (state.news && state.news.items && state.news.items[path.id] || []).filter(p=>p && p.title && /^https:\/\//.test(p.url)).slice(0,5);
}
function renderResearch(path){
  const papers=currentResearch(path);
  $("#pulse-heading").textContent="New research: "+path.label;
  $("#pulse-updated").textContent=state.news && state.news.updated_at ?
    "Last successful OpenAlex refresh: "+new Date(state.news.updated_at).toLocaleDateString() :
    "No verified research refresh available yet.";
  const empty='<div class="quiet-state">No verified articles are available for this field at the moment. The scheduled OpenAlex refresh will populate this section when records can be retrieved. <a href="https://openalex.org/" target="_blank" rel="noopener noreferrer">Original source ↗</a></div>';
  $("#preview-research").innerHTML=papers.length ? papers.slice(0,3).map(p=>
    '<div class="mini-research"><a target="_blank" rel="noopener noreferrer" href="'+safeLink(p.url)+'">'+clean(p.title)+'</a><span>'+clean(p.date)+' · '+clean(p.venue||"OpenAlex")+'</span></div>'
  ).join("") : empty;
  $("#research-list").innerHTML=papers.length ? papers.map(p=>
    '<article class="research-card"><span class="research-category">'+clean(path.field.toUpperCase())+' · ORIGINAL RESEARCH</span><h3>'+clean(p.title)+
    '</h3><p>'+clean(p.date)+' · '+clean(p.venue||"OpenAlex indexed publication")+'</p><a target="_blank" rel="noopener noreferrer" href="'+safeLink(p.url)+'">Read original publication ↗</a></article>'
  ).join("") : '<div class="panel">'+empty+'</div>';
}

/**
 * Real OECD PIAAC 2023 evidence.
 * These are observed education distributions, not supervised career-success
 * predictions. The prerequisite roadmap is deliberately NOT retrained on them.
 */
function renderCareerEvidence(path) {
  const countries = state.careers && state.careers.countries;
  const countryPicker = $("#evidence-country");
  const familyPicker = $("#evidence-family");
  if (!countries || !Object.keys(countries).length) {
    countryPicker.innerHTML='<option>No verified country data available</option>';
    familyPicker.innerHTML='<option>Not available</option>';
    countryPicker.disabled = true;
    familyPicker.disabled = true;
    const message="OECD workforce analysis is unavailable. We will not invent career statistics. Check the official source and the data build status.";
    $("#evidence-preview").textContent=message;
    $("#roadmap-evidence").textContent=message;
    $("#evidence-stats").textContent=message;
    $("#evidence-fields").textContent="No published verified observations.";
    $("#evidence-levels").textContent="No published verified observations.";
    $("#evidence-data-note").innerHTML='<a href="https://www.oecd.org/en/data/datasets/piaac-2nd-cycle-database.html" target="_blank" rel="noopener noreferrer">OECD PIAAC 2023 source ↗</a>';
    return;
  }
  const keys=Object.keys(countries).filter(key=>countries[key] && countries[key].groups && Object.keys(countries[key].groups).length);
  if (!keys.length) {
    $("#evidence-preview").textContent="No reportable country groups were returned by OECD.";
    return;
  }
  if (!keys.includes(state.evidenceCountry)) {
    state.evidenceCountry=keys.find(key=>countries[key].groups[path.isco2]) || keys[0];
  }
  const current=state.evidenceCountry;
  const groups=countries[current].groups;
  const ids=Object.keys(groups);
  if (!ids.includes(state.evidenceFamily)) {
    state.evidenceFamily=ids.includes(path.isco2)?path.isco2:ids[0];
  }
  const selected=groups[state.evidenceFamily];
  countryPicker.disabled=false;
  familyPicker.disabled=false;
  countryPicker.innerHTML=keys.map(key=>
    '<option value="'+clean(key)+'" '+(key===current?'selected':'')+'>'+clean(key)+'</option>'
  ).join("");
  familyPicker.innerHTML=ids.map(code=>
    '<option value="'+clean(code)+'" '+(code===state.evidenceFamily?'selected':'')+'>'+clean(groups[code].title)+'</option>'
  ).join("");
  const percentageBars=items=>{
    if (!items || !items.length) return '<p class="quiet-state">This indicator was suppressed or had too few valid responses to display.</p>';
    return items.slice(0,7).map(item=>{
      const number=Number(item.pct);
      const percent=Number.isFinite(number)?Math.max(0,Math.min(100,number)):0;
      return '<div class="metric-line"><div class="metric-label"><span>'+clean(item.label)+'</span><strong>'+percent.toFixed(1)+'%</strong></div>'+
        '<div class="metric-track"><div class="metric-fill" style="width:'+percent.toFixed(1)+'%"></div></div></div>';
    }).join("");
  };
  $("#evidence-stats").innerHTML='<div class="card-kicker">OBSERVED WORKFORCE EVIDENCE · '+clean(current.toUpperCase())+'</div>'+
    '<h2>'+clean(selected.title)+'</h2><p><strong>'+clean(selected.n)+'</strong> actual employed survey respondents in this occupational family · 2023 survey. Grouped records only; individual identities are never displayed.</p>';
  $("#evidence-fields").innerHTML=percentageBars(selected.fields);
  $("#evidence-levels").innerHTML=percentageBars(selected.levels);
  const top=selected.fields && selected.fields[0];
  const detail=top?('The most frequently observed field among valid responses was '+top.label+' ('+top.pct.toFixed(1)+'%).'):
    "Education-field information was not reportable for this group.";
  const familyNote=state.evidenceFamily===path.isco2?
    "This is the broad occupational family associated with your selected career, not an exact match to a job title.":
    "You are exploring a different occupational family from your selected career.";
  $("#evidence-preview").textContent=selected.n+" observed employed respondents · "+selected.title+" · "+current;
  $("#roadmap-evidence").textContent=detail+" "+familyNote+" It provides context, not a mandatory qualification or a reason to skip prerequisites.";
  const link=countries[current].source;
  $("#evidence-data-note").innerHTML='<strong>How to read this:</strong> '+
    'Education-field distribution is based on '+clean(selected.study_field_n)+' valid sample responses; education-level distribution on '+clean(selected.education_level_n)+
    '. Percentages use the official final survey weight within each country and occupation family, and may have different denominators. '+
    'Small samples, nonresponse and privacy suppression can limit comparisons. No uncertainty intervals were calculated.<p style="margin-top:9px">Source: <a target="_blank" rel="noopener noreferrer" href="'+safeLink(link)+'">Original OECD PIAAC country CSV ↗</a> · '+clean(familyNote)+'</p>';
}

function fillResumeFields() {
  $("#resume-name").value=state.profile.name||"";
  $("#resume-email").value=state.profile.resume.email||"";
  $("#resume-about").value=state.profile.resume.about||"";
  $("#resume-education").value=state.profile.resume.education||"";
  $("#resume-projects").value=state.profile.resume.projects||"";
}
function resumeMarkup() {
  const path=currentPath();
  const resume=state.profile.resume;
  const portfolio=(resume.projects||"").split("\n").map(x=>x.trim()).filter(Boolean);
  const skills=path.topics.filter(topic=>completed(topic.id)).map(topic=>topic.title);
  const paragraph=value=>clean(value||"").replace(/\n/g,"<br>");
  return '<h2>'+clean(state.profile.name||"Your Name")+'</h2><div class="resume-contact">'+clean(resume.email||"Your professional email")+
    ' · Interested in '+clean(path.label)+'</div>'+
    (resume.about?'<h4>Profile</h4><p>'+paragraph(resume.about)+'</p>':"")+
    (resume.education?'<h4>Education</h4><p>'+paragraph(resume.education)+'</p>':"")+
    (skills.length?'<h4>Skills (self-reported)</h4><p>'+skills.map(clean).join(" · ")+'</p>':"")+
    '<h4>Projects & achievements</h4>'+(portfolio.length?'<ul>'+portfolio.map(p=>'<li>'+clean(p)+'</li>').join("")+'</ul>':'<p>Add real work you can discuss and demonstrate.</p>')+
    '<h4>Career direction</h4><p>'+clean(path.label)+'</p>';
}
function renderResume() {$("#resume-preview").innerHTML=resumeMarkup();}
function downloadResume() {
  const content='<!doctype html><html lang="en"><meta charset="utf-8"><title>Resume</title><style>body{font:14px/1.6 Arial,sans-serif;color:#222;max-width:740px;margin:45px auto;padding:0 20px}h2{font-size:28px;margin-bottom:4px}h4{text-transform:uppercase;border-bottom:1px solid #ddd;padding-bottom:5px;margin:24px 0 8px;letter-spacing:1px}.resume-contact{color:#666}li{margin:7px 0}@media print{body{margin:0;max-width:none}}</style><body>'+resumeMarkup()+'</body></html>';
  const url=URL.createObjectURL(new Blob([content],{type:"text/html;charset=utf-8"}));
  const a=document.createElement("a");
  a.href=url;a.download="WhatNext_Resume.html";document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast("Resume exported. Open the HTML file or print it as PDF.");
}
document.addEventListener("DOMContentLoaded",start);
