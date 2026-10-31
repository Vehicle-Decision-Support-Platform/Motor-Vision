import numpy as np
import pandas as pd


class SimilarVehicleEstimator:

    def __init__(self, min_matches=5, top_k=20):
        self.min_matches = min_matches
        self.top_k = top_k
        self.reference = None

    def fit(self, data):
        self.reference = data.copy()

        for col in [
            "Brand", "Model", "Gear",
            "Fuel Type", "Condition", "Vehicle Type"
        ]:
            self.reference[col] = (
                self.reference[col]
                .astype(str)
                .str.strip()
                .str.upper()
            )

        for col in [
            "YOM", "Engine (cc)",
            "Millage(KM)", "Price_LKR"
        ]:
            self.reference[col] = pd.to_numeric(
                self.reference[col],
                errors="coerce"
            )

        self.reference = self.reference.dropna(
            subset=[
                "Brand", "Model", "YOM",
                "Engine (cc)", "Millage(KM)", "Price_LKR"
            ]
        )

        self.reference = self.reference[
            self.reference["Price_LKR"] > 0
        ].copy()

        return self

    def predict_one(self, vehicle):

        brand = str(vehicle["Brand"]).strip().upper()
        model = str(vehicle["Model"]).strip().upper()

        matches = self.reference[
            (self.reference["Brand"] == brand) &
            (self.reference["Model"] == model)
        ].copy()

        total_matches = len(matches)

        if total_matches == 0:
            return {
                "price": None,
                "matches": 0,
                "reliability": "UNAVAILABLE",
                "reason": "No exact Brand and Model matches"
            }

        year = float(vehicle["YOM"])
        engine = float(vehicle["Engine (cc)"])
        mileage = float(vehicle["Millage(KM)"])

        # Numeric similarity distances
        year_distance = (
            abs(matches["YOM"] - year) / 5.0
        )

        engine_distance = (
            abs(matches["Engine (cc)"] - engine) /
            max(engine, 500)
        )

        mileage_distance = (
            abs(matches["Millage(KM)"] - mileage) /
            max(mileage, 30000)
        )

        # Weighted distance score
        distance = (
            0.45 * year_distance +
            0.20 * engine_distance +
            0.35 * mileage_distance
        )

        # Add categorical mismatch penalties
        for col, penalty in [
            ("Gear", 0.20),
            ("Fuel Type", 0.25),
            ("Condition", 0.30),
            ("Vehicle Type", 0.20)
        ]:
            if col in vehicle:
                value = str(vehicle[col]).strip().upper()

                distance += (
                    matches[col] != value
                ).astype(float) * penalty

        matches["distance"] = distance

        # Select nearest comparable vehicles
        nearest = matches.nsmallest(
            self.top_k,
            "distance"
        ).copy()

        # Similarity-based weights
        weights = 1.0 / (
            1.0 + nearest["distance"].to_numpy()
        ) ** 2

        prices = nearest["Price_LKR"].to_numpy()

        # Weighted median for outlier resistance
        order = np.argsort(prices)
        sorted_prices = prices[order]
        sorted_weights = weights[order]

        cumulative = np.cumsum(sorted_weights)

        index = np.searchsorted(
            cumulative,
            cumulative[-1] / 2
        )

        estimated_price = float(
            sorted_prices[index]
        )

        if total_matches < self.min_matches:
            reliability = "LOW"
        elif total_matches < 20:
            reliability = "MODERATE"
        else:
            reliability = "HIGH"

        return {
            "price": estimated_price,
            "matches": total_matches,
            "neighbors_used": len(nearest),
            "reliability": reliability,
            "median_distance": float(
                nearest["distance"].median()
            )
        }
