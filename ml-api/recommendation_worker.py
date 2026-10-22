"""JSON-lines adapter for the supplied LightGBM feature-match model; no retraining."""
import contextlib
import hashlib
import json
from pathlib import Path
import sys
import time

# Library diagnostics must never enter the JSON protocol on stdout.
with contextlib.redirect_stdout(sys.stderr):
    import joblib
    import numpy as np
    import pandas as pd
    import shap
    from recommendation_runtime.core import COLUMNS, NUMERIC, load_data, pair_features, synthetic_target

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / 'ai-models/component-2-recommendation/models/lightgbm_relevance.joblib'
DATA_PATH = ROOT / 'datasets/processed/component-2-recommendation/vehicles.csv'
model = None
data = None
explainer = None
versions = None


def initialise():
    global model, data, explainer, versions
    if model is not None:
        return
    # Load trusted repository artifacts only, never a path from the client.
    loaded_data = load_data(DATA_PATH)
    loaded_model = joblib.load(MODEL_PATH)
    expected_names = [c.replace(' ', '_') for c in COLUMNS]
    if list(loaded_model.feature_name_) != expected_names:
        raise RuntimeError('Recommendation model feature schema does not match the supplied core.py.')
    loaded_explainer = shap.TreeExplainer(loaded_model)
    versions = {
        'modelVersion': 'lightgbm-relevance-' + hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()[:12],
        'datasetVersion': 'vehicle-attributes-' + hashlib.sha256(DATA_PATH.read_bytes()).hexdigest()[:12],
        'preprocessingVersion': 'supplied-pair-features-1',
        'trainingLabels': 'synthetic_weighted_feature_match',
    }
    data, model, explainer = loaded_data, loaded_model, loaded_explainer


def clean(value):
    if pd.isna(value):
        return None
    if isinstance(value, (np.integer, np.floating)):
        return value.item()
    return value


def options():
    fields = []
    for column in COLUMNS:
        values = sorted(data[column].dropna().unique().tolist())
        if column not in NUMERIC:
            values = [v for v in values if v]
        fields.append({'name': column, 'numeric': column in NUMERIC, 'values': [clean(v) for v in values]})
    return {
        **versions, 'fields': fields, 'rowCount': len(data),
        'uniqueVehicleCount': len(data.drop_duplicates()), 'maxTopN': 100,
        'modelsByMake': {make: sorted(rows['Model'].unique().tolist()) for make, rows in data.groupby('Make')},
    }


def validate(payload):
    if not isinstance(payload, dict) or set(payload) - {'preferences', 'topN', 'mode'}:
        raise ValueError('Send preferences, topN and mode only.')
    preferences = payload.get('preferences')
    if not isinstance(preferences, dict) or set(preferences) - set(COLUMNS):
        raise ValueError('Preferences must contain supported vehicle attributes only.')
    selected = {}
    for column in COLUMNS:
        value = preferences.get(column)
        if value is None or value == '' or value == 'Any':
            selected[column] = 'Any'
        elif column in NUMERIC:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not np.isfinite(value):
                raise ValueError(f'{column}: choose a valid numeric catalogue option.')
            if value not in set(data[column].dropna().unique()):
                raise ValueError(f'{column}: choose an available catalogue option.')
            selected[column] = value
        else:
            if not isinstance(value, str) or value not in set(data[column].unique()) or not value:
                raise ValueError(f'{column}: choose an available catalogue option.')
            selected[column] = value
    if all(v == 'Any' for v in selected.values()):
        raise ValueError('Select at least one preference before requesting recommendations.')
    top_n = payload.get('topN', 5)
    if isinstance(top_n, bool) or not isinstance(top_n, int) or not 1 <= top_n <= 100:
        raise ValueError('topN must be an integer between 1 and 100.')
    mode = payload.get('mode', 'model')
    if mode not in ('model', 'baseline'):
        raise ValueError('Choose model or baseline mode.')
    return selected, top_n, mode


def recommend(payload):
    started = time.perf_counter()
    preferences, top_n, mode = validate(payload)
    features = pair_features(preferences, data)
    raw_scores = np.asarray(model.predict(features) if mode == 'model' else synthetic_target(features), dtype=float)
    if not np.isfinite(raw_scores).all():
        raise RuntimeError('Recommendation model returned invalid scores.')
    scores = np.clip(raw_scores, 0, 1) * 100
    chosen, seen = [], set()
    # Preserve the original app's stable ranking and identical-record deduplication.
    for index in np.argsort(-scores, kind='stable'):
        key = tuple(str(v) for v in data.iloc[index].values)
        if key in seen:
            continue
        seen.add(key)
        chosen.append(int(index))
        if len(chosen) == top_n:
            break
    shap_values = np.asarray(explainer.shap_values(features.iloc[chosen])) if mode == 'model' else None
    base = float(np.asarray(explainer.expected_value).reshape(-1)[0]) if mode == 'model' else None
    results = []
    for rank, index in enumerate(chosen, 1):
        details = []
        matches, differences = [], []
        for offset, column in enumerate(COLUMNS):
            match = float(features.iloc[index][column])
            active = preferences[column] != 'Any'
            if active and match >= 0.8:
                matches.append(column)
            elif active and match < 0.5:
                differences.append(column)
            details.append({
                'feature': column, 'vehicleValue': clean(data.iloc[index][column]),
                'preference': preferences[column], 'selected': active, 'featureMatch': match,
                'shapContribution': float(shap_values[rank - 1][offset]) if shap_values is not None else None,
            })
        results.append({
            'id': f'catalogue-{index}', 'rank': rank,
            'vehicle': {c: clean(data.iloc[index][c]) for c in COLUMNS},
            'matchPercent': float(scores[index]), 'rawScore': float(raw_scores[index]),
            'shapBaseValue': base, 'matches': matches, 'differences': differences, 'explanation': details,
        })
    return {
        **versions, 'rankingVersion': versions['modelVersion'] if mode == 'model' else 'weighted-match-baseline-1',
        'mode': mode, 'preferences': preferences, 'requestedTopN': top_n, 'returnedCount': len(results),
        'candidateCount': len(data), 'latencyMs': round((time.perf_counter() - started) * 1000, 2),
        'scoreType': 'estimated_feature_match_percent', 'results': results,
        'limitations': [
            'Trained on synthetic matching labels, not real user relevance or interaction data.',
            'The catalogue is not verified live Sri Lankan inventory; prices, mileage and risk are not available.',
            'Collaborative filtering, price/risk re-ranking and real-user ranking evaluation are not implemented.',
        ],
    }


for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        with contextlib.redirect_stdout(sys.stderr):
            initialise()
            result = options() if request['action'] == 'options' else recommend(request['payload'])
        response = {'id': request['id'], 'result': result}
    except Exception as error:
        response = {'id': request.get('id'), 'error': str(error), 'status': 400 if isinstance(error, ValueError) else 503}
    print(json.dumps(response, allow_nan=False), flush=True)
