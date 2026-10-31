import json
import joblib
import numpy as np
import pandas as pd

from pathlib import Path
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score
)

from similar_vehicle import SimilarVehicleEstimator

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "fusion_models"

# Load datasets
train_df = pd.read_csv(ROOT / "train_data.csv")
val_df = pd.read_csv(ROOT / "validation_data.csv")

# Load metadata
meta = json.loads(
    (MODEL_DIR / "global_metadata.json").read_text()
)

features = meta["features"]
y_val = pd.to_numeric(
    val_df["Price_LKR"], errors="coerce"
).to_numpy()

# Load global models
models = {}

for name in meta["validation_metrics"]:
    filename = name.lower().replace(" ", "_") + ".joblib"
    models[name] = joblib.load(MODEL_DIR / filename)

# Initialize comparable estimator on TRAINING data only
similar_estimator = SimilarVehicleEstimator(
    min_matches=5,
    top_k=20
).fit(train_df)

# Collect predictions
results = val_df[
    ["Brand", "Model", "Price_LKR"]
].copy().reset_index(drop=True)

for name, model in models.items():
    predictions = np.maximum(
        model.predict(val_df[features]), 0
    )
    results[name] = predictions

similar_prices = []
match_counts = []
reliabilities = []

print("Evaluating Similar Vehicle Estimator...", flush=True)

for _, row in val_df.iterrows():
    output = similar_estimator.predict_one(
        row.to_dict()
    )

    similar_prices.append(output["price"])
    match_counts.append(output["matches"])
    reliabilities.append(output["reliability"])

results["Similar Vehicle"] = similar_prices
results["Similar Matches"] = match_counts
results["Reliability"] = reliabilities

# Evaluation function
def evaluate(actual, predicted):
    return {
        "MAE": float(mean_absolute_error(actual, predicted)),
        "RMSE": float(
            np.sqrt(mean_squared_error(actual, predicted))
        ),
        "R2": float(r2_score(actual, predicted))
    }

print("\n===== FULL VALIDATION RESULTS =====")

for name in models:
    m = evaluate(y_val, results[name].to_numpy())
    print(
        f"{name}: MAE={m['MAE']:,.0f}, "
        f"RMSE={m['RMSE']:,.0f}, R2={m['R2']:.4f}"
    )

# Comparable model coverage
available = results["Similar Vehicle"].notna()

print("\n===== SIMILAR VEHICLE COVERAGE =====")
print("Validation Records:", len(results))
print("Available Estimates:", int(available.sum()))
print("Unavailable Estimates:", int((~available).sum()))
print("Coverage:", f"{available.mean() * 100:.2f}%")

if available.sum() >= 2:
    actual_subset = results.loc[available, "Price_LKR"]
    similar_subset = results.loc[available, "Similar Vehicle"]

    print("\n===== MATCHED SUBSET PERFORMANCE =====")

    sim_metrics = evaluate(actual_subset, similar_subset)

    print(
        "Similar Vehicle:",
        sim_metrics
    )

    for name in models:
        global_metrics = evaluate(
            actual_subset,
            results.loc[available, name]
        )
        print(name + ":", global_metrics)

    print("\n===== RELIABILITY COUNTS =====")
    print(results["Reliability"].value_counts())

# Save validation predictions for fusion tuning
output_path = MODEL_DIR / "validation_predictions.csv"
results.to_csv(output_path, index=False)

print("\nSaved:", output_path)
print("STEP 9 COMPLETED")
