"""Persistent JSON-lines inference worker; stdout is reserved for responses."""
import contextlib
import datetime
import hashlib
import json
import os
import re
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
if sys.version_info[:2] != (3, 13):
    raise RuntimeError('Recovered inference module requires Python 3.13. Set RISK_PYTHON to your Anaconda Python 3.13 executable.')
os.environ.setdefault('LOKY_MAX_CPU_COUNT', '4')
sys.path.insert(0, str(Path(__file__).parent / 'risk_runtime'))
with contextlib.redirect_stdout(sys.stderr):
    import core
    import joblib
    model_path = ROOT / 'ai-models/component-3-risk/models/risk_bundle.joblib'
    bundle = joblib.load(model_path)
MODEL_VERSION = 'lightgbm-' + hashlib.sha256(model_path.read_bytes()).hexdigest()[:12]

def assess(data):
    started = time.perf_counter()
    for key, low, high in [('year', 1900, datetime.date.today().year + 1), ('mileage', 0, 5000000), ('price', 1, 1e10)]:
        value = data.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
            raise ValueError('Invalid ' + key)
    for key in ['make', 'model']:
        if not isinstance(data.get(key), str) or not data[key].strip():
            raise ValueError('Missing ' + key)
    engine_text = str(data.get('engine', '')).replace(',', '')
    match = re.search(r'\d+(?:\.\d+)?', engine_text)
    engine = float(match.group()) if match else None
    if engine is not None and engine < 20 and re.search(r'\bl(?:itre|iter)?s?\b', engine_text, re.I):
        engine *= 1000
    listing = dict(make=data['make'], model=data['model'], yom=data['year'],
        mileage_km=data['mileage'], listed_price_lkr=data['price'],
        engine_cc=engine, fuel_type=data.get('fuel', ''),
        transmission=data.get('transmission', ''), condition=data.get('condition', ''),
        photo_count=data.get('photoCount'), description_text=data.get('description', ''),
        title=data['make'] + ' ' + data['model'], seller_listing_count=data.get('sellerListingCount', 1))
    if data.get('registrationYear'):
        listing['yor'] = data['registrationYear']
    if data.get('listingAgeDays') is not None:
        listing['posted_date'] = (datetime.date.today() - datetime.timedelta(days=float(data['listingAgeDays']))).isoformat()
    with contextlib.redirect_stdout(sys.stderr):
        result = core.score_listing(bundle, listing, with_lime=True)
    result.update(modelVersion=MODEL_VERSION, thresholds=bundle['thresholds'],
        assessedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        latencyMs=(time.perf_counter() - started) * 1000,
        inputDefaults={'sellerListingCount': listing['seller_listing_count'], 'registrationYear': data.get('registrationYear'), 'condition': listing['condition']},
        limitation='Trained on heuristic weak labels; probability is not verified fraud probability.')
    return result

for line in sys.stdin:
    try:
        request = json.loads(line)
        response = {'id': request['id'], 'result': assess(request['listing'])}
    except Exception as error:
        response = {'id': request.get('id') if 'request' in locals() else None, 'error': str(error)}
    print(json.dumps(response, allow_nan=False), flush=True)
