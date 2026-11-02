/* WhatNext AI learning engine: offline, transparent curriculum rules.
   No neural recommendation accuracy or verified mastery is implied. */
(function (root) {
  "use strict";
  function graphIndex(graph) {
    if (!graph || !Array.isArray(graph.concepts) || !Array.isArray(graph.career_concepts)) {
      throw new Error("Learning graph is unavailable.");
    }
    return new Map(graph.concepts.map(c => [c.concept_id, c]));
  }
  function scope(graph, careerId) {
    const concepts = graphIndex(graph);
    const focus = new Set(graph.career_concepts.filter(row => row.career_id === careerId).map(row => row.concept_id));
    if (!focus.size) throw new Error("Unknown learning destination.");
    const required = new Set();
    const visiting = new Set();
    function add(id) {
      if (visiting.has(id)) throw new Error("Circular prerequisites in learning graph.");
      if (required.has(id)) return;
      const concept = concepts.get(id);
      if (!concept) throw new Error("Missing learning prerequisite: " + id);
      visiting.add(id);
      (concept.prerequisite_ids || []).forEach(add);
      visiting.delete(id);
      required.add(id);
    }
    focus.forEach(add);
    return { concepts, focus, required };
  }
  function evidenceSources(graph, profile) {
    const concepts = graphIndex(graph);
    const checks = profile && typeof profile.assessmentResults === "object" && profile.assessmentResults !== null
      && !Array.isArray(profile.assessmentResults) ? profile.assessmentResults : {};
    const passed = new Set(Object.keys(checks).filter(id => concepts.has(id) && checks[id] && checks[id].passed === true));
    const declared = new Set((Array.isArray(profile?.selfReportedConcepts) ? profile.selfReportedConcepts : [])
      .filter(id => typeof id === "string" && concepts.has(id) && !passed.has(id)));
    return { passed, declared, completed: new Set([...passed, ...declared]) };
  }
  function recommend(graph, careerId, profile = {}, limit = 5) {
    const {concepts, focus, required} = scope(graph, careerId);
    const {passed, declared, completed} = evidenceSources(graph, profile);
    const priority = new Map();
    for (const [position, link] of (graph.topic_concepts || []).entries()) {
      if (link.topic_id.startsWith(careerId + "-") && !priority.has(link.concept_id))
        priority.set(link.concept_id, position);
    }
    const remaining = [...required].filter(id => !completed.has(id));
    const eligible = remaining.filter(id => concepts.get(id).prerequisite_ids.every(p => completed.has(p)));
    const difficulty = {beginner:0, intermediate:1, advanced:2};
    eligible.sort((a, b) =>
      (difficulty[concepts.get(a).level] ?? 3) - (difficulty[concepts.get(b).level] ?? 3) ||
      Number(!focus.has(a)) - Number(!focus.has(b)) ||
      (priority.get(a) ?? 99999) - (priority.get(b) ?? 99999) || a.localeCompare(b)
    );
    const bounded = Math.max(1, Math.min(20, Number.isFinite(limit) ? Math.floor(limit) : 5));
    return {
      career_id: careerId,
      total_in_scope: required.size,
      checked_in_scope: [...required].filter(id => passed.has(id)).length,
      self_reported_in_scope: [...required].filter(id => declared.has(id)).length,
      remaining: remaining.length,
      eligible_count: eligible.length,
      recommendations: eligible.slice(0, bounded).map(id => {
        const c = concepts.get(id);
        const selfPrereqs = c.prerequisite_ids.filter(p => declared.has(p));
        return {
          concept_id: id, name: c.name, domain: c.domain, level: c.level,
          demonstration_task: c.demonstration_task,
          prerequisite_ids: c.prerequisite_ids.slice(),
          self_reported_prerequisite_ids: selfPrereqs,
          explanation: focus.has(id) ? "Part of your chosen learning pathway; prerequisite concepts are marked complete."
            : "A bridging foundation required by another concept in your learning pathway.",
          evidence_note: selfPrereqs.length ? "Some prerequisites are self-reported, not assessed." :
            c.prerequisite_ids.length ? "Prerequisites are supported by recorded practice checks." :
            "An entry-level foundation concept.",
          rank_basis: "editorial_prerequisite_order_not_ml"
        };
      })
    };
  }
  function checksForCareer(graph, bank, careerId) {
    const {required} = scope(graph, careerId);
    if (!bank || !Array.isArray(bank.questions)) return [];
    const byConcept = new Map();
    for (const item of bank.questions) {
      if (!required.has(item.concept_id)) continue;
      if (!byConcept.has(item.concept_id)) byConcept.set(item.concept_id, []);
      byConcept.get(item.concept_id).push(item);
    }
    return [...byConcept.entries()].filter(([,items]) => items.length >= 3).map(([concept_id,items]) => ({
      concept_id, items: items.slice(0,3)
    }));
  }
  function grade(questions, submitted) {
    if (!Array.isArray(questions) || questions.length !== 3 || !Array.isArray(submitted) ||
      submitted.length !== questions.length) throw new Error("Invalid practice check.");
    const details = questions.map((q, i) => {
      const answer = submitted[i];
      if (!Number.isInteger(answer) || answer < 0 || answer >= q.options.length)
        throw new Error("Answer all three questions before submitting.");
      return {
        question_id: q.question_id, correct: answer === q.correct_index,
        correct_answer: q.options[q.correct_index],
        explanation: q.explanation
      };
    });
    const correct = details.filter(x => x.correct).length;
    return {score:correct, total:questions.length, passed:correct === questions.length, details};
  }
  root.WhatNextLearning = Object.freeze({ scope, evidenceSources, recommend, checksForCareer, grade });
})(typeof window !== "undefined" ? window : globalThis);
