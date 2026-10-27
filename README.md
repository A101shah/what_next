# WhatNext AI

**Know what to learn next.** An evidence-aware, personalized learning navigator for students.

## MVP
- Student profile: field, career goal, weekly study time, interests, and existing skills.
- Prerequisite-aware learning roadmap with clear "why next" recommendations, learning resources, mini-projects, and progress.
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
python scripts/update_news.py
```

The model build fetches O*NET occupational and essential-skill CSVs **directly from the official O*NET Resource Center**, and fits scikit-learn StandardScaler, PCA and K-Means to the observed occupational ratings. The resulting `data/model.json` contains cluster membership and PCA coordinates—not fake student-learning labels. Refresh fails clearly if upstream data cannot be obtained or parsed. It never fabricates fallback observations.

The research updater requests recent actual publications from OpenAlex. If the API cannot be reached, it preserves the last previously verified feed (or an empty feed) and indicates the issue.

## Deploy on GitHub Pages
An included GitHub Actions workflow prepares the data and publishes the static website on pushes to `main`, plus a scheduled daily update. Enable **Settings → Pages → Build and deployment → GitHub Actions** once, if not already selected. After a successful deployment the expected URL is https://a101shah.github.io/what_next/ .

## Source provenance
- [O*NET Database 31.0](https://www.onetcenter.org/database.html) — U.S. Department of Labor-sponsored primary occupational research. **Not** a measurement of individual student mastery.
- [OpenAlex](https://openalex.org/) — research metadata, links, and publication dates. Research trends are informational, not proof that a skill is mandatory.
- `data/paths.json` — **human-curated syllabus and prerequisite dependencies** for the MVP. Not represented as an official dataset or ML output.

## Methodology and boundaries
The actionable "next step" algorithm uses explicit prerequisite rules, user-reported mastery, topic order, interests and study time. This is a deterministic and explainable MVP policy. **K-Means is used for genuine occupational similarity** using original O*NET vectors; it is not falsely claimed to have learned individual study preferences. No students' learning-outcome ground truth exists yet. To train a personalized learning ranking neural network later, collect consented student feedback and measure Precision@K / NDCG against a rule-based baseline.

Research refresh depends on external endpoints and GitHub Actions. Without an official O*NET build, career-neighborhood insights are withheld rather than invented. Browser-local storage can be cleared; there is no server persistence. Resume content only includes user-provided achievements and projects.

Built with simple HTML, CSS, JavaScript, Python, and scikit-learn.