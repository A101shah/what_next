/* WhatNext AI: browser-only skill checks and next-concept guidance.
   This stores progress locally, never uploads answers, and does not claim mastery. */
(function (root) {
  "use strict";
  const STORAGE = "whatnext:learning:evidence:v1";
  const $ = q => document.querySelector(q);
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, x =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
  let graph = null, bank = null, selected = "", feedback = null, loaded = false;
  let data = { assessmentResults: {}, selfReportedConcepts: [] };

  function readData() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE) || "null");
      if (!value || typeof value !== "object") return;
      data.assessmentResults = value.assessmentResults && typeof value.assessmentResults === "object" &&
        !Array.isArray(value.assessmentResults) ? value.assessmentResults : {};
      data.selfReportedConcepts = Array.isArray(value.selfReportedConcepts) ?
        value.selfReportedConcepts.filter(x => typeof x === "string").slice(0, 200) : [];
    } catch (e) { console.warn("Saved learning checks are unreadable.", e); }
  }
  function storeData() {
    try { localStorage.setItem(STORAGE, JSON.stringify(data)); }
    catch (e) { setFeedback("Your browser could not save progress. It may be lost after closing this tab.", "warn"); }
  }
  function career() {
    try {
      const profile = JSON.parse(localStorage.getItem("whatnext:profile:v1") || "null");
      return typeof profile?.career === "string" ? profile.career : "ai";
    } catch (e) { return "ai"; }
  }
  function toast(message) {
    const item = $("#toast");
    if (!item) return;
    item.textContent = message;
    item.classList.add("show");
    root.clearTimeout(toast.timer);
    toast.timer = root.setTimeout(() => item.classList.remove("show"), 3600);
  }
  function setFeedback(message, kind = "info") {
    feedback = {message, kind};
    const el = $("#assessment-feedback");
    if (el) {
      el.className = "assessment-feedback " + kind;
      el.textContent = message;
    }
  }
  function catalog() { return new Map(graph.concepts.map(x => [x.concept_id, x])); }
  function questionSets(forCareer) { return root.WhatNextLearning.checksForCareer(graph, bank, forCareer); }
  function activeRecommendation(forCareer) { return root.WhatNextLearning.recommend(graph, forCareer, data, 5); }
  function known(id) {
    return data.assessmentResults[id]?.passed === true ? "checked" :
      data.selfReportedConcepts.includes(id) ? "declared" : "untracked";
  }
  function label(id) { const c = catalog().get(id); return c ? c.name : id; }
  function checkIsAvailable(id, list) { return list.some(x => x.concept_id === id); }
  function go(view) {
    const button = $('.nav-item[data-view="' + view + '"]');
    if (button) button.click();
  }
  function study(name) {
    const input = $("#quick-search-query");
    const form = $("#quick-search-form");
    if (!input || !form) return;
    input.value = name + " tutorial";
    form.dispatchEvent(new Event("submit", {bubbles:true,cancelable:true}));
  }
  function questionChoices(group) {
    return group.items.map((item, questionIndex) =>
      '<fieldset class="learning-question"><legend><span class="question-number">0' + (questionIndex+1) +
      '</span> ' + esc(item.prompt) + '</legend><div class="assessment-options">' +
      item.options.map((answer, index) => {
        const inputId = "aq-" + questionIndex + "-" + index;
        return '<label for="' + inputId + '" class="assessment-option"><input type="radio" required name="assessment-q-' +
          questionIndex + '" id="' + inputId + '" value="' + index + '"><span>' + esc(answer) + '</span></label>';
      }).join("") + '</div></fieldset>'
    ).join("");
  }
  function renderQuiz(forCareer, sets) {
    const selector = $("#assessment-concept-select"), form = $("#assessment-quiz");
    if (!selector || !form) return;
    if (!sets.length) {
      selector.innerHTML = '<option value="">No skill checks for this pathway yet</option>';
      selector.disabled = true;
      form.innerHTML = '<p class="quiet-state">This pathway does not yet have a practice check. You can still explore its concept prerequisites.</p>';
      return;
    }
    selector.disabled = false;
    const candidates = new Set(sets.map(x => x.concept_id));
    const recommended = activeRecommendation(forCareer).recommendations.find(x => candidates.has(x.concept_id));
    if (!candidates.has(selected)) selected = recommended?.concept_id || sets[0].concept_id;
    selector.innerHTML = sets.map(item =>
      '<option value="' + esc(item.concept_id) + '"' + (item.concept_id === selected ? " selected" : "") +
      '>' + esc(label(item.concept_id)) + '</option>'
    ).join("");
    const quiz = sets.find(x => x.concept_id === selected);
    const status = known(selected);
    const seen = data.assessmentResults[selected];
    const concept = catalog().get(selected);
    const note = status === "checked" ? "Practice check passed (3/3 at least once). This is not proof of full mastery." :
      status === "declared" ? "You have self-reported this concept, but have not passed its practice check." :
      "Not checked. Answer the three questions to record a basic knowledge signal.";
    const self = data.selfReportedConcepts.includes(selected);
    form.innerHTML =
      '<div class="quiz-heading"><div><span class="card-kicker">3-QUESTION PRACTICE CHECK</span><h3>' +
      esc(concept.name) + '</h3><p>' + esc(concept.demonstration_task) +
      '</p></div><span class="learning-state ' + status + '">' +
      (status === "checked" ? "Check passed" : status === "declared" ? "Self-reported" : "Not assessed") +
      '</span></div><p class="assessment-explainer">' + esc(note) +
      (seen ? ' Last result: ' + Number(seen.lastScore || 0) + '/3.' : '') + '</p>' +
      questionChoices(quiz) +
      '<div class="assessment-actions"><button type="submit" class="primary-btn">Check my answers →</button>' +
      '<button type="button" class="outline-btn" data-self-report="' + esc(selected) + '">' +
      (self ? "Remove self-report" : "Mark learned (self-report)") +
      '</button></div><p class="input-hint">Practice checks are editorial and not psychometrically validated. You can retake them; all answers stay on this device.</p>';
  }
  function renderRecommendations(forCareer, result, sets) {
    const mount = $("#learning-suggestions");
    if (!mount) return;
    if (!result.recommendations.length) {
      mount.innerHTML = '<div class="quiet-state">All concepts in this pathway are marked complete. Review earlier skills or choose another destination.</div>';
      return;
    }
    mount.innerHTML = result.recommendations.map((item, index) => {
      const hasCheck = checkIsAvailable(item.concept_id, sets);
      return '<article class="learning-recommendation"><div class="learning-rec-head"><span class="question-number">' +
        String(index + 1).padStart(2, "0") + '</span><div><h3>' + esc(item.name) +
        '</h3><p>' + esc(item.domain + " · " + item.level) +
        '</p></div><span class="learning-state">' + (hasCheck ? "Check available" : "Guided study") +
        '</span></div><p>' + esc(item.explanation) + ' ' + esc(item.evidence_note) +
        '</p><div class="learning-rec-actions">' +
        (hasCheck ? '<button type="button" class="subtle-btn" data-start-check="' + esc(item.concept_id) +
          '">Take 3-question check ↗</button>' : '<button type="button" class="subtle-btn" data-mark-concept="' +
          esc(item.concept_id) + '">Mark learned (self-report)</button>') +
        '<button type="button" class="text-link" data-study-concept="' + esc(item.concept_id) +
        '">Find learning resources →</button></div></article>';
    }).join("");
  }
  function renderCheckList(forCareer, sets) {
    const mount = $("#assessment-check-list");
    if (!mount) return;
    const groups = sets.map(group => {
      const name = label(group.concept_id), status = known(group.concept_id);
      return '<button type="button" class="assessment-check-tile" data-start-check="' + esc(group.concept_id) +
        '"><span><strong>' + esc(name) + '</strong><small>' +
        (status === "checked" ? "3/3 practice check passed" :
          status === "declared" ? "Self-reported, not assessed" : "Practice check available") +
        '</small></span><span aria-hidden="true">↗</span></button>';
    });
    mount.innerHTML = groups.length ? groups.join("") : '<p class="quiet-state">No practice checks are available for this career yet.</p>';
  }
  function renderOverview(forCareer, result) {
    const preview = $("#learning-preview"), hero = $("#next-content");
    const next = result.recommendations[0];
    if (preview) preview.innerHTML = '<div class="learning-preview-stats"><strong>' + result.checked_in_scope +
      '</strong><span>practice checks passed</span><strong>' + result.self_reported_in_scope +
      '</strong><span>concepts self-reported</span></div><p>' +
      esc(next ? 'Next suggested concept: ' + next.name : 'No unfinished concepts remain in this pathway.') +
      '</p>';
    if (hero && next) {
      hero.innerHTML = '<h2>' + esc(next.name) +
        '</h2><p>' + esc(next.explanation + " " + next.evidence_note) +
        ' Recommendations are curriculum-based, not neural predictions.</p>' +
        '<div class="next-meta"><span>◎ ' + esc(forCareer.toUpperCase()) +
        '</span><span>✓ ' + result.checked_in_scope + ' short checks passed</span></div>' +
        '<button class="white-button" type="button" id="open-learning-next">Explore your next concept ↗</button>';
      $("#open-learning-next").addEventListener("click", () => go("assessment"));
    }
    const roadmap = $("#learning-roadmap-bridge");
    if (roadmap) roadmap.innerHTML = next ?
      '<div><strong>Next concept: ' + esc(next.name) + '</strong><p>' + esc(next.evidence_note) +
        ' Concept checks are separate from self-reported roadmap milestones.</p></div>' +
        '<button class="small-link" type="button" data-learning-open>Open skill checks ↗</button>' :
      '<span>All pathway concepts are marked complete. Review your evidence in Skill checks.</span>' +
      '<button class="small-link" type="button" data-learning-open>Review checks ↗</button>';
  }
  function refresh() {
    if (!loaded || !root.WhatNextLearning) return;
    try {
      const forCareer = career();
      const result = activeRecommendation(forCareer), sets = questionSets(forCareer);
      const heading = $("#assessment-career");
      if (heading) heading.textContent = forCareer.toUpperCase() + " · " + result.total_in_scope + " concepts including prerequisites";
      const stats = $("#assessment-stats");
      if (stats) stats.innerHTML = '<div><strong>' + result.checked_in_scope +
        '</strong><span>Practice checks passed</span></div><div><strong>' +
        result.self_reported_in_scope + '</strong><span>Self-reported concepts</span></div><div><strong>' +
        result.remaining + '</strong><span>Not yet marked complete</span></div>';
      renderRecommendations(forCareer, result, sets);
      renderCheckList(forCareer, sets);
      renderQuiz(forCareer, sets);
      renderOverview(forCareer, result);
      if (feedback) setFeedback(feedback.message, feedback.kind);
    } catch (err) {
      const box = $("#assessment-status");
      if (box) box.textContent = "Unable to load the selected curriculum: " + err.message;
    }
  }
  function activateCheck(id) {
    const forCareer = career(), sets = questionSets(forCareer);
    if (!checkIsAvailable(id, sets)) return;
    selected = id; feedback = null;
    go("assessment");
    refresh();
    $("#assessment-quiz")?.scrollIntoView({behavior:"smooth", block:"start"});
  }
  function toggleReport(id) {
    if (!graph || !catalog().has(id)) return;
    const before = new Set(data.selfReportedConcepts);
    if (before.has(id)) before.delete(id); else before.add(id);
    data.selfReportedConcepts = [...before];
    feedback = null;
    storeData();
    refresh();
    // The Set was already toggled above: its current membership is the new state.
    const isNowSelfReported = before.has(id);
    toast(isNowSelfReported ? "Concept marked as self-reported, not assessed." : "Self-report removed.");
  }
  function onSubmit(event) {
    event.preventDefault();
    if (!loaded) return;
    const set = questionSets(career()).find(x => x.concept_id === selected);
    if (!set) return;
    const answers = set.items.map((item, i) => {
      const input = $('#assessment-quiz input[name="assessment-q-' + i + '"]:checked');
      return input ? Number(input.value) : null;
    });
    let result;
    try { result = root.WhatNextLearning.grade(set.items, answers); }
    catch (e) { setFeedback(e.message, "warn"); return; }
    const old = data.assessmentResults[selected] || {};
    data.assessmentResults[selected] = {
      passed: Boolean(old.passed || result.passed),
      bestScore: Math.max(Number(old.bestScore) || 0, result.score),
      lastScore: result.score, total: result.total,
      attempts: Math.min(9999, (Number(old.attempts) || 0) + 1),
      checkedAt: new Date().toISOString()
    };
    storeData();
    refresh();
    const notes = result.details.map((x, i) =>
      (x.correct ? "✓" : "✗") + " Q" + (i + 1) + ": " + (x.correct ? "" : "Correct answer: " + x.correct_answer + ". ") + x.explanation
    );
    setFeedback(result.score + "/3 correct. " +
      (result.passed ? "Practice check passed; this is a basic knowledge signal, not full mastery." :
        "Review the explanations and retry. A previous pass, if any, is retained.") +
      "\n" + notes.join("\n"), result.passed ? "success" : "warn");
    toast("Your result was recorded locally.");
  }
  function bind() {
    $("#assessment-concept-select")?.addEventListener("change", e => {
      selected = e.target.value; feedback = null; refresh();
    });
    $("#assessment-quiz")?.addEventListener("submit", onSubmit);
    $("#assessment-quiz")?.addEventListener("click", e => {
      const el = e.target.closest("[data-self-report]");
      if (el) toggleReport(el.dataset.selfReport);
    });
    $("#learning-suggestions")?.addEventListener("click", e => {
      const check = e.target.closest("[data-start-check]");
      const report = e.target.closest("[data-mark-concept]");
      const studyButton = e.target.closest("[data-study-concept]");
      if (check) activateCheck(check.dataset.startCheck);
      else if (report) toggleReport(report.dataset.markConcept);
      else if (studyButton) study(label(studyButton.dataset.studyConcept));
    });
    $("#assessment-check-list")?.addEventListener("click", e => {
      const check = e.target.closest("[data-start-check]");
      if (check) activateCheck(check.dataset.startCheck);
    });
    $("#learning-roadmap-bridge")?.addEventListener("click", e => {
      if (e.target.closest("[data-learning-open]")) go("assessment");
    });
  }
  async function init() {
    readData(); bind();
    try {
      const [g, q] = await Promise.all([
        fetch("data/learning_v2/graph.json").then(r => {if (!r.ok) throw Error("Graph missing");return r.json();}),
        fetch("data/learning_v2/diagnostic_questions.json").then(r => {if (!r.ok) throw Error("Practice bank missing");return r.json();})
      ]);
      if (!g || !Array.isArray(g.concepts) || !Array.isArray(q.questions)) throw Error("Invalid learning data");
      const valid = new Set(g.concepts.map(c => c.concept_id));
      const ids = new Set();
      for (const x of q.questions) {
        if (!valid.has(x.concept_id) || !Array.isArray(x.options) || x.options.length !== 4 ||
          !Number.isInteger(x.correct_index) || x.correct_index < 0 || x.correct_index > 3 ||
          ids.has(x.question_id)) throw Error("Invalid practice question bank");
        ids.add(x.question_id);
      }
      graph = g; bank = q; loaded = true; refresh();
    } catch (e) {
      const box = $("#assessment-status");
      if (box) box.textContent = "Learning checks unavailable. The original roadmap still works. " + e.message;
      const preview = $("#learning-preview");
      if (preview) preview.textContent = "Learning checks unavailable; please use the existing roadmap.";
    }
  }
  root.WhatNextAssessment = { refresh };
  document.addEventListener("DOMContentLoaded", init);
})(window);
