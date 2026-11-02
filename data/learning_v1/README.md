# Learning Dataset V1

Normalized, provenance-preserving export of the existing `data/paths.json` syllabus for WhatNext AI.

Tables: `careers.csv` (career), `learning_topics.csv` (career-specific lessons), `topic_prerequisites.csv` (directed edges), `learning_resources.csv` (URLs). Foreign keys link on `career_id` and `topic_id`. See `manifest.json` for source SHA, counts, verification caveats, and validation.

**Source**: existing human-curated learning-path file; not OECD/O*NET observational data. The O*NET identifiers are existing mappings, not independently verified in this export. No synthetic user progress, labels, or measured recommendation accuracy have been added. Official-looking learning URLs were not live-tested. This export is a clean **starting knowledge graph**, not an experimentally validated educational recommendation dataset.

**Next version** should normalize repeated skill concepts across careers, validate resource availability, add skill-level diagnostic questions and concept-to-role edges with source provenance, and gather consented anonymized learning events before attempting supervised recommendation training.
