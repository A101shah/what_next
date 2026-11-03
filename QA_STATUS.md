# WhatNext AI — Interaction QA report (3 November 2026)

## Scope and honest conclusion

The main repository files were audited after the PCA → K-Means → NN deployment.
An isolated JavaScript DOM simulation covered the majority of high-value
interactions, and structural checks covered **all 43 static HTML buttons**.
The public GitHub Pages URL **could not be fetched from this environment**;
therefore **zero broken buttons and pixel-perfect mobile UI are not certified**.
A full real-browser and external-link smoke test is still necessary.

## Fixed

1. **Critical startup wiring:** `app.js` used `querySelector` (`$`) and
   called `.forEach` on the single element for Learning Search suggestions.
   This threw a TypeError during `bindActions()`, preventing the remaining
   start-up setup. Replaced it with `querySelectorAll` (`$$`) so each of
   the five suggestion chips has a working handler.
2. **Mobile navigation accessibility:** keep `aria-expanded` in sync with
   opening and navigation; added `aria-controls="sidebar-nav"`.
3. **Resume download:** corrected the exported HTML's missing `</head>`.
4. **Stale content:** removed references to the retired CatBoost model in
   Learning Search guidance and changed false references to scheduled news
   refreshes. The OpenAlex feed is currently refreshed manually.
5. **Self-report confirmation readability:** clarified that the toggled Set's
   membership is the **new** state. The confirmation message is displayed
   correctly for adding and removing a self-report. An isolated click test
   caught and prevented an accidental reversal during the repair.
6. **Deployment diagnostics:** expanded from 5 to **15** public-resource
   checks, covering main app, assessment scripts, search, skill catalogue,
   graph, authored quiz questions, curriculum, hybrid model, O*NET data,
   research metadata and stylesheet.

## Checks actually executed (isolated JS + actual GitHub branch data)

| Check | Result |
|---|---|
| Static HTML buttons mapped to an appropriate handler or form | **43/43** |
| Duplicate `id` attributes | **0** |
| App start with complete JSON assets | Pass |
| All 5 Learning Search suggestion chips register handlers | Pass |
| Search suggestion click populates curated results and Google link | Pass |
| Mobile menu toggle and `aria-expanded` close on navigation | Pass |
| Add a self-reported technical skill | Pass |
| Mark a roadmap topic complete and persist progress | Pass |
| PCA/K-Means/NN browser occupation prediction (sample input) | Pass |
| Save career profile and hours/week | Pass |
| Export valid resume HTML containing entered user data | Pass |
| Print resume action calls the browser print function | Pass |
| Add/remove concept self-report shows correct confirmation | Pass |
| Submit a fully correct 3-question practice check and save 3/3 | Pass |
| Research metadata filters change displayed source cards | Pass |
| Deployment diagnostics run against checked-in real source files | **15/15** |
| Deployment diagnostics with all assets missing | **0/15** as expected |

This source-based execution is useful regression coverage but cannot prove
that every interaction works on every phone, browser or network.

## Run repeatable repository tests

```bash
node --test tests/test_ui_click_outcomes.mjs tests/test_deployment_diagnostics.mjs tests/test_neural.mjs tests/test_hybrid_nn.mjs tests/test_assessment.mjs tests/test_learning_graph.mjs
```

The new tests are committed. The full Node CLI test suite was **not** run
in the current connector-based environment; equivalent isolated DOM tests
were executed directly.

## Manual live-site acceptance checklist

On <https://a101shah.github.io/what_next/> after GitHub Pages updates:

1. In **Research Data Lab**, click **Run deployment check** and confirm
   **15/15** checks on the actual hosted origin.
2. Try all sidebar views, including the mobile menu at narrow screen sizes.
3. Click each of the five Learning Search suggestion chips, open a curated
   result and its original publisher link.
4. Add and remove a named technical skill; mark one roadmap milestone.
5. Complete a three-question skill check; verify that results persist
   after a page reload.
6. In Career Intelligence, enter complete data and run the hybrid NN;
   confirm predictions and evaluation labels appear.
7. Save a profile; export a resume; open the HTML file and print/save PDF.
8. Check any external sites or third-party search integration separately.
9. Inspect actual layouts at 360px, 768px, 1280px and 1920px widths, in
   Chrome and at least one mobile browser.

**No architecture or model weights were changed by this QA pass.**
