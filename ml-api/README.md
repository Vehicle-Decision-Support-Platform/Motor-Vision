# Trained risk model integration

Run `npm run dev` from the outer workspace. The Node server starts a persistent
Python inference worker on the first `POST /api/risk/assess` request. No separate
Streamlit server or Python HTTP port is needed. Manual assessments and reviewed
advertisement imports use this endpoint. Synthetic dashboard samples and JSON
batch imports retain the explicitly labelled JavaScript rule baseline.

Python defaults to `%USERPROFILE%/anaconda3/python.exe` on this machine. Override
it before starting Node if necessary:

```powershell
$env:RISK_PYTHON = 'C:\Users\MSII\anaconda3\python.exe'
npm run dev
```

The trained bundle was copied without retraining from the supplied research
project to `ai-models/component-3-risk/models/risk_bundle.joblib`.
The supplied `core.py` had been overwritten with notebook experiments. Its
original inference functions were recovered from `core.cpython-313.pyc` and
are preserved as `risk_runtime/core.pyc`. This is a temporary, Python 3.13-only
runtime dependency. Restore the original source when available; do not replace
it with the supplied notebook-export `core.py`. Loading this module and the
trusted local joblib bundle executes Python code.

Required packages are listed in `requirements.txt`. This machine's existing
Anaconda installation already has them. No package installation was performed.
The original feature engineering, model thresholds, SHAP/LIME explanations,
Logistic Regression comparison and escalation rules are reused.

Mapping: year → yom, mileage → mileage_km, price → listed_price_lkr,
engine text → numeric engine_cc (including cc/litre units), fuel → fuel_type,
description → description_text, photoCount → photo_count, listingAgeDays →
posted_date. Seller count defaults to 1; registration year and condition are
not collected by the current form and use original model defaults. These
assumptions appear in the model report. The model estimates its own market
reference; the legacy form's optional fairValue does not replace it.

Reports show model probability, final tier, SHAP, LIME and fidelity, engineered
features, market estimate, model fingerprint and assumptions. Results can be
exported and stored in browser history. Failures display an error; there is no
silent rule fallback. Training uses heuristic weak labels, so probabilities
must not be interpreted as verified fraud probabilities. Demo model-lab metrics
remain separate from the trained bundle and are not trained-model validation.

Validation: `npm test`, `npm run check`, and `node tests/integration/risk-model.test.cjs`.
The last command runs the real Python model, requires Python 3.13 and packages,
and closes its server and worker afterward.
