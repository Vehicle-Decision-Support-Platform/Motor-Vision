# Motor-Vision

## Trained risk model connection

Manual assessments and reviewed ad-link assessments now call the supplied trained
LightGBM bundle through the Node backend and a persistent Python worker. Reports
include SHAP, LIME and the Logistic Regression comparison. Start with `npm run dev`.
See [Python runtime and model integration](ml-api/README.md) for setup, recovered
Python 3.13 runtime requirements, input assumptions and verification commands.
The synthetic sample queue and JSON batch imports still use the rule baseline.
Earlier prototype descriptions below refer to that baseline unless stated otherwise.
AI-powered vehicle market intelligence and decision support platform for Sri Lanka's used-car market: price evaluation, feature recommendation, explainable risk assessment, and affordability insights.

## Research components

1. **Vehicle price evaluation** — compare a seller's asking price with an independent fair-value reference and explain the buyer-facing result.
2. **Feature-based recommendation** — a future independently maintained recommendation and explainability component.
3. **Used-vehicle risk assessment** — score transparent prototype risk signals and explain every contribution.
4. **Affordability and investment recommendation** — a future independently maintained loan, leasing, affordability, and investment component.

The current repository contains working browser prototypes for Components 1 and 3. Components 2 and 4, trained models, production data storage, and the Python inference service are intentionally not fabricated.

## Project structure

```text
Motor-Vision/
├── frontend/
│   ├── index.html
│   ├── css/                     # Existing styles, unchanged apart from paths
│   ├── js/                      # Existing UI, browser engines, and fixtures
│   ├── components/              # Component-specific expansion points
│   └── assets/                  # Images and icons
├── backend/
│   ├── server.js                # Node HTTP/static server and API entry point
│   ├── services/listing-import.js
│   ├── routes/ controllers/ middleware/ config/ utils/
├── ai-models/
│   ├── component-1-price/{models,training}/
│   ├── component-2-recommendation/{models,training}/
│   ├── component-3-risk/{models,training}/
│   └── component-4-affordability/{models,training}/
├── ml-api/{routers,services,schemas}/
├── datasets/{raw,processed}/
├── tests/{frontend,backend,integration}/
└── docs/
```

Directories reserved for future work are deliberately empty. No trained model, prediction, dataset, database, or placeholder endpoint is represented as implemented.


## Run the frontend

Requires Node.js 20 or newer. No dependency installation is needed.

```sh
npm install
npm start
```

`npm install` is optional at present because the project has no external Node dependencies; it is included as the conventional setup step. Open http://localhost:3000. The site opens on the Home page; the header links to each component, with the risk pages grouped under **Risk assessment** (a menu button replaces the links on narrow screens). Run `npm run check` for JavaScript syntax validation.

Both `npm run dev` and `npm start` also work from the outer workspace folder. Run `npm test` for the risk-engine and frontend smoke tests. No npm dependencies are required.

Use `npm run dev` during development: Node watch mode restarts the server when its code or imported backend modules change. Static HTML/CSS/JS is read on each request. `npm start` runs without watching. A server started before this change needs one restart to enable watch mode.

## Application boundaries and future ML integration

The browser loads static files from `frontend/` and calls the Node backend with same-origin HTTP requests. `backend/server.js` currently serves those allow-listed files and owns `POST /api/listings/preview`; advertisement retrieval stays server-side so browser code never performs it directly.

Future trained `.pkl` or `.joblib` artifacts belong in the corresponding `ai-models/component-*/models/` directory, with reproducible training code in its sibling `training/` directory. Raw and processed research data belong under `datasets/`; do not commit private, licensed, or oversized data without an explicit data-management decision.

When inference is implemented, the intended request flow is:

```text
Browser frontend → Node REST API → Python FastAPI ML service → versioned model artifact
                 ← validated JSON ← versioned prediction/explanation ←
```

The Node backend should remain the public application boundary and validate/authenticate requests. The future Python service should load component-specific artifacts, validate typed schemas, and return versioned predictions plus explanation metadata. Configure its internal URL with `ML_API_URL`; do not expose model files directly to the browser. `ml-api/main.py` and `ml-api/requirements.txt` are intentionally non-operational until a real inference contract and trained artifact exist.

## Authentication and password reset

Visitors can browse the public website without an account. Submitting forms, importing advertisements, running assessments or valuations, saving/comparing vehicles, and exporting results opens the sign-in dialog. Users can create an account, sign in, sign out, and request a one-time password-reset email.

Passwords are hashed with Node.js `scrypt`. The readable password is never stored. Sessions use signed, `HttpOnly`, `SameSite=Lax` cookies and are invalidated when the password changes. Local user records are stored in the ignored `backend/data/users.json` file; use a managed database before deploying multiple server instances or production workloads.

Create the local configuration without committing it:

```sh
cp .env.example .env
openssl rand -hex 32
```

Put the generated value in `SESSION_SECRET`. For Gmail reset messages, enable 2-Step Verification on the sender Google Account, create a 16-character App Password, and set these values in `.env`:

```dotenv
APP_URL=http://localhost:3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-address@gmail.com
SMTP_APP_PASSWORD=your-16-character-app-password
MAIL_FROM=your-address@gmail.com
```

Use the Google App Password—not the normal Gmail account password. `.env` and the user store are excluded by `.gitignore`.

## Individual component: IT23380400

The **Risk assessment** menu in the site header implements the **Explainable AI-Based Vehicle Risk Assessment** component described in `IT23380400.pdf`, especially sections 3.3, 4.2 and 5.1. Its pages open at `#risk`, `#assess`, `#risk-history` and `#model-lab`.

- Risk dashboard: review queue with search, risk-category filtering, risk/price sorting, risk score and LOW/MEDIUM/HIGH category.
- Explanation report: exact baseline point contributions, human-readable reasons, engineered features and verification checklist. Every displayed risk category is accompanied by a report.
- Assess a listing: structured vehicle details, description, photo count, listing age, fair-value input and optional cohort statistics. Load and edit a synthetic example, then assess it locally.
- Model evaluation: precision, recall, false-positive rate, missed-risk rate and confusion counts calculated on the current labeled collection. Unlabeled records are excluded. Undefined metrics display as unavailable. Initial labels are synthetic, not expert-adjudicated research results.
- Assessment history: up to 50 manual/import results stored in this browser with model, preprocessing and dataset versions. Original descriptions and seller contact fields are not included in history or risk-result exports.

## Assess a vehicle advertisement link

On the risk dashboard, use **Analyze an ad link** in the listing review queue. Paste an individual HTTPS ad from **Ikman** or **Riyasewana**, then select **Fetch ad details**. The server reads available vehicle fields and opens the assessment form for review. Add any missing required vehicle fields, then select **Assess listing risk**. **Cohort fair value is optional**: leave it blank if unknown, or enter an independent reference to include the price comparison. Imported records join the queue with the same rule-based score, reasons, features, checks and export as manual entries. Results/history preserve the source URL and import/review timestamps.

The asking price is never substituted for fair value. Mileage is read from the labeled mileage field, not warranty or fuel-economy claims. Unavailable fields stay blank; seller contact fields are excluded and recognized contact numbers/links are removed from imported descriptions. Review the description before submitting. No seller identity or advertisement claim is verified. ML remains disconnected.

`POST /api/listings/preview` accepts `{ "url": "https://ikman.lk/en/ad/..." }` and returns an unscored preview. Only supported advertisement paths are accepted. Redirects and DNS addresses are validated, request time/size/concurrency are bounded, and TLS verification remains enabled. Page scripts are not executed. If a site blocks access, removes the ad or changes its page structure, use manual entry. Other platforms, including Patpat, are not currently supported by link import.

After updating this feature, stop the old server with **Ctrl+C** and run **npm run dev** again, then refresh the browser. No dependencies or trained model are required. Tests include offline parsing fixtures, guarded URL fetching, API behavior and the import/review/assessment flow; they do not depend on live ads remaining online.

## Price component: IT23225138

The Price evaluation page follows the individual proposal's FR1-FR8 and Figures 1-3: vehicle input, independent fair-value reference, seller-price comparison, classification and buyer recommendation, with comparison of XGBoost, Random Forest and LightGBM.

Paste a supported advertisement URL and select **Fetch ad details**, or enter a vehicle manually. Inputs include make, model, year, mileage, fuel, transmission, engine capacity, body type, condition, location and seller price. Imported values remain editable. Ad labels such as Reconditioned are preserved as claims and are not converted to verified physical condition. Missing attributes are not invented. Make/model fields accept any vehicle; only demo mode is limited to the six synthetic reference models. A sample can be loaded explicitly.

The result shows the seller's price, fair-value reference, signed LKR difference, percentage difference, Underpriced / Fairly priced / Overpriced category and buyer recommendation. Difference is `sellerPrice - fairValue`; percentage is that difference divided by fair value. The tolerance is configurable from 0% to 50%, with inclusive fair-band boundaries. The default demo tolerance is 5% and is clearly marked unvalidated. The band is a classification tolerance, not a prediction/confidence interval. Changing inputs invalidates the displayed result.

Two price sources are kept distinct:

- **Demo formula:** synthetic reference prices adjusted for year, mileage and selected condition. Unrecognized/unsupplied condition labels use an explicitly neutral factor. Other vehicle attributes are recorded for model integration but do not change the demo estimate. No trained-model result or current market value is claimed. Demo results cannot be exported as a shared operational fair-value reference.
- **Supplied model outputs:** import actual external predictions and validation metrics in **Model comparison**. The interface does not train models or run their inference. It validates and compares a supplied report, then uses its selected model's vehicle-specific prediction. Metrics and split quality remain externally supplied claims, not independently verified research results.

The model view lists all three regressors with R², RMSE, MAE, prediction, model version and selection status. Values remain unavailable until a report is supplied. Selection uses lowest validation RMSE, then lower MAE, then higher R²; exact ties use model ID and are disclosed. Hold-out test metrics are not used for selection. This task implements the frontend only. Model training, dataset preparation and live prediction services are outside its scope.

### Model-results contract

An optional, collapsed browser-only import is available in Model comparison for previewing saved results. Fill the current vehicle form and download its template. A completed `price-model-bundle-1` response requires:

- LKR currency; vehicle features; dataset/preprocessing versions; validation split ID and sample size.
- One XGBoost, Random Forest and LightGBM entry, each with an actual model version, finite R²/RMSE/MAE and a positive predicted price. RMSE must not be below MAE. Explicit per-model dataset/split metadata must match the common declaration.
- A configurable classification threshold and supplied validation error-analysis evidence. Placeholder metadata is not accepted as completed research evidence.

Reports are validated atomically. Predictions are bound to the current vehicle features; editing those features requires new predictions. Seller-price edits do not invalidate the independent prediction, since asking price is excluded from feature matching. Files stay local to the browser. Unknown seller/contact properties are not accepted as price features.

`ValuationUI.getLatestResult()` returns an isolated snapshot using the `price-result-1` contract. JSON exports carry price comparison, classification, recommendation, threshold status/evidence, model/dataset/preprocessing versions and listing provenance. **Export shared listing** is enabled for supplied model outputs and includes a `fairValue` listing compatible with the existing risk JSON importer, plus the complete price result for recommendation/affordability consumers. No automatic lending decision or risk-adjusted advice is produced.

`frontend/js/price-engine.js` implements the reusable contracts, validation, feature derivation, comparison and demo formula. `frontend/js/valuation-ui.js` / `frontend/css/valuation.css` implement the price interface. Tests cover threshold boundaries, asking-price independence, all three model results, selection, malformed reports, vehicle binding, privacy, live-ad import shape, rendering and export handoff.

## Risk component requirement implementation

- FR1: local JSON import accepts a single record, an array or `{ "datasetVersion": "...", "listings": [...] }`. Operational shared-data ingestion is a future backend connection.
- FR2: computes price deviation, mileage/year, cohort price and mileage z-scores where statistics are supplied, completeness, photo count, listing age and description flags.
- FR3/FR4: deterministic baseline risk score/category with per-feature reasons and exact points.
- FR5: working rule-based baseline; proposed anomaly detectors and weakly supervised GBM are explicitly marked not connected.
- FR6: `RiskEngine.assess(listing)` and exported JSON provide a reusable risk result; `RiskUI.getResults()` returns the current collection's outputs. No HTTP scoring endpoint or production API is claimed.
- FR7: result/history exports carry dataset, model and preprocessing versions; evaluation exports include thresholds, labels and version information. Full training-dataset storage and experiment management require the research backend.

## Baseline behavior and limits

`frontend/js/risk-engine.js` contains the pure, testable prototype rules. Points are added and capped at 100: LOW is below 30, MEDIUM is 30-59 and HIGH is 60 or more. Price deviation alone contributes at most 25 points, so a low price by itself is insufficient for a medium or high category. This score is an **uncalibrated rule-point total**, not a fraud probability or trained AI result. Description matching is a lightweight baseline and can misread context.

Fair value is entered or imported from the price component, not predicted by this component. Reference year 2026 and preprocessing/model versions are recorded for reproducibility. Z-scores are contextual outputs; they are not scored again on top of price/mileage rules. Location and seller-type values do not affect points; missing fields can affect completeness. This does not establish measured fairness.

Without a fair-value reference, the baseline assesses the other signals and marks the result **partial**. Price deviation and price z-score are `null`, and the price reason has status `not_assessed`; the system never substitutes the asking price or claims it is near fair value. The score/category cover observed signals only. Results include `assessmentStatus`, `categoryScope`, `unassessedFeatures` and `scoreRange` (observed points through observed points + the maximum 25-point price contribution, capped at 100). Reports, queue badges and history identify partial assessments. Partial records are excluded from evaluation metrics. Adding a valid reference enables the price rule; invalid provided references are still rejected. Model/preprocessing versions are `rules-0.3.0` / `features-0.3.0`.

SHAP/LIME inference, calibrated models, explanation fidelity/stability, PR-AUC/ranking quality, expert adjudication, real-world validation, production access controls, bulk platform collection and risk-adjusted lending advice are not implemented. Their integration points and pending states are visible in the frontend. Scoring latency shown is local rule computation, not advertisement fetching or server inference latency.

`frontend/js/risk-data.js` holds six synthetic fixtures, including a normal listing, multiple-signal high-risk examples, an ordinary listing incorrectly flagged by the baseline, and a relocation bargain. Prices and labels are invented demonstrations. Do not treat these fixtures as listings from Ikman, Riyasewana or Patpat.

Source: `frontend/index.html`, `frontend/css/`, and `frontend/js/`. `backend/server.js` serves the local app and advertisement-preview API on loopback; `backend/services/listing-import.js` implements guarded server-side listing retrieval and parsing. SVG vehicle illustrations are original; Google Fonts have local fallbacks.
