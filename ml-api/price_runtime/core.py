import json
import joblib
import numpy as np
import pandas as pd

from pathlib import Path
from functools import lru_cache

from similar_vehicle import SimilarVehicleEstimator

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "fusion_models"


@lru_cache(maxsize=1)
def load_system():

    meta = json.loads(
        (MODEL_DIR / "global_metadata.json").read_text()
    )

    config = json.loads(
        (MODEL_DIR / "fusion_config.json").read_text()
    )

    models = {}

    for name in meta["validation_metrics"]:
        filename = name.lower().replace(" ", "_") + ".joblib"

        models[name] = joblib.load(
            MODEL_DIR / filename
        )

    train_df = pd.read_csv(
        ROOT / "train_data.csv"
    )

    similar_estimator = SimilarVehicleEstimator(
        min_matches=config["min_matches"],
        top_k=20
    ).fit(train_df)

    return meta, config, models, similar_estimator


def predict_vehicle(vehicle_details, seller_price):

    meta, config, models, similar_estimator = load_system()

    if seller_price <= 0:
        raise ValueError("Seller price must be positive.")

    # Price_LKR and Town are excluded from ML inputs
    features = meta["features"]

    missing = [
        f for f in features
        if f not in vehicle_details
    ]

    if missing:
        raise ValueError(f"Missing vehicle fields: {missing}")

    vehicle = {
        f: vehicle_details[f]
        for f in features
    }

    # Standardize text inputs
    for f in meta["categorical"]:
        vehicle[f] = str(vehicle[f]).strip().upper()

    for f in meta["numeric"]:
        vehicle[f] = float(vehicle[f])

    X = pd.DataFrame([vehicle], columns=features)

    # Predictions from all 3 global models
    all_predictions = {}

    for name, model in models.items():
        all_predictions[name] = max(
            0.0, float(model.predict(X)[0])
        )

    best_name = config["best_global_model"]
    global_price = all_predictions[best_name]

    # Similar vehicle estimation
    similar_result = similar_estimator.predict_one(vehicle)

    similar_price = similar_result["price"]
    matches = similar_result["matches"]

    final_price = global_price
    fusion_applied = False
    large_disagreement = False
    gap = None

    if similar_price is not None and similar_price > 0:

        gap = abs(global_price - similar_price) / similar_price

        if (
            matches >= config["min_matches"]
            and gap <= config["max_relative_gap"]
        ):
            w = config["global_weight"]

            final_price = (
                w * global_price
                + (1 - w) * similar_price
            )

            fusion_applied = True

        elif gap > config["max_relative_gap"]:
            large_disagreement = True

    # Compare seller asking price only after prediction
    difference = float(seller_price) - final_price

    percentage = (
        difference / final_price * 100
        if final_price > 0 else 0
    )

    # Seller price evaluation
    # Seller price is compared only AFTER prediction.
    # The 5% fair-price band is a preliminary business rule.

    gap_percent = abs(percentage)

    if gap_percent <= 5:
        status = "FAIR PRICE"

        if difference > 0:
            explanation = (
                "The seller's asking price is slightly above the "
                "estimated vehicle price, but the difference is small. "
                "This appears to be a reasonable asking price."
            )
        elif difference < 0:
            explanation = (
                "The seller's asking price is slightly below the "
                "estimated vehicle price. The price appears reasonable."
            )
        else:
            explanation = (
                "The seller's asking price matches the estimated "
                "vehicle price. This appears to be a reasonable price."
            )

    elif difference < 0:
        status = "POTENTIALLY GOOD DEAL"
        explanation = (
            "The seller's asking price is below the estimated vehicle "
            "price. You may be able to purchase this vehicle at a "
            "favorable price. Check its condition and documents "
            "before making a decision."
        )

    else:
        status = "POTENTIALLY OVERPRICED"
        explanation = (
            "The seller's asking price is significantly higher than "
            "the estimated vehicle price. Consider negotiating or "
            "comparing other vehicles before purchasing."
        )

    # Keep uncertainty independent of the seller price evaluation.
    if large_disagreement:
        explanation += (
            " This estimate has higher uncertainty, so the price "
            "assessment should be treated cautiously."
        )

    return {
        "final_price": float(final_price),
        "seller_price": float(seller_price),
        "difference": float(difference),
        "difference_percentage": float(percentage),
        "status": status,
        "explanation": explanation,
        "confidence_warning": large_disagreement,
        "best_global_model": best_name,
        "global_price": float(global_price),
        "similar_price": similar_price,
        "similar_matches": int(matches),
        "similar_reliability": similar_result["reliability"],
        "fusion_applied": fusion_applied,
        "relative_gap": gap,
        "all_model_predictions": all_predictions
    }
