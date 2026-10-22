# Component 02 — IT23361386

The supplied `lightgbm_relevance.joblib` is connected to the existing Motor Vision
website at `/#recommendations`. The artifact and 12-column CSV were copied without
retraining or alteration. `core.py` is preserved in the inference runtime and
training directory. The supplied training script only has its input/output paths
adapted to this repository; it is not run during startup or inference.

## Run

Use `npm run dev`, sign in through the existing account UI, and open
**Recommendations**. No Streamlit server or separate Python HTTP server is needed.
The Node backend starts one persistent Python worker lazily and limits its queue
to four requests. A failed model never falls back to invented results.

Python defaults to `%USERPROFILE%/anaconda3/python.exe` if present, otherwise
`python`. Override `RECOMMENDATION_PYTHON` in `.env` with a Python executable that
has the packages in `ml-api/recommendation-requirements.txt`. The supplied source
environment used pandas 2.3.3, LightGBM 4.7.0 and SHAP 0.54.1. Streamlit is not
required for this integrated UI. The existing risk worker retains its separate
`RISK_PYTHON` setting and requirements.

## Request and result contract

`GET /api/recommendations/options` supplies available values for all 12 attributes,
models grouped by make, catalogue counts and fingerprint-based versions. This
metadata is public. `POST /api/recommendations` requires an authenticated session,
same-origin local requests and JSON, for example:

```json
{
  "preferences": {"Make": "Toyota", "Transmission Type": "AUTOMATIC"},
  "topN": 5,
  "mode": "model"
}
```

Other attributes may be omitted, null, empty or `Any`. At least one stated
preference is required. Numeric preferences must be numeric catalogue options;
unknown attributes, unsupported values, noninteger
Top-N and values outside 1–100 are rejected. Preferences are **soft matches**, not
hard filters. `mode: "baseline"` uses the original `synthetic_target` weighted
matching rule, not a fabricated popularity model.

The model path preserves `pair_features`, prediction clipping, stable sorting,
exact-record deduplication and TreeExplainer from the supplied app. Results include
all vehicle values, matches and differences, every feature-match input and SHAP
contribution, raw score, SHAP base, clipped match percent, latency and versions.
SHAP explains the **raw** score; base plus contributions reproduces it. An `Any`
feature is encoded as 0.5 and may still have a nonzero SHAP influence. Baseline
results carry no SHAP attribution. Model/dataset versions are SHA-256 prefixes.

The UI uses exactly the original 12 field labels/order and independent CSV-derived
options, with Any as the default. Find Vehicles opens the original-style Top-N
dialog (any integer 1?100), then runs the trained model. There is no baseline
selector, export control or additional preference field in the website form.
The UI resets stale results when inputs change, supports request cancellation,
and displays recoverable errors.
`RecommendationUI.getLatestResult()` returns an isolated snapshot for future shared
UI consumers. Preferences and results remain in page memory; this integration
does not persist interaction histories or send them to third-party services.

## Proposal mapping and limits

The PDF is the design context, not evidence that every proposed research feature
already exists. The implemented scope follows the supplied trained model:

| Proposal requirement | Current integration |
| --- | --- |
| FR1: shared listings, preferences and interactions | Supplied static attribute CSV and explicit form preferences; shared ingestion and interactions pending |
| FR2: item features and user profiles | Original 12-attribute pair-feature pipeline and request-scoped preference profile |
| FR3: ranked Top-N | Actual trained LightGBM ranking, up to 100 distinct records |
| FR4: cold-start onboarding | Explicit preferences without browsing history; cold-start quality unvalidated |
| FR5: baseline | Original weighted rule baseline retained in the research API only; absent from the form |
| FR6: price/risk re-ranking and interface | Versioned API/UI result contract; price/risk re-ranking pending |
| FR7: reproducibility | Copied artifact/source/data and content fingerprints in every result |

The supplied model learns **synthetic weighted feature-match labels**. Its scores
are not preference probabilities or real-user recommendation accuracy. The CSV
contains 11,914 rows and 6,420 distinct attribute records, not verified live Sri
Lankan inventory. There is no price, mileage, listing identifier, availability,
budget, user interaction or risk field. Therefore no automatic joining to the
platform's illustrative listings, live-inventory claim, collaborative/hybrid
learning, affordability filtering or price/risk re-ranking is performed.

Precision@K, Recall@K, NDCG/MAP, coverage, diversity and cold-start quality need
appropriate observed relevance data and an evaluation protocol; no invented
metrics or training accuracy are displayed. The latency shown measures this
worker's feature/ranking/explanation request, excluding first-load setup, network
latency and authentication.

## Verification

- `npm run test:recommendations`: actual Python artifact through authenticated
  HTTP requests, ranked results, SHAP additivity, baseline, invalid inputs,
  method/origin/content-type guards and static assets. Requires configured Python.
- `npm run test:recommendation-ui`: UI form/API workflow, independent dataset selections,
  Top-N dialog, invalidation, errors and direct-route integration.
- `npm run test:about`: existing About route regression check.
- `npm run check`: JavaScript syntax checks, including new UI and adapter.

Browser QA also passed in installed Chrome using an isolated test session and the
actual Python model: preference submission, independent dataset choices and a Top-N dialog,
12-feature SHAP details, input invalidation and anonymous
sign-in gating. No document overflow was found at 360, 375, 768, 1024, 1440, 1490
and 1920 pixels. Desktop/mobile/result screenshots were saved under ignored
`.tmp/` during verification. No real user account or database record was created.

The main `npm test` has pre-existing route/auth expectation failures and references
missing test files. These unrelated tests are not changed by this component.
