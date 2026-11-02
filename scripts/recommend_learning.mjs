/**
 * Transparent RULE-BASED prototype; never presents the ranking as model accuracy.
 * The final application can later call this browser-compatible module with graph.json.
 */
export function getNextConcepts(graph, careerId, completed = [], limit = 5, goalConceptId = null) {
  const concepts = new Map(graph.concepts.map((c) => [c.concept_id, c]));
  const known = new Set(completed.filter((id) => concepts.has(id)));
  const careerIds = new Set(graph.career_concepts.filter((r) => r.career_id === careerId).map((r) => r.concept_id));
  if (!careerIds.size) throw Error("Unknown or empty career pathway: " + careerId);
  if (goalConceptId !== null && !careerIds.has(goalConceptId)) throw Error("Goal concept is outside the chosen career");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error("limit must be between 1 and 100");

  // Include transitive bridge prerequisites even when they are not listed directly
  // under the selected career. Otherwise cross-disciplinary paths can deadlock.
  const scope = new Set();
  const addWithPrereqs = (id) => {
    if (scope.has(id)) return;
    const concept = concepts.get(id);
    if (!concept) throw Error("Broken prerequisite graph: " + id);
    scope.add(id);
    for (const pre of concept.prerequisite_ids) addWithPrereqs(pre);
  };
  for (const id of goalConceptId ? [goalConceptId] : careerIds) addWithPrereqs(id);
  const all = [...scope].filter((id) => !known.has(id));
  const available = all.filter((id) => concepts.get(id).prerequisite_ids.every((p) => known.has(p)));
  const level = { beginner: 0, intermediate: 1, advanced: 2 };
  const priority = new Map();
  // Original curriculum order remains the tie-breaker when no diagnostic
  // evidence exists; alphabetical is used for prerequisite bridge concepts.
  for (const [index, link] of graph.topic_concepts.entries()) {
    if (!priority.has(link.concept_id)) priority.set(link.concept_id, index);
  }
  available.sort((a, b) => {
    const A = concepts.get(a), B = concepts.get(b);
    return level[A.level] - level[B.level]
      || Number(!careerIds.has(a)) - Number(!careerIds.has(b))
      || (priority.get(a) ?? Infinity) - (priority.get(b) ?? Infinity)
      || a.localeCompare(b);
  });
  return {
    career_id: careerId,
    goal_concept_id: goalConceptId,
    completed_recognized: known.size,
    remaining_in_scope: all.length,
    eligible_count: available.length,
    recommendations: available.slice(0, limit).map((id) => {
      const c = concepts.get(id);
      return {
        concept_id: id, name: c.name, level: c.level,
        demonstration_task: c.demonstration_task,
        prerequisite_ids: c.prerequisite_ids,
        why: careerIds.has(id) ? "Mapped to the selected curriculum and prerequisites are complete"
          : "Bridge prerequisite required by another concept in the selected curriculum",
        rank_basis: "deterministic_curriculum_order_not_trained_model"
      };
    })
  };
}
