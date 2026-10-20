# Motor-Vision
AI-powered vehicle market intelligence and decision support platform for Sri Lanka's used-car market: price evaluation, feature recommendation, explainable risk assessment, and affordability insights.


## Run the frontend

Requires Node.js 20 or newer. No dependency installation is needed.

```sh
npm start
```

Open http://localhost:3000. Run `npm run check` for JavaScript syntax validation.

Both `npm run dev` and `npm start` also work from the outer workspace folder. Run `npm test` for the risk-engine and frontend smoke tests. No npm dependencies are required.

## Individual component: IT23380400

The default screen now implements the **Explainable AI-Based Vehicle Risk Assessment** component described in `IT23380400.pdf`, especially sections 3.3, 4.2 and 5.1. Other platform tools remain accessible from the second navigation group.

- Risk dashboard: review queue with search, risk-category filtering, risk/price sorting, risk score and LOW/MEDIUM/HIGH category.
- Explanation report: exact baseline point contributions, human-readable reasons, engineered features and verification checklist. Every displayed risk category is accompanied by a report.
- Assess a listing: structured vehicle details, description, photo count, listing age, fair-value input and optional cohort statistics. Load and edit a synthetic example, then assess it locally.
- Model evaluation: precision, recall, false-positive rate, missed-risk rate and confusion counts calculated on the current labeled collection. Unlabeled records are excluded. Undefined metrics display as unavailable. Initial labels are synthetic, not expert-adjudicated research results.
- Assessment history: up to 50 manual/import results stored in this browser with model, preprocessing and dataset versions. Original descriptions and seller contact fields are not included in history or risk-result exports.
- Data & integration: read local JSON files or paste versioned listing records; validate the entire batch before replacing the queue; export sample input, risk results, history and evaluation metadata.

## Requirement implementation

- FR1: local JSON import accepts a single record, an array or `{ "datasetVersion": "...", "listings": [...] }`. Operational shared-data ingestion is a future backend connection.
- FR2: computes price deviation, mileage/year, cohort price and mileage z-scores where statistics are supplied, completeness, photo count, listing age and description flags.
- FR3/FR4: deterministic baseline risk score/category with per-feature reasons and exact points.
- FR5: working rule-based baseline; proposed anomaly detectors and weakly supervised GBM are explicitly marked not connected.
- FR6: `RiskEngine.assess(listing)` and exported JSON provide a reusable risk result; `RiskUI.getResults()` returns the current collection's outputs. No HTTP scoring endpoint or production API is claimed.
- FR7: result/history exports carry dataset, model and preprocessing versions; evaluation exports include thresholds, labels and version information. Full training-dataset storage and experiment management require the research backend.

## Baseline behavior and limits

`risk-engine.js` contains the pure, testable prototype rules. Points are added and capped at 100: LOW is below 30, MEDIUM is 30-59 and HIGH is 60 or more. Price deviation alone contributes at most 25 points, so a low price by itself is insufficient for a medium or high category. This score is an **uncalibrated rule-point total**, not a fraud probability or trained AI result. Description matching is a lightweight baseline and can misread context.

Fair value is entered or imported from the price component, not predicted by this component. Reference year 2026 and preprocessing/model versions are recorded for reproducibility. Z-scores are contextual outputs; they are not scored again on top of price/mileage rules. Location and seller-type values do not affect points; missing fields can affect completeness. This does not establish measured fairness.

SHAP/LIME inference, calibrated models, explanation fidelity/stability, PR-AUC/ranking quality, expert adjudication, real-world validation, production access controls, live platform scraping and risk-adjusted lending advice are not implemented. Their integration points and pending states are visible in the frontend. Scoring latency shown is local rule computation, not server inference latency.

`risk-data.js` holds six synthetic fixtures, including a normal listing, multiple-signal high-risk examples, an ordinary listing incorrectly flagged by the baseline, and a relocation bargain. Prices and labels are invented demonstrations. Do not treat these fixtures as listings from Ikman, Riyasewana or Patpat.

Source: `index.html`, `style.css`, `risk.css`, `app.js`, `risk-engine.js`, `risk-data.js`, `risk-ui.js`. `server.js` is a local static preview. SVG vehicle illustrations are original; Google Fonts have local fallbacks.
