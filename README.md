# WhatNext AI

**Know what to learn next.** An evidence-aware, personalized learning navigator for students.

## MVP
- Student profile: field, career goal, weekly study time, interests, and existing skills.
- Prerequisite-aware learning roadmap with clear "why next" recommendations, learning resources, mini-projects, and progress.
- **Career evidence explorer** from **OECD PIAAC Cycle 2 (2023)** real employed respondents: choose country and broad occupation family; inspect highest-qualification field and education-level distributions. Only aggregate summaries are published; no raw microdata.
- Career neighborhood computed by **K-Means** on real **O*NET 31.0 essential-skills ratings**; PCA provides a 2D view. No synthetic training data.
- Daily field-related published research updates from **OpenAlex**, each with its original link and publication date.
- Editable, evidence-first resume builder; print to PDF or export HTML.
- No accounts, API keys, paid services, or backend required. Student entries stay in the browser's local storage.

## Run locally
Run a local web server (opening files directly breaks JSON loading):

```bash
python -m http.server 8000
```

Visit http://localhost:8000.

## Refresh **verified data** and train the ML model
```bash
pip install -r requirements.txt
python scripts/build_data.py
python scripts/build_careers.py
python scripts/update_news.py
python -m unittest discover -s tests -v
```

The model build fetches O*NET occupational and essential-skill CSVs **directly from the official O*NET Resource Center**, and fits scikit-learn StandardScaler, PCA and K-Means to the observed occupational ratings. The resulting `data/model.json` contains cluster membership and PCA coordinates—not fake student-learning labels. Refresh fails clearly if upstream data cannot be obtained or parsed. It never fabricates fallback observations.

The research updater requests recent actual publications from OpenAlex. If the API cannot be reached, it preserves the last previously verified feed (or an empty feed) and indicates the issue.

## Verified workforce evidence
`scripts/build_careers.py` downloads current OECD PIAAC Cycle 2 public-use country CSVs (semicolon separated) and the original international codebook, then validates the actual fields. The first version covers **Chile, Poland, Singapore, United States and Italy**, subject to availability and country-specific disclosure suppressions.

We filter **employed respondents** (`C2_D05 == 1`) and valid **ISCO-08 two-digit occupational families** (`ISCO2C`). We summarize **education level** (`EDLEVEL3`) and **field of study** (`EDFIELD`) using **`SPFWT0`** respondent survey weights. Only groups with at least **25 respondents** are shown, and an indicator must have at least **20 valid responses**. The published JSON includes denominators, verified country source URLs, source SHA-256 hashes, and any excluded countries.

**What the statistics do not mean:** This is not a training dataset of named career histories, a longitudinal study, a causal explanation of professional success, or proof of job qualifications. Some countries suppress `ISCO2C`, `EDLEVEL3`, or detailed education fields. Weighted percentages are descriptive (no replicate-weight variance estimates). We never pool different countries or fabricate missing categories. Our curated course prerequisites remain independent of this observational evidence.

Only the grouped JSON is published. Raw PIAAC respondent files are processed by GitHub Actions and kept out of the deployed website; `.cache/piaac` is not included in the publish directory.

Source: [OECD PIAAC Cycle 2 PUF and international codebook](https://www.oecd.org/en/data/datasets/piaac-2nd-cycle-database.html). World Bank STEP is a potential later source but **not yet integrated**.

## Deploy on GitHub Pages and Vercel (same GitHub repository)

- **GitHub Pages** runs `.github/workflows/deploy.yml` daily and for each push. It downloads official O*NET / OECD PIAAC / OpenAlex records, builds and validates grouped JSON, stages only the public static files, then publishes the app.
- **Vercel** can be linked to `A101shah/what_next` with **Framework Preset: Other**, **Root Directory: .**, and **Build Command: none**. The `vercel.json` file disables framework detection for this plain HTML/CSS/JS app.
- The GitHub workflow **commits only the three verified output files** `data/model.json`, `data/careers.json`, and `data/research.json` to `main` using the GitHub Actions bot. Therefore, Vercel's Git import receives the same real observations as the Pages build. A data refresh does not create an infinite GitHub Actions loop.
- The original large respondent CSVs are cached **only in CI**, never committed or hosted. No individual respondent data is published.
- The student profile and resume remain in browser-local storage; they will **not automatically sync across the two domains or devices**.

Verify both hosting providers after deployment; GitHub Pages and Vercel have separate URLs and deployment histories.

## Deploy on GitHub Pages
An included GitHub Actions workflow prepares the data and publishes the static website on pushes to `main`, plus a scheduled daily update. Enable **Settings → Pages → Build and deployment → GitHub Actions** once, if not already selected. After a successful deployment the expected URL is https://a101shah.github.io/what_next/ .

## Source provenance
- [O*NET Database 31.0](https://www.onetcenter.org/database.html) — U.S. Department of Labor-sponsored primary occupational research. **Not** a measurement of individual student mastery.
- [OECD PIAAC Cycle 2](https://www.oecd.org/en/data/datasets/piaac-2nd-cycle-database.html) — actual sampled adults' employment and education, analyzed only in aggregates.
- [OpenAlex](https://openalex.org/) — research metadata, links, and publication dates. Research trends are informational, not proof that a skill is mandatory.
- `data/paths.json` — **human-curated syllabus and prerequisite dependencies** for the MVP. Not represented as an official dataset or ML output.

## Methodology and boundaries
The actionable "next step" algorithm uses explicit prerequisite rules, user-reported mastery, topic order, interests and study time. This is a deterministic and explainable MVP policy. **K-Means is used for genuine occupational similarity** using original O*NET vectors; it is not falsely claimed to have learned individual study preferences. No students' learning-outcome ground truth exists yet. To train a personalized learning ranking neural network later, collect consented student feedback and measure Precision@K / NDCG against a rule-based baseline.

Research refresh depends on external endpoints and GitHub Actions. Without an official O*NET build, career-neighborhood insights are withheld rather than invented. Browser-local storage can be cleared; there is no server persistence. Resume content only includes user-provided achievements and projects.

Built with simple HTML, CSS, JavaScript, Python, and scikit-learn.