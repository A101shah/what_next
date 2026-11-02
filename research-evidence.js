/* Source-transparent public data viewer; nonidentifying aggregate statistics only. */
(function(root) {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const clean = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[character]));
  const safeUrl = url => typeof url === "string" && /^https:\/\/[a-z0-9.-]+\//i.test(url) ? clean(url) : "#";
  let data = null, filter = "all";
  function render() {
    if (!data) return;
    const preview = data.source_summary.preview;
    const stats = [
      [Number(data.source_summary.onet.records).toLocaleString("en-US"),"O*NET occupation–technology links"],
      [preview.records,"Real EdNet preview responses"],
      [preview.learners,"Learners in non-random preview"],
      [preview.unique_questions,"Distinct English practice questions"]
    ];
    $("#research-stat-grid").innerHTML = stats.map(([value, label]) =>
      '<div class="research-stat"><strong>'+clean(value)+'</strong><span>'+clean(label)+'</span></div>'
    ).join("");
    $("#research-preview-caption").textContent = "Published EdNet viewer · " + preview.learning_domain +
      " · nonrandom first-page preview";
    $("#research-accuracy-label").textContent = preview.correct + " correct / " + preview.records + " observed";
    const pct = Number(preview.correct) / Number(preview.records) * 100;
    $("#research-accuracy-bar span").style.width = Math.max(0,Math.min(100,pct)) + "%";
    $("#research-accuracy-bar").setAttribute("aria-label",
      preview.correct + " correct and " + preview.incorrect + " incorrect observed responses in a nonrandom EdNet preview");
    const stages = [
      ["Live learning recommender",data.model_status.recommendations,"active"],
      ["Occupational classification",data.model_status.occupational_classification,"context"],
      ["Neural knowledge tracing",data.model_status.deep_knowledge_tracing,"pending"]
    ];
    $("#research-model-status").innerHTML = stages.map(([title,description,status]) =>
      '<div class="research-model-item"><span class="research-stage ' + status + '">' +
      (status==="active"?"In use":status==="pending"?"Not trained":"Exploratory")+
      '</span><div><strong>'+clean(title)+'</strong><p>'+clean(description)+'</p></div></div>'
    ).join("");
    const sources = data.sources.filter(s => filter==="all" || s.category===filter);
    $("#research-source-list").innerHTML = sources.map(source =>
      '<article class="research-source"><div><span class="research-source-category">'+clean(source.category)+
      '</span><h3>'+clean(source.label)+'</h3><p>'+clean(source.detail)+
      '</p><div class="research-source-meta"><span>'+clean(source.status)+'</span><span>'+clean(source.license)+
      '</span></div></div><a href="'+safeUrl(source.url)+
      '" rel="noopener noreferrer" target="_blank">Original source ↗</a></article>'
    ).join("");
    document.querySelectorAll("[data-research-filter]").forEach(button=>{
      const active = button.dataset.researchFilter===filter;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
    });
    $("#research-load-status").textContent="Source metadata checked · " +
      data.sources.length + " source records · preview only; no student-level data shared";
  }
  function bind() {
    const container = $(".research-filters");
    if (!container) return;
    container.addEventListener("click", e=>{
      const button=e.target.closest("[data-research-filter]");
      if (!button) return;
      filter=button.dataset.researchFilter;
      render();
    });
  }
  async function init() {
    bind();
    try {
      const response=await fetch("data/real_learning/public_evidence_dashboard.json",{cache:"no-cache"});
      if (!response.ok) throw new Error("Research metadata could not be loaded.");
      const parsed=await response.json();
      const preview=parsed?.source_summary?.preview;
      if (!Array.isArray(parsed.sources)||!preview||preview.correct+preview.incorrect!==preview.records ||
          parsed.sources.length<3||!Number.isInteger(preview.records)) throw new Error("Invalid research metadata.");
      data=parsed;
      render();
    } catch(error) {
      $("#research-load-status").textContent="Research source details unavailable. See the repository data/real_learning folder.";
      $("#research-source-list").textContent="Could not load data source metadata. No statistics have been inferred.";
    }
  }
  document.addEventListener("DOMContentLoaded",init);
  root.WhatNextResearch = Object.freeze({refresh:render});
})(window);
