import json
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "fusion_models"

df = pd.read_csv(MODEL_DIR / "validation_predictions.csv")

meta = json.loads(
    (MODEL_DIR / "global_metadata.json").read_text()
)

best = meta["best_global_model"]

actual = df["Price_LKR"].to_numpy(dtype=float)
global_price = df[best].to_numpy(dtype=float)
similar = df["Similar Vehicle"].to_numpy(dtype=float)

matches = df["Similar Matches"].fillna(0).to_numpy()

# Relative difference between estimates
gap = np.full(len(df), np.inf)

available = np.isfinite(similar) & (similar > 0)

gap[available] = (
    np.abs(global_price[available] - similar[available])
    / np.maximum(similar[available], 1)
)

# Preliminary eligibility rules
eligible = (
    available &
    (matches >= 5) &
    (gap <= 0.25)
)

disagreement = available & (gap > 0.25)

def metrics(predicted):
    return {
        "MAE": float(mean_absolute_error(actual, predicted)),
        "RMSE": float(np.sqrt(mean_squared_error(actual, predicted))),
        "R2": float(r2_score(actual, predicted))
    }

baseline = metrics(global_price)

results = []

# Weight of global prediction, from 0 to 1
for w in np.linspace(0, 1, 21):

    final = global_price.copy()

    final[eligible] = (
        w * global_price[eligible]
        + (1 - w) * similar[eligible]
    )

    score = metrics(final)

    results.append({
        "Global_Weight": float(w),
        "Similar_Weight": float(1 - w),
        **score
    })

scores = pd.DataFrame(results).sort_values("MAE")

selected = scores.iloc[0]

best_weight = float(selected["Global_Weight"])

final_predictions = global_price.copy()

final_predictions[eligible] = (
    best_weight * global_price[eligible]
    + (1 - best_weight) * similar[eligible]
)

fusion_metrics = metrics(final_predictions)

# Save candidate configuration
config = {
    "best_global_model": best,
    "global_weight": best_weight,
    "similar_weight": 1 - best_weight,
    "min_matches": 5,
    "max_relative_gap": 0.25,
    "validation_baseline": baseline,
    "validation_fusion": fusion_metrics,
    "status": "VALIDATION_ONLY_NOT_TESTED"
}

(MODEL_DIR / "fusion_config.json").write_text(
    json.dumps(config, indent=4)
)

scores.to_csv(
    MODEL_DIR / "fusion_weight_results.csv",
    index=False
)

print("===== FUSION VALIDATION =====")
print("Best Global Model:", best)
print("Validation Records:", len(df))
print("Eligible for Fusion:", int(eligible.sum()))
print("Large Disagreements:", int(disagreement.sum()))
print("Global Fallback:", int((~eligible).sum()))

print("\n===== GLOBAL BASELINE =====")
print(baseline)

print("\n===== FUSION RESULT =====")
print(fusion_metrics)

print("\n===== SELECTED WEIGHTS =====")
print("Global Weight:", round(best_weight, 2))
print("Similar Weight:", round(1 - best_weight, 2))

print("\n===== TOP 5 WEIGHT COMBINATIONS =====")
print(scores.head(5).to_string(index=False))

improvement = baseline["MAE"] - fusion_metrics["MAE"]

print("\nMAE Improvement (LKR):", round(improvement, 2))
print("Configuration Saved: fusion_config.json")
print("\nSTEP 10 COMPLETED")
