# WhatNext AI — Your Knowledge GPS

**Personalized prerequisite-based learning paths, real workforce insights, CatBoost occupational classification, and a trained neural network.** Entirely static HTML/CSS/JavaScript, hosted from the same GitHub repository.

## Hosting — no custom GitHub Actions

All `.github/workflows/*.yml` files have been **deleted**. The repository stores the precomputed public JSON datasets and model weights; it does not train, scrape or execute Python during deployments.

- **GitHub Pages:** In **Settings → Pages → Build and deployment**, select **Deploy from a branch**, choose **main**, folder **/(root)**, then Save. This is essential because the old configuration selected GitHub Actions. The platform may show its own managed Pages deployment internally, but **there is no project-authored Actions workflow**.
- **Vercel:** Import `A101shah/what_next` through https://vercel.com/new using framework **Other**, root directory `.`, no build command. The committed `vercel.json` supports this. The Vercel workspace must be connected/authorized before its deployment can be verified.
- All browser inputs, including resumes and profile progress, stay in local storage. They do not synchronize across domains or devices.

Once GitHub Pages is switched to branch publishing, the expected link is https://a101shah.github.io/what_next/ .

## Dataset V3 — named technologies and resume-style skill categories

**Added, directly to the repository:** a source-backed O*NET software-technology relationship table with **31,821 genuine occupation-to-technology associations**, **923 distinct O*NET-SOC occupations**, and **8,751 normalized named tools/software examples**. The 8,751 count includes official software examples normalized using carefully reviewed exact aliases; it is not a count of surveyed workers or unique people.

The [real source CSV](data/onet_software_skills_31_0.csv) contains the original occupation code, official occupational title, software workplace example, O*NET element name, and `Hot Technology` / `In Demand` flags. A [small downloadable analysis CSV](data/WhatNext_Expanded_Role_Skills.csv) adds a **resume-like category** for each source association; a [compressed browser index](data/role_skills.json) joins the same records to 923 occupations for performant client-side use. The occupation relationships are independently sourced at O*NET-SOC level. Attribution: [O*NET Resource Center database](https://www.onetcenter.org/database.html), license: [O*NET database terms](https://www.onetcenter.org/database.html). A public [GitHub mirror](https://github.com/Lucialululu/SkillRadar/blob/main/data/onet/software_skills.csv) supplied the bytes used in this offline build; its 31,821 rows and seven-column schema match the O*NET 31.0 official listing, but the exact official upstream-byte SHA was not independently checked. This caveat is retained in the output metadata.

The resume attachment was **used only as a schema illustration**, never as an occupation-level observation. No names, email addresses, schools, employers, personal resume scores, or inferred achievements were inserted into the public data. Its general **technical-skills presentation categories** inspired the taxonomy in `data/skill_taxonomy.json`:

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

The **Skill studio** allows students to choose their career, browse a verified named-technology list for the mapped O*NET occupation, filter by category and search across all sourced examples or curated resume-like categories. The **Hot Technology** and **In Demand** chips come exclusively from O*NET's genuine flags, not an invented relevance model. Students can **self-declare** tools they know, see the exact source-listed name overlap for their career, and explore unfamiliar tools with targeted learning searches. No overlap count is a proficiency, job-readiness or probability score. Their chosen technologies appear under categorized **Technical Skills (self-reported)** in the editable resume, and are stored in the browser only.

**Source integrity is critical:** the earlier **6,517 OECD PIAAC individual workforce rows** remain a separate survey dataset. The new **31,821 O*NET rows are occupation-to-software reference relationships**, not extra employed adults or person-level evidence. They are linked to an individual app pathway only by its **explicit O*NET-SOC code**, and they are **never joined to OECD respondents as if the survey measured each respondent's exact tools**. The 42.25% CatBoost test accuracy and 40.49% MLP test accuracy are **unchanged**: we have not retrained those person-level classifiers on this new reference dataset.

### Refresh dataset entirely offline

```bash
python -m scripts.build_role_skills
node --test tests/test_skill_studio.mjs
```

Both custom GitHub Actions workflows remain deleted. GitHub Pages serves the checked-in static CSV and JSON directly from `main`, while Vercel can serve the same committed artifacts when connected.

## CatBoost occupational model — recommended for tabular features

The same **6,517 authentic anonymous OECD PIAAC** records feed an offline-trained **CatBoost multi-class gradient-boosted decision-tree model**, now the default **Career Intelligence** classifier. It operates on 27 explicitly encoded inputs (seven observed 0–5 skill-use bands, numerical work experience, one-hot education level and field). The seven bands are ordinal, the education fields nominal and years of work numerical. This input encoding is consistent with the app's actual questionnaire: we intentionally do **not** feed the model uncollected continuous OECD latent index scores.

**Evaluation:** train/test split 80/20, random_state 42; train-only median imputation; three-fold stratified CV on the training partition selected 350 iterations over a 220-iteration baseline by macro-F1. Test accuracy **42.25%**, macro-F1 **37.76%**, balanced accuracy **38.15%**. The previous neural network has **40.49%** test accuracy on the same split. Mean macro-F1 across training folds for the selected CatBoost variant: **35.89%**. In an additional **leave-one-country-out** check, combined held-out-country accuracy was approximately **36.79%** (Chile 42.21%, Italy 37.10%, Poland 43.99%, Singapore 33.46%, United States 32.59%). These separate checks evaluate transfer to an unseen country's workforce. Since the random 20% test set was explored earlier, do not treat its 42.25% accuracy as fresh independent model-selection evidence. Results may weaken on new countries.

The production artifact `data/career_catboost.json` contains 350 symmetric trees and quantized leaf values, **not individual OECD records**. `catboost.js` executes the exact numeric tree inference in the browser; reference predictions and the quantized test accuracy are checked during offline export. **Both models remain selectable** in Career Intelligence for transparent comparison. This predicts broad *current occupation families*, not skill mastery, a student's future success, or the best study intervention.

**Offline reproduction** after placing the original CSV in the ignored `out/` directory:

```bash
pip install -r requirements.txt
python -m scripts.train_catboost
node --test tests/test_catboost_search.mjs
```

## Learning search + Google web search

The new **Learning search** section, also accessible from the top bar, shows ranked, clickable results **inside the app** from our actual curated learning paths, official resource URLs, selected dated research items and in-app guides. Relevant results include original resource links and a way back to the corresponding roadmap.

**Google Search** and **Search official docs** buttons open a real Google web search for the same query in a new tab. We do not scrape Google, generate fictitious web results, or expose a Google API key in client code. A more integrated option is also built: to embed Google Programmable Search results inside the page, create your own search engine at https://programmablesearchengine.google.com/ and put its **public search engine ID (`cx`)** in `data/search_config.json`, key `google_programmable_search_engine_id`. The "Show Google results here" button appears automatically; Google scripts and search terms are sent to Google only when the visitor deliberately activates this option. Google PSE results can differ from ordinary Google.com results and availability/configuration are controlled by Google.

Official Google integration docs: https://developers.google.com/custom-search/docs/element .

## Real neural network — occupation exploration

**Training dataset:** the 6,517 **anonymous, employed OECD PIAAC Cycle 2** respondents from Chile, Italy, Poland, Singapore and the United States, merged into a real 47-column CSV. We use their seven *workplace skill-use bands*, lifetime paid-work experience, and education level and field. The label is a broad **two-digit ISCO-08 occupational family** (12 classes).

**Model:** a scikit-learn `MLPClassifier` trained from scratch, with layers **27 → 20 → 12 → 12**. `scripts/train_career_nn.py` trains offline with an **80%/20% stratified train–test split**, fits the median imputation and StandardScaler on **train only**, and uses early stopping internally. `data/career_nn.json` contains the model preprocessing parameters, 16-bit quantized weights, and evaluation metrics. The `neural.js` browser engine runs forward propagation and softmax without a service, account or GPU.

| Verified held-out occupation-classification metric | Value |
|---|---:|
| Accuracy | **40.49%** |
| Macro-F1 | **33.95%** |
| Balanced accuracy | **36.35%** |
| Majority-class baseline accuracy | **17.60%** |
| Training rows | 5,213 |
| Test rows | 1,304 |

**Be precise about what this means:** these are **occupation classification** results, NOT the accuracy of learning recommendations, job success predictions, or student ability scores. The model was fitted on employed adults, not outcome-verified students. Inputs students enter in the Career Intelligence page only approximate OECD skill-*use* categories, and the softmax values are **uncalibrated scores**, not employment probabilities. The random test split does not verify generalization to unseen countries. The model cannot distinguish AI, cloud, or cyber jobs when they share the same broad ICT family.

### Reproduce training offline (optional)

Place the authentic `WhatNext_Career_Intelligence_Combined.csv` file in `out/`, then run:

```bash
pip install -r requirements.txt
python -m scripts.train_career_nn
node --test tests/test_neural.mjs
node --test tests/test_catboost_search.mjs
```

The dataset and `out/` directory must remain **uncommitted**: they contain individual respondent-level survey observations, whereas public `data/*.json` files contain only trained parameters or aggregated evidence. No fabricated labels, career seniority, or student learning outcomes are introduced.

## How the next lesson is currently chosen

The **actual student recommendation policy** is custom JavaScript in `app.js` using:

1. Career destination chosen by the student.
2. Manually curated prerequisite relationships in `data/paths.json`.
3. Completed topics (self-reported), topic order and preferred interests.
4. Only unfinished topics with all prerequisites complete are eligible.

CatBoost and the neural network add **career-family exploration**, and OECD/O*NET evidence contextualizes roadmaps, but **neither is falsely claimed to have learned the optimal next lesson**. To train and validate a neural lesson recommender, we would need consented student exercises, learning outcomes, and ground truth recommendations, followed by tests against the current rule-based baseline.

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
python -m scripts.train_career_nn
python -m unittest discover -s tests -v
node --check app.js
node --check neural.js
node --test tests/test_neural.mjs
```

Run only the needed update scripts, inspect their results and commit the **appropriate precomputed JSON**. The original OECD microdata downloads are stored under ignored `.cache/piaac/`. Vercel and GitHub Pages only serve files you commit; no scheduled training job or Actions artifact is required.

**Sources:** [OECD PIAAC](https://www.oecd.org/en/data/datasets/piaac-2nd-cycle-database.html) · [O*NET](https://www.onetcenter.org/database.html) · [OpenAlex](https://openalex.org/).

## Limitations

This research app is not a professional suitability exam or a verified career decision authority. Its survey cross-sections do not establish what causes professional success, personal traits or individual job seniority. O*NET occupation skill-importance values are distinct from an individual student's skills. Neural scores and raw survey-use bands must not be used to rank people, screen candidates, or imply guaranteed employment.
