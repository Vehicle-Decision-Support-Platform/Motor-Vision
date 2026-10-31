"""Persistent JSON-lines price inference worker; stdout is reserved for responses.

Runs the original vehicle_hybrid_system code (price_runtime/core.py) unchanged, so the
website gives the same estimate as the Streamlit app for the same inputs.
"""
import contextlib
import json
import math
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / 'ai-models/component-1-price/models'
os.environ.setdefault('LOKY_MAX_CPU_COUNT', '4')
sys.path.insert(0, str(Path(__file__).parent / 'price_runtime'))
with contextlib.redirect_stdout(sys.stderr):
    import pandas as pd
    import core
    # core.py reads ROOT/train_data.csv and MODEL_DIR/*; both live in the component's models folder.
    core.ROOT = MODEL_DIR
    core.MODEL_DIR = MODEL_DIR
    meta, config, models, _ = core.load_system()
    test_report = json.loads((MODEL_DIR / 'test_report.json').read_text())

# Field names sent by the website mapped to the trained feature names.
FIELDS = {'make': 'Brand', 'model': 'Model', 'year': 'YOM', 'engine': 'Engine (cc)', 'transmission': 'Gear',
          'fuel': 'Fuel Type', 'mileage': 'Millage(KM)', 'condition': 'Condition', 'bodyType': 'Vehicle Type', 'colour': 'Colour'}
MODEL_IDS = {'Random Forest': 'random_forest', 'XGBoost': 'xgboost', 'LightGBM': 'lightgbm'}


def options():
    """Dropdown values built exactly as app.py builds them from Price_Prediction_Cleaned.csv."""
    data = pd.read_csv(MODEL_DIR / 'Price_Prediction_Cleaned.csv')
    data.columns = data.columns.str.strip()
    upper = lambda column: data[column].astype('string').fillna('Unknown').str.strip().str.upper()
    categories = {feature: sorted(upper(feature).unique().tolist()) for feature in meta['categorical']}
    models_by_brand = pd.DataFrame({'Brand': upper('Brand'), 'Model': upper('Model')}).groupby('Brand')['Model'].apply(lambda s: sorted(s.unique().tolist())).to_dict()
    return {'categories': categories, 'modelsByBrand': models_by_brand, 'features': meta['features'],
            'defaults': {'YOM': 2018, 'Engine (cc)': 1500, 'Millage(KM)': 75000}, 'records': len(data), 'trainingRows': meta['training_rows']}


def predict(data):
    missing = [key for key in FIELDS if data.get(key) in (None, '')]
    if missing:
        raise ValueError('Missing vehicle fields: ' + ', '.join(missing))
    for key, low, high in (('year', 1950, 2030), ('engine', 1, 10000), ('mileage', 0, 2000000), ('price', 1, 1e10)):
        value = data.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
            raise ValueError('Invalid ' + key)
    vehicle = {feature: data[key] for key, feature in FIELDS.items()}
    with contextlib.redirect_stdout(sys.stderr):
        result = core.predict_vehicle(vehicle_details=vehicle, seller_price=float(data['price']))
    best = result['best_global_model']
    result['models'] = [{'id': MODEL_IDS[name], 'name': name, 'modelVersion': MODEL_IDS[name], 'predictedPrice': price,
                         'metrics': {'r2': meta['validation_metrics'][name]['R2'], 'rmse': meta['validation_metrics'][name]['RMSE'], 'mae': meta['validation_metrics'][name]['MAE']}}
                        for name, price in result['all_model_predictions'].items()]
    result.update(bestModelId=MODEL_IDS[best], globalWeight=config['global_weight'], validationRows=meta['validation_rows'],
                  testMetrics=test_report.get('fusion_metrics') if result['fusion_applied'] else test_report.get('global_metrics'))
    return {k: (None if isinstance(v, float) and not math.isfinite(v) else v) for k, v in result.items()}


for line in sys.stdin:
    request = None
    try:
        request = json.loads(line)
        result = options() if request.get('action') == 'options' else predict(request['listing'])
        response = {'id': request['id'], 'result': result}
    except Exception as error:
        response = {'id': request.get('id') if isinstance(request, dict) else None, 'error': str(error)}
    print(json.dumps(response, allow_nan=False), flush=True)
