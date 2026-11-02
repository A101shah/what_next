# Real public educational data — reproducible research pipeline

This directory separates **actual external observations** from WhatNext's human-curated career-learning curriculum. This integration does not fabricate student interactions, merge English/math performance into Python skill ratings, or claim neural next-lesson accuracy.

## What is actually included in GitHub
- `source_catalog.csv`: verified official source pages, data types, terms, and acquisition state.
- `ednet_100_preview_aggregate.csv`: non-identifying **aggregate only** (100 English practice interactions; 67 correct; 5 source learners; 91 questions), calculated from a public third-party EdNet preview. A non-random first-page preview is **not a model training dataset**.
- `manifest.json`: provenance, original dataset URLs, caveats, and preview checksum.
- The existing `data/onet_software_skills_31_0.csv` remains authentic **occupation-level** reference data (31,821 source associations); it is *not* per-person skill data.
- Full EdNet, ASSISTments and additional O*NET rating tables are **not in this repository**. This environment could not download them. Download them from the respective official providers before running importers.

### Obtain the actual data for model development

1. EdNet official KT1 ZIP and content metadata are linked from [Riiid EdNet](https://github.com/riiid/ednet). The author's compressed KT1 archive is approximately **1.2 GB** and requires disk space for extraction. The content archive contains `questions.csv`.
2. To obtain genuine, answer-validated EdNet rows, from the repository root use:

```powershell
python scripts/import_real_learning_data.py ednet --input "D:\Datasets\EdNet-KT1.zip" --questions "D:\Datasets\questions.csv" --max-students 5000 --max-rows 100000 --out "out/real_learning"
```

3. For corrected [ASSISTments 2009–2010 Skill Builder](https://sites.google.com/site/assistmentsdata/home/2009-2010-assistment-data/skill-builder-data-2009-2010), follow its **corrected** link (the original release contained duplicated records).

```powershell
python scripts/import_real_learning_data.py assist --input "D:\Datasets\skill_builder_data_corrected.csv" --max-rows 100000 --out "out/real_learning"
```

4. Official O*NET 31.0 Essential and Transferable Skills — **18,200** and **45,500** source rows:

```powershell
python scripts/download_onet_31_skills.py --out "out/real_learning"
```

The script validates the advertised row counts and source headers before exporting source-attributed skill ratings. These are career-level occupational rating rows, never an individual's skill proficiency.

### Train a genuine Deep Knowledge Tracing GRU

Only after importing a sufficiently large EdNet/ASSISTments dataset:

```powershell
python -m pip install torch
python scripts/train_knowledge_tracing.py --input "out/real_learning/ednet_interactions.csv" --epochs 3 --out "out/real_learning/ednet_dkt"
python -m unittest tests.test_real_data_pipeline -v
```

The GRU conditions on **previous question and answer correctness**, predicts **correctness on the next question**, and evaluates on a **student-disjoint 80/20 holdout**. This is real knowledge-tracing methodology, but the resulting metric is **TOEIC/mathematics next-response prediction**, not next-career-lesson recommendation accuracy. The importer refuses EdNet rows without a verified official question answer key. Training refuses fewer than 30 learners or 1,000 interactions by default; the included pilot sample is too small.

All real student-level exports and trained model artifacts stay under the existing git-ignored `out/` directory; **do not commit them to your public repository**. The app remains a static GitHub Pages curriculum recommender with locally stored practice-check results. Its current recommendation engine is still **rule-based**.

## License / attribution
- **EdNet** © original Riiid authors, [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Noncommercial research only; attribute the source; no redistribution of raw student traces by this repository.
- **ASSISTments**: [official data page](https://sites.google.com/site/assistmentsdata/home/2009-2010-assistment-data). Confirm and follow source-specific conditions, and acknowledge the original research in publications.
- **O*NET 31.0**: [O*NET Database](https://www.onetcenter.org/database.html), U.S. Department of Labor / Employment and Training Administration, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Cite version and modifications.

## Honesty and safety
No AI-generated 'students' or invented labels were included. Quiz-derived WhatNext progress is not the same population as EdNet or ASSISTments. Never use professional skill importance as a child's observed proficiency. An accuracy number for the GRU must come from the actual full-data run and held-out students, not from this pilot preview.
