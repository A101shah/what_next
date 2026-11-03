# Public educational data — source provenance

This directory contains source provenance and **non-identifying aggregates** of external educational data, not live WhatNext students' learning histories or technical-topic training labels.

## Included public assets

- `source_catalog.csv`: official and verified data-source URLs, populations and licence limitations.
- `ednet_100_preview_aggregate.csv`: non-random sample of 100 English question attempts from five source histories (67 correct; 91 distinct questions).
- `manifest.json`: preview provenance, source URL and checksum.
- `public_evidence_dashboard.json`: source summaries, live prerequisite policy status and deployed occupational classifier metadata.

Raw learner histories and original OECD respondent-level files are **not** distributed through the public site. EdNet and ASSISTments question attempts do not measure the ability to learn Python, ML, cloud or cybersecurity.

## Optional data import, not a model-training pipeline

The independent `scripts/import_real_learning_data.py` utility parses authentic EdNet KT1 (TOEIC English) and corrected ASSISTments (mathematics) records for offline provenance research. It does not train or deploy a neural learning model. Obtain datasets from original providers, observe their licence terms and retain individual histories in ignored `out/` directories.

- [Official EdNet](https://github.com/riiid/ednet) — original data under CC BY-NC 4.0.
- [ASSISTments](https://sites.google.com/site/assistmentsdata/home/2009-2010-assistment-data) — confirm original provider terms.

```bash
python scripts/import_real_learning_data.py ednet --input "out/EdNet-KT1.zip" --questions "out/questions.csv" --max-students 5000 --max-rows 100000 --out "out/real_learning"
python scripts/import_real_learning_data.py assist --input "out/assistments_corrected.csv" --max-rows 100000 --out "out/real_learning"
```

## Learning recommendation evidence

WhatNext's 45 short practice questions are authored curriculum material, not scientific measurements of long-term student proficiency. The live next-concept recommender remains **rule-based**, constrained by the 107-concept prerequisite graph. Real technical learning outcomes would be required to evaluate any future ML recommendation system.

```bash
python scripts/validate_technical_learning_outcomes.py --input out/technical_learning_outcomes.csv
```

This research-only validator checks some necessary input fields. Passing it would not prove recommendation accuracy.

## Public deployment verification

On the published site, open **Research Data Lab** and select **Run deployment check** for 15 same-origin asset checks. Independent HTTPS availability can be tested with:

```bash
python scripts/verify_live_github_pages.py
```

Neither check establishes recommendation model performance.
