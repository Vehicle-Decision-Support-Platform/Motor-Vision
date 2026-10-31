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

# Load fixed datasets
train_df = pd.read_csv(ROOT / "train_data.csv")
test_df = pd.read_csv(ROOT / "test_data.csv")

# Load saved configuration
config = json.loads(
    (MODEL_DIR / "fusion_config.json").read_text()
)

meta = json.loads(
    (MODEL_DIR / "global_metadata.json").read_text()
)

best_name = config["best_global_model"]

filename = best_name.lower().replace(" ", "_") + ".joblib"

global_model = joblib.load(MODEL_DIR / filename)

features = meta["features"]

# Actual test asking prices
actual = pd.to_numeric(
    test_df["Price_LKR"],
    errors="coerce"
).to_numpy(dtype=float)

# Global predictions
global_predictions = np.maximum(
    global_model.predict(test_df[features]),
    0
)

# Similar estimator uses training data only
similar_estimator = SimilarVehicleEstimator(
    min_matches=config["min_matches"],
    top_k=20
).fit(train_df)

similar_prices = []
match_counts = []
reliabilities = []

print("Evaluating Independent Test Data...", flush=True)

for _, row in test_df.iterrows():

    output = similar_estimator.predict_one(
        row.to_dict()
    )

    similar_prices.append(
        np.nan if output["price"] is None
        else output["price"]
    )

    match_counts.append(output["matches"])
    reliabilities.append(output["reliability"])

similar_prices = np.array(
    similar_prices, dtype=float
)

match_counts = np.array(match_counts)

# Find comparable estimates
available = (
    np.isfinite(similar_prices) &
    (similar_prices > 0)
)

gap = np.full(len(test_df), np.inf)

gap[available] = (
    np.abs(
        global_predictions[available] -
        similar_prices[available]
    ) / similar_prices[available]
)

# Apply frozen validation rules
eligible = (
    available &
    (match_counts >= config["min_matches"]) &
    (gap <= config["max_relative_gap"])
)

disagreement = (
    available &
    (gap > config["max_relative_gap"])
)

# Final automatic fusion
final_predictions = global_predictions.copy()

w = config["global_weight"]

final_predictions[eligible] = (
    w * global_predictions[eligible] +
    (1 - w) * similar_prices[eligible]
)

# Performance metrics
def evaluate(y_true, y_pred):

    return {
        "MAE": float(
            mean_absolute_error(y_true, y_pred)
        ),
        "RMSE": float(
            np.sqrt(mean_squared_error(y_true, y_pred))
        ),
        "R2": float(
            r2_score(y_true, y_pred)
        )
    }

global_metrics = evaluate(
    actual, global_predictions
)

fusion_metrics = evaluate(
    actual, final_predictions
)

print("\n===== INDEPENDENT TEST RESULTS =====")
print("Test Records:", len(test_df))
print("Best Global Model:", best_name)

print("\nGLOBAL ML:")
print(global_metrics)

print("\nAUTOMATIC FUSION:")
print(fusion_metrics)

print("\n===== FUSION COVERAGE =====")
print("Similar Available:", int(available.sum()))
print("Fusion Eligible:", int(eligible.sum()))
print("Large Disagreements:", int(disagreement.sum()))
print("Global Fallback:", int((~eligible).sum()))

print("\n===== ERROR COMPARISON =====")

improvement = (
    global_metrics["MAE"] -
    fusion_metrics["MAE"]
)

print("MAE Improvement (LKR):", round(improvement, 2))

print(
    "MAE Improvement (%):",
    round(
        improvement / global_metrics["MAE"] * 100,
        2
    )
)

# Save individual test predictions
results = test_df[
    ["Brand", "Model", "Price_LKR"]
].copy()

results["Global Prediction"] = global_predictions
results["Similar Prediction"] = similar_prices
results["Final Prediction"] = final_predictions
results["Similar Matches"] = match_counts
results["Reliability"] = reliabilities
results["Fusion Applied"] = eligible
results["Large Disagreement"] = disagreement

results.to_csv(
    MODEL_DIR / "test_predictions.csv",
    index=False
)

# Save test metrics separately
report = {
    "best_global_model": best_name,
    "global_metrics": global_metrics,
    "fusion_metrics": fusion_metrics,
    "test_records": len(test_df),
    "fusion_eligible": int(eligible.sum()),
    "large_disagreements": int(disagreement.sum()),
    "mae_improvement_lkr": float(improvement),
    "test_evaluated": True
}

(MODEL_DIR / "test_report.json").write_text(
    json.dumps(report, indent=4)
)

print("\nTest Report Saved Successfully!")
print("STEP 11 COMPLETED")
