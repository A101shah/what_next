# WhatNext AI — UI cleanup and acceptance status

The current website includes Overview, Learning roadmap, Skill checks, Skill studio, Learning search, Career Intelligence, Research Data Lab, World pulse and personal profile. The dedicated Career Studio resume/editor/export workspace and the experimental sequence-model research card have been removed.

## Verification

The cleanup preserves the existing **PCA → K-Means → MLP** occupational classifier and the **107-concept prerequisite graph**. Regression tests assert retired pages, handlers, training scripts and model-metric fields are absent.

```bash
node --test tests/*.mjs
python -m unittest discover -s tests -v
```

On the published site, use Research Data Lab → **Run deployment check**, then test navigation, learning roadmap, assessments, saved profile, search, external official-documentation links, and hybrid classifier in a real browser. These checks are not a guarantee of pixel-perfect responsive behavior or worldwide availability.

The static HTML button inventory decreased from 43 to **40** after removing one sidebar destination and two export/print buttons. The Career Intelligence prediction form, career choice within the profile, and Skill Studio remain active.

**Hosting:** Changes merged to GitHub `main` are eligible for GitHub Pages branch deployment and any Vercel GitHub-connected deployment; their live status must be verified separately.
