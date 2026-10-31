# WhatNext AI — Your Knowledge GPS

**Personalized prerequisite-based learning paths, real workforce insights and a trained neural network.** Entirely static HTML/CSS/JavaScript, hosted from the same GitHub repository.

## Hosting — no custom GitHub Actions

All `.github/workflows/*.yml` files have been **deleted**. The repository stores the precomputed public JSON datasets and model weights; it does not train, scrape or execute Python during deployments.

- **GitHub Pages:** In **Settings → Pages → Build and deployment**, select **Deploy from a branch**, choose **main**, folder **/(root)**, then Save. This is essential because the old configuration selected GitHub Actions. The platform may show its own managed Pages deployment internally, but **there is no project-authored Actions workflow**.
- **Vercel:** Import `A101shah/what_next` through https://vercel.com/new using framework **Other**, root directory `.`, no build command. The committed `vercel.json` supports this. The Vercel workspace must be connected/authorized before its deployment can be verified.
- All browser inputs, including resumes and profile progress, stay in local storage. They do not synchronize across domains or devices.

Once GitHub Pages is switched to branch publishing, the expected link is https://a101shah.github.io/what_next/ .

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
```

The dataset and `out/` directory must remain **uncommitted**: they contain individual respondent-level survey observations, whereas public `data/*.json` files contain only trained parameters or aggregated evidence. No fabricated labels, career seniority, or student learning outcomes are introduced.

## How the next lesson is currently chosen

The **actual student recommendation policy** is custom JavaScript in `app.js` using:

1. Career destination chosen by the student.
2. Manually curated prerequisite relationships in `data/paths.json`.
3. Completed topics (self-reported), topic order and preferred interests.
4. Only unfinished topics with all prerequisites complete are eligible.

The neural network adds **career-family exploration**, and OECD/O*NET evidence contextualizes roadmaps, but **neither is falsely claimed to have learned the optimal next lesson**. To train and validate a neural lesson recommender, we would need consented student exercises, learning outcomes, and ground truth recommendations, followed by tests against the current rule-based baseline.

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
