# Hybrid Vehicle Price Advisor

One command trains Random Forest, XGBoost and LightGBM on the same train/test split. The app predicts with all three and displays the model with the lowest held-out MAE, then compares it with the seller's asking price.

## Setup

```bash
source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

Trained models are already in `fusion_models/`. To retrain, run in order:

```bash
python train_global_fusion.py
python validate_estimators.py
python tune_fusion.py
python test_fusion.py
```

Old files that the app no longer uses are kept in `unused_files/`.

`Price_LKR` in CSV is the training target; the asking price is a separate frontend input. The input `Unnamed: 0` is excluded. No model receives seller asking price as a predictor.

Model performance is measured with MAE, RMSE and R². Regression does not have a single meaningful classification-style accuracy percentage. The threshold used to label asking prices is based on observed holdout errors. For deployment, validate on a separate newer dataset and retrain periodically; used-car prices change with time.
