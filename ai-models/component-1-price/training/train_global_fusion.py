import json
import joblib
import numpy as np
import pandas as pd

from pathlib import Path

from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score
)

from xgboost import XGBRegressor
from lightgbm import LGBMRegressor

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "fusion_models"
MODEL_DIR.mkdir(exist_ok=True)

# Load the fixed Train and Validation splits
train_df = pd.read_csv(ROOT / "train_data.csv")
val_df = pd.read_csv(ROOT / "validation_data.csv")

features = [
    c for c in train_df.columns
    if c not in ["Price_LKR", "Town"]
]

numeric = [
    "YOM",
    "Engine (cc)",
    "Millage(KM)"
]

categorical = [
    c for c in features if c not in numeric
]

# Clean data types consistently
for df in [train_df, val_df]:
    for c in numeric:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    df["Price_LKR"] = pd.to_numeric(
        df["Price_LKR"], errors="coerce"
    )

    for c in categorical:
        df[c] = df[c].astype("string").fillna("Unknown").astype(str)

X_train = train_df[features]
y_train = train_df["Price_LKR"]

X_val = val_df[features]
y_val = val_df["Price_LKR"]

def make_preprocessor():
    return ColumnTransformer([
        (
            "numeric",
            SimpleImputer(strategy="median"),
            numeric
        ),
        (
            "categorical",
            Pipeline([
                (
                    "imputer",
                    SimpleImputer(strategy="most_frequent")
                ),
                (
                    "encoder",
                    OneHotEncoder(handle_unknown="ignore")
                )
            ]),
            categorical
        )
    ])

models = {
    "Random Forest": RandomForestRegressor(
        n_estimators=120,
        min_samples_leaf=2,
        n_jobs=-1,
        random_state=42
    ),

    "XGBoost": XGBRegressor(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        objective="reg:squarederror",
        n_jobs=-1,
        random_state=42
    ),

    "LightGBM": LGBMRegressor(
        n_estimators=350,
        learning_rate=0.05,
        num_leaves=31,
        verbosity=-1,
        random_state=42,
        n_jobs=-1
    )
}

metrics = {}

print("\n===== GLOBAL HYBRID TRAINING =====")
print("Training Records:", len(X_train))
print("Validation Records:", len(X_val))
print("Town Used:", "Town" in features)

for name, estimator in models.items():

    print(f"\nTraining {name}...", flush=True)

    pipeline = Pipeline([
        ("preprocessor", make_preprocessor()),
        ("model", estimator)
    ])

    pipeline.fit(X_train, y_train)

    predictions = np.maximum(
        pipeline.predict(X_val), 0
    )

    metrics[name] = {
        "MAE": float(mean_absolute_error(y_val, predictions)),
        "RMSE": float(
            np.sqrt(mean_squared_error(y_val, predictions))
        ),
        "R2": float(r2_score(y_val, predictions))
    }

    filename = name.lower().replace(" ", "_") + ".joblib"

    joblib.dump(pipeline, MODEL_DIR / filename)

    print(f"{name} Training Completed!")
    print(f"MAE: Rs. {metrics[name]['MAE']:,.2f}")
    print(f"R2: {metrics[name]['R2']:.4f}")

best_model = min(
    metrics,
    key=lambda name: metrics[name]["MAE"]
)

metadata = {
    "features": features,
    "numeric": numeric,
    "categorical": categorical,
    "best_global_model": best_model,
    "validation_metrics": metrics,
    "training_rows": len(X_train),
    "validation_rows": len(X_val),
    "town_used": False
}

(MODEL_DIR / "global_metadata.json").write_text(
    json.dumps(metadata, indent=4),
    encoding="utf-8"
)

print("\n===== FINAL MODEL COMPARISON =====")

results = pd.DataFrame(metrics).T
print(results.round(4).to_string())

print("\nBEST GLOBAL MODEL:", best_model)
print("Saved To:", MODEL_DIR)
print("\nSTEP 7 COMPLETED")
