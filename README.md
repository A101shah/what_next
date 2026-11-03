# WhatNext AI — Your Knowledge GPS

**Current UI QA:** [Read cleanup verification and remaining live-browser checks](QA_STATUS.md). The 15-asset deployment self-check covers the production hybrid model and primary scripts. External GitHub Pages and cross-browser interaction verification remain pending.

**Personalized prerequisite-based learning paths, real workforce insights, and a trained neural-network career classifier.** Entirely static HTML/CSS/JavaScript, hosted from the same GitHub repository.

## New: skill checks and evidence-aware next learning steps

The existing GitHub Pages UI now has a **Skill checks** workspace, backed by the offline data in `data/learning_v2/` and by `learning.js` and `assessment-ui.js`.

- Recommends eligible next **concepts** using 107 granular curriculum concepts, 139 proposed prerequisite edges, and six career pathways. Transitive prerequisites are included so a career can recommend missing foundations from another domain.
- Provides **45 authored practice questions** covering 15 foundational concepts. Each check contains three multiple-choice questions and is marked passed at 3/3 correct. Questions are editorial and **not validated measures of proficiency**.
- Keeps **passed practice checks** distinct from **self-reported learned concepts**. Either can satisfy the app's curriculum completion rule, but self-reported prerequisites are expressly labeled as unassessed, never secretly treated as verified.
- Stores only short assessment summaries (correct count, attempt count and check date) in the browser under `whatnext:learning:evidence:v1`. Individual answers and personal identifiers are not sent or logged to a server.
- Updates the overview next-step card, learning snapshot, and roadmap handoff. Existing roadmap completion, neural-network classification, and O*NET evidence remain in place.
- Uses only static GitHub Pages assets; no custom GitHub Actions, API secrets, or backend.

**Datasets:** [WhatNext_Compiled_Learning_Dataset_V3.csv](data/learning_v2/WhatNext_Compiled_Learning_Dataset_V3.csv) (170 rows × 23 columns) and [WhatNext_Diagnostic_Question_Bank_V1.csv](data/learning_v2/WhatNext_Diagnostic_Question_Bank_V1.csv) (45 rows × 10 columns).

**Rebuild and check locally:**
```bash
node scripts/build_learning_graph.mjs --check
node --test tests/test_learning_graph.mjs tests/test_assessment.mjs
```

The OECD-trained neural network predicts broad occupation families, **not** what lesson a student should study next. The new recommender is transparently rule-based; no neural recommendation accuracy is claimed.


## Public educational data research (separate from live learning)

WhatNext keeps non-identifying EdNet English response preview aggregates, original source references, and optional offline EdNet/ASSISTments data import utilities. No individual student interaction records or student-level model weights are published. The 100-answer English preview is not technical learning evidence or neural next-topic training data. See [research source documentation](data/real_learning/README.md).

## Research Data Lab (GitHub Pages)

Research Data Lab displays O*NET evidence, non-identifying EdNet preview results, dataset provenance, the prerequisite-based next-lesson policy, and the live PCA → K-Means → MLP occupational classifier. Retired experimental sequence modeling is not part of the website or its training scripts.

## Hosting — no custom GitHub Actions

All `.github/workflows/*.yml` files have been **deleted**. The repository stores the precomputed public JSON datasets and model weights; it does not train, scrape or execute Python during deployments.

- **GitHub Pages:** In **Settings → Pages → Build and deployment**, select **Deploy from a branch**, choose **main**, folder **/(root)**, then Save. This is essential because the old configuration selected GitHub Actions. The platform may show its own managed Pages deployment internally, but **there is no project-authored Actions workflow**.
- **Vercel:** Import `A101shah/what_next` through https://vercel.com/new using framework **Other**, root directory `.`, no build command. The committed `vercel.json` supports this. The Vercel workspace must be connected/authorized before its deployment can be verified.
- Browser profile and assessment inputs stay in local storage. They do not synchronize across domains or devices.

Once GitHub Pages is switched to branch publishing, the expected link is https://a101shah.github.io/what_next/ .

## Dataset V3 — named technologies and technical skill categories

**Added, directly to the repository:** a source-backed O*NET software-technology relationship table with **31,821 genuine occupation-to-technology associations**, **923 distinct O*NET-SOC occupations**, and **8,751 normalized named tools/software examples**. The 8,751 count includes official software examples normalized using carefully reviewed exact aliases; it is not a count of surveyed workers or unique people.

The [real source CSV](data/onet_software_skills_31_0.csv) contains the original occupation code, official occupational title, software workplace example, O*NET element name, and `Hot Technology` / `In Demand` flags. A [small downloadable analysis CSV](data/WhatNext_Expanded_Role_Skills.csv) adds a **technical skill category** for each source association; a [compressed browser index](data/role_skills.json) joins the same records to 923 occupations for performant client-side use. The occupation relationships are independently sourced at O*NET-SOC level. Attribution: [O*NET Resource Center database](https://www.onetcenter.org/database.html), license: [O*NET database terms](https://www.onetcenter.org/database.html). A public [GitHub mirror](https://github.com/Lucialululu/SkillRadar/blob/main/data/onet/software_skills.csv) supplied the bytes used in this offline build; its 31,821 rows and seven-column schema match the O*NET 31.0 official listing, but the exact official upstream-byte SHA was not independently checked. This caveat is retained in the output metadata.

The technical skill taxonomy in `data/skill_taxonomy.json` uses human-curated categories:

- Programming & query languages
- Backend & APIs
- Databases & data stores
- AI, ML & data science
- Developer tools, Git & cloud
- Frontend & interface development
- Creative design & media
- Business & occupational software

Human-curated aliases standardize source strings, e.g. SQL and its official workplace labels. Items absent from the official software examples (for example, FastAPI or some creative tools) remain available for **optional, self-reported skill entry** but are **not fabricated as an O*NET occupational requirement**.

### What the user sees

The **Skill studio** allows students to choose their career, browse a verified named-technology list for the mapped O*NET occupation, filter by category and search across all sourced examples or curated resume-like categories. The **Hot Technology** and **In Demand** chips come exclusively from O*NET's genuine flags, not an invented relevance model. Students can **self-declare** tools they know, see the exact source-listed name overlap for their career, and explore unfamiliar tools with targeted learning searches. No overlap count is a proficiency, job-readiness or probability score. Their selected technologies are stored in the browser only and remain marked as self-reported.

**Source integrity is critical:** the earlier **6,517 OECD PIAAC individual workforce rows** remain a separate survey dataset. The new **31,821 O*NET rows are occupation-to-software reference relationships**, not extra employed adults or person-level evidence. They are linked to an individual app pathway only by its **explicit O*NET-SOC code**, and they are **never joined to OECD respondents as if the survey measured each respondent's exact tools**. The O*NET occupational reference dataset does not add individual respondents to the OECD training data. The former **40.49%** MLP occupation-classification accuracy now serves as a comparison baseline to the new **41.41%** hybrid model trained on the original 6,517 OECD respondents.

### Refresh dataset entirely offline

```bash
python -m scripts.build_role_skills
node --test tests/test_skill_studio.mjs
```

Both custom GitHub Actions workflows remain deleted. GitHub Pages serves the checked-in static CSV and JSON directly from `main`, while Vercel can serve the same committed artifacts when connected.

## Learning search + Google web search

The new **Learning search** section, also accessible from the top bar, shows ranked, clickable results **inside the app** from our actual curated learning paths, official resource URLs, selected dated research items and in-app guides. Relevant results include original resource links and a way back to the corresponding roadmap.

**Google Search** and **Search official docs** buttons open a real Google web search for the same query in a new tab. We do not scrape Google, generate fictitious web results, or expose a Google API key in client code. A more integrated option is also built: to embed Google Programmable Search results inside the page, create your own search engine at https://programmablesearchengine.google.com/ and put its **public search engine ID (`cx`)** in `data/search_config.json`, key `google_programmable_search_engine_id`. The "Show Google results here" button appears automatically; Google scripts and search terms are sent to Google only when the visitor deliberately activates this option. Google PSE results can differ from ordinary Google.com results and availability/configuration are controlled by Google.

Official Google integration docs: https://developers.google.com/custom-search/docs/element .

## Unified PCA → K-Means → Neural Network occupational classifier

**Current production model:** one trained MLP combining PCA and K-Means as feature engineering. It uses authentic OECD PIAAC Cycle 2 respondent observations, **not** O*NET occupation-level clusters and not synthetic students. The previous standalone `data/career_nn.json` is retained **only as a historical comparison model**; the live app loads `data/career_hybrid_nn.json` and runs `neural.js`.

**Training process:**

1. Use 6,517 authentic respondent rows and their 12 occupational-family labels. Assemble the original 27 encoded numeric / one-hot predictors.
2. Split into **5,213 training** and **1,304 held-out** observations (stratified 80/20; seed 42). Impute and standardize using **training-only** values.
3. Apply PCA to the **first eight numerical inputs** (seven skill-use bands + paid-work years), not to the education one-hot columns. Candidate dimensions **3, 5, 7**; PCA variance retained by the selected 7-dimensional projection: **93.11%**.
4. Fit K-Means on the training PCA coordinates, selecting `k` from **2, 4, 6**. The winner was **k=4**, based on macro-F1 using an **inner 22% validation holdout** from training (seed 104). No outer test rows are used in the PCA, K-Means, scaling or candidate selection.
5. Calculate four standardized **distances to cluster centroids** for each respondent; append these to the original 27 standardized predictors. This makes a **31-input MLP** (31 → 20 → 12 → 12). There is **one NN**, not one separate NN for each cluster.
6. Refit selected PCA, K-Means, distance scaler and MLP using all 5,213 training rows. Save compact, quantized weights and all preprocessing parameters; browser code reproduces the transformations in `neural.js`.

**Actual same-split evaluation:**

| Saved 80/20 occupational classifier | Accuracy | Macro-F1 | Balanced accuracy |
|---|---:|---:|---:|
| Original MLP (27 inputs) | 40.49% | 33.95% | 36.35% |
| **Hybrid PCA + K-Means + MLP** | **41.41%** | **35.76%** | **37.14%** |

The accuracy improvement is about **0.92 percentage points**. This is the *same historical random holdout* that was used when studying the former model; it is **not independent external or student-outcome validation**. It does not establish that the NN knows which topic a student should learn next or that K-Means clusters correspond to real career groups.

**Reproducibility:** Put the original personal-level `WhatNext_Career_Intelligence_Combined.csv` under ignored `out/`; never upload respondent rows to GitHub. Then:

```bash
pip install -r requirements.txt
python -m scripts.train_career_hybrid
node --test tests/test_hybrid_nn.mjs tests/test_nn_only.mjs tests/test_neural.mjs
```

Source code: [hybrid trainer](scripts/train_career_hybrid.py). Saved results: [hybrid model](data/career_hybrid_nn.json), [experiment report](data/career_hybrid_experiment.json). Browser-only inference uses no service or keys.

## How the next lesson is currently chosen

The **actual student recommendation policy** is custom JavaScript in `app.js` using:

1. Career destination chosen by the student.
2. Manually curated prerequisite relationships in `data/paths.json`.
3. Completed topics (self-reported), topic order and preferred interests.
4. Only unfinished topics with all prerequisites complete are eligible.

The neural network adds **career-family exploration**, while OECD/O*NET data contextualizes roadmaps. **It has not learned the optimal next lesson.** To train and validate a neural lesson recommender, we would need consented student exercises, learning outcomes, and ground truth recommendations, followed by tests against the current rule-based baseline.

## Other models and evidence sources

- **O*NET occupational ML** in `scripts/build_data.py`: StandardScaler, 2D PCA and K-Means with **6 clusters**, trained on **231 genuine occupations × 10 O*NET skill-importance features**. Saved silhouette score: **0.187**. Not a classification accuracy. Generated `data/model.json` is committed.
- **OECD career evidence**: `scripts/build_careers.py`, `scripts/export_merged_people.py`, and `scripts/build_skill_evidence.py` produce country/occupation-level weighted distributions for education, years of paid work and seven workplace skill-use indicators. At least **25 respondents** per displayed group and **20 valid observations** per displayed indicator. Published as `data/careers.json` and `data/skill_evidence.json`; individual respondent rows are not hosted.
- **OpenAlex publications**: `scripts/update_news.py` creates `data/research.json`; after removing Actions the feed refreshes **only if run manually**. The site must show when verified research data is missing rather than invent articles.
- **Learning syllabus** `data/paths.json`: human-curated topics, prerequisites and practical exercises, not ML training labels.

### Update research or models manually

```bash
pip install -r requirements.txt
python scripts/build_careers.py
python -m scripts.export_merged_people
python -m scripts.build_skill_evidence
python scripts/build_data.py
python scripts/update_news.py
python -m scripts.train_career_hybrid
python -m unittest discover -s tests -v
node --check app.js
node --check neural.js
node --test tests/test_neural.mjs
```

Run only the needed update scripts, inspect their results and commit the **appropriate precomputed JSON**. The original OECD microdata downloads are stored under ignored `.cache/piaac/`. Vercel and GitHub Pages only serve files you commit; no scheduled training job or Actions artifact is required.

**Sources:** [OECD PIAAC](https://www.oecd.org/en/data/datasets/piaac-2nd-cycle-database.html) · [O*NET](https://www.onetcenter.org/database.html) · [OpenAlex](https://openalex.org/).

## Limitations

This research app is not a professional suitability exam or a verified career decision authority. Its survey cross-sections do not establish what causes professional success, personal traits or individual job seniority. O*NET occupation skill-importance values are distinct from an individual student's skills. Neural scores and raw survey-use bands must not be used to rank people, screen candidates, or imply guaranteed employment.
