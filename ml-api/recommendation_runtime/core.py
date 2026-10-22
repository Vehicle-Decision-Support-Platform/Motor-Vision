
import numpy as np
import pandas as pd

COLUMNS = ['Make','Model','Year','Engine Fuel Type','Engine HP','Engine Cylinders','Transmission Type','Driven_Wheels','Number of Doors','Market Category','Vehicle Size','Vehicle Style']
NUMERIC = ['Year','Engine HP','Engine Cylinders','Number of Doors']
CATEGORICAL = [c for c in COLUMNS if c not in NUMERIC]
WEIGHTS = {'Make':0.08,'Model':0.06,'Year':0.10,'Engine Fuel Type':0.14,'Engine HP':0.08,'Engine Cylinders':0.05,'Transmission Type':0.14,'Driven_Wheels':0.08,'Number of Doors':0.04,'Market Category':0.06,'Vehicle Size':0.08,'Vehicle Style':0.09}
SCALES = {'Year':12.,'Engine HP':250.,'Engine Cylinders':6.,'Number of Doors':3.}

def load_data(path='data.csv'):
    df = pd.read_csv(path)
    missing = [c for c in COLUMNS if c not in df.columns]
    if missing: raise ValueError(f'Missing columns: {missing}')
    df = df[COLUMNS].copy()
    for c in NUMERIC: df[c] = pd.to_numeric(df[c], errors='coerce')
    for c in CATEGORICAL: df[c] = df[c].fillna('').astype(str).str.strip()
    return df

def pair_features(preferences, candidates):
    out = pd.DataFrame(index=candidates.index)
    for c in COLUMNS:
        v = preferences.get(c)
        if v is None or str(v).strip() in ('', 'Any'):
            out[c] = 0.5
        elif c in NUMERIC:
            value = pd.to_numeric(v, errors='coerce')
            values = pd.to_numeric(candidates[c], errors='coerce')
            out[c] = (1.0 - (values - value).abs()/SCALES[c]).clip(0,1).fillna(0.5)
        elif c == 'Market Category':
            requested = set(x.strip().lower() for x in str(v).split(',') if x.strip())
            out[c] = candidates[c].apply(lambda x: len(requested & set(t.strip().lower() for t in x.split(','))) / max(1,len(requested)) if x else 0.5)
        else:
            out[c] = np.where(candidates[c].eq(''), 0.5, candidates[c].str.casefold().eq(str(v).casefold()).astype(float))
    return out[COLUMNS].astype(float)

def synthetic_target(features):
    return sum(features[c]*w for c,w in WEIGHTS.items()).clip(0,1)

def make_training_pairs(df, n=40000, seed=42):
    rng = np.random.default_rng(seed)
    rows = []
    # Mix realistic partially matching profiles with random profiles.
    for _ in range(n//1000 + 1):
        size = min(1000, n-len(rows))
        if size <= 0: break
        pref_idx = rng.integers(0,len(df),size)
        cand_idx = np.where(rng.random(size)<0.35, pref_idx, rng.integers(0,len(df),size))
        p = df.iloc[pref_idx].reset_index(drop=True)
        v = df.iloc[cand_idx].reset_index(drop=True)
        f = pd.DataFrame(index=range(size))
        for c in COLUMNS:
            if c in NUMERIC:
                f[c] = (1-(p[c]-v[c]).abs()/SCALES[c]).clip(0,1).fillna(0.5)
            elif c == 'Market Category':
                f[c] = [len(set(str(a).lower().split(',')) & set(str(b).lower().split(',')))/max(1,len(set(str(a).lower().split(',')))) if a and b else 0.5 for a,b in zip(p[c],v[c])]
            else:
                f[c] = np.where(p[c].eq('')|v[c].eq(''),0.5,p[c].str.casefold().eq(v[c].str.casefold()).astype(float))
        rows.append(f)
    return pd.concat(rows,ignore_index=True)[COLUMNS]
