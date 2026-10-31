# Explainable AI-Based Vehicle Risk Assessment (Component 3)

## 1. About the Project

Motor Vision is a used-vehicle decision-support platform for Sri Lanka, developed as part of a research project. Component 3 assesses how risky a used-vehicle advertisement looks and explains why. It combines a web frontend, a Node.js backend API, a Python inference worker, trained machine-learning models, and SHAP/LIME explanations.

### Main Features

#### 1. Listing Risk Assessment

Accepts a vehicle's details entered manually, or an advertisement link imported from ikman.lk or riyasewana.com and reviewed by the user before scoring.

Returns a risk probability and a final risk level: Low, Medium, or High.

Lists the red flags found in the advertisement, such as urgent-sale wording, missing ownership or document information, very few photos, or a price far below the market.

Technical Implementation: Uses a LightGBM classifier trained on 20 engineered features. The model's probability sets the risk tier: Low below 0.15, Medium from 0.15 to below 0.50, and High from 0.50. A listing rated Low that has two or more red flags is raised to Medium. A Logistic Regression model scores the same listing as an explainable baseline for comparison. The 20 features fall into four groups:

- Price and mileage: `price_dev_pct`, `mileage_dev_pct`, `log_price`, `mileage_km`, `mileage_per_year`
- Vehicle: `vehicle_age`, `engine_cc`, `reg_gap_years`, `is_reconditioned`, `is_manual`, `fuel_hybrid`, `fuel_diesel`
- Listing quality and wording: `listing_completeness`, `listing_age_days`, `photo_count`, `desc_length`, `flag_urgency`, `docs_disclosed`, `field_inconsistencies`
- Seller: `seller_listing_count`

#### 2. Market Price Reference

Estimates a fair market price and a typical mileage for the vehicle being assessed.

Shows how far the asking price and the mileage deviate from those estimates.

Technical Implementation: Two regression pipelines are stored in the model bundle, one for fair price and one for expected mileage. On the training data the price model reached R² 0.908 (MAPE 13.7%) and the mileage model R² 0.896. Their outputs become the `price_dev_pct` and `mileage_dev_pct` features. The model estimates its own market reference; the optional fair-value field in the older form does not replace it.

#### 3. Explainable Reasons (SHAP and LIME)

Explains each result in plain language, separating the reasons that raise the risk from the reasons that lower it.

Shows the engineered features, the market estimate, the model fingerprint, and the assumptions made for any missing inputs.

Technical Implementation: SHAP TreeExplainer measures how much each feature pushed the LightGBM probability up or down, and the contributions are converted into readable sentences. LIME fits a local surrogate model around the same listing and returns rules such as `price_dev_pct <= -10.40`, together with a fidelity score so the surrogate's reliability can be judged. SHAP is the primary explanation and LIME is a cross-check.

#### 4. Assessment History and Export

Saves completed assessments in the browser so they can be reviewed later.

Allows a result to be exported.

Technical Implementation: Results are stored in the browser's local storage on the user's own device. They are not sent to a database.

## 2. Technologies Used

### Frontend
- HTML
- CSS
- JavaScript (no framework)

### Backend
- Node.js 20 or newer
- Node built-in HTTP server
- dotenv

### Machine Learning and Data Processing
- Python 3.13
- LightGBM
- scikit-learn (Logistic Regression and the regression pipelines)
- SHAP
- LIME
- Pandas
- NumPy
- Joblib

The backend dependencies are defined in `backend/package.json` and the website dependencies in `frontend/package.json`. The Python inference dependencies are defined in `ml-api/requirements.txt`.

## 3. Software Requirements

Install the following software before running the application:

1. **Python 3.13** — required. The recovered scoring module is Python 3.13 bytecode, so other Python versions cannot load it. Anaconda is recommended.
2. **Node.js 20 or newer** — required to run the backend, the website, and npm.
3. **Visual Studio Code** — recommended for running the project.
4. An internet connection — required to download dependencies during installation.

### Check the Installed Versions

Open the VS Code terminal and run:

```powershell
node --version
npm --version
& "$env:USERPROFILE\anaconda3\python.exe" --version
```

If you use a different Python 3.13 installation, check that one instead. If these commands do not work, install the required software and restart VS Code.

## 4. Installing and Running the Application

The application runs from the project root, `Motor-Vision`, using one command:

- **Website server:** serves the frontend on port 3000 and forwards every `/api/*` request to the backend.
- **Backend API:** runs on port 4000, validates requests, and starts the Python inference worker when the first risk assessment is requested.

### Step 1: Open the Project

Open the `Motor-Vision` folder in Visual Studio Code.

You should see the `backend`, `frontend`, `ai-models`, `ml-api`, `scripts`, and `tests` folders.

### Step 2: Set Up the Python Environment

Tell the backend which Python to use. By default it uses `%USERPROFILE%\anaconda3\python.exe` when that file exists. Set `RISK_PYTHON` if your Python 3.13 is somewhere else:

```powershell
$env:RISK_PYTHON = "C:\Users\<you>\anaconda3\python.exe"
```

Install the Python packages if they are not already present:

```powershell
& $env:RISK_PYTHON -m pip install -r ml-api/requirements.txt
```

### Step 3: Configure the Environment

The project includes an example configuration file named `.env.example`.

If a `.env` file does not already exist, create one by running this in the project root:

```powershell
Copy-Item .env.example .env
```

If `.env` already exists, keep it rather than overwriting it.

The risk assessment itself does not need a database. `DATABASE_URL` is only for user accounts and can stay blank. If the API reports `querySrv ECONNREFUSED` for a `mongodb+srv://` URL, add `DNS_SERVERS=8.8.8.8,1.1.1.1` to `.env`.

### Step 4: Install the Node Packages

Run these from the project root:

```powershell
npm --prefix backend install
npm --prefix frontend install
```

### Step 5: Start the Application

Run:

```powershell
npm run dev
```

Wait for the terminal to print both addresses:

**Website:** http://localhost:3000

**API health check:** http://localhost:4000/api/health

The Python worker does not start until the first risk assessment, so the first result takes longer while the model, SHAP, and LIME are loaded. Later assessments reuse the same worker.

**Important:** Keep the terminal open while using the application. Press **Ctrl+C** to stop both servers.

### Step 6: Use the Application

Once the application is running:

1. Open http://localhost:3000 in your browser.
2. Open the **Risk assessment** menu.
3. Use **Assess a listing** to enter vehicle details manually or to import an ikman.lk or riyasewana.com ad link and review the imported details.
4. Read the risk level, red flags, SHAP and LIME reasons, and market estimate in the report.
5. Open **Assessment history** to review saved results.

If the page loads but an assessment fails, read the error message under the form and check the terminal where `npm run dev` is running.

### Step 7: Verify the Model Connection

With the application stopped, run:

```powershell
npm run check
npm run test:risk-model
```

The model test starts the real Python worker, scores sample listings, checks the engine units, the price sensitivity, the SHAP and LIME output, the input validation, and the origin guards, and then shuts the worker down.

## 5. Required Model Files

The risk assessment depends on the following files being present at these paths. You normally do not need to retrain the model every time you start the application.

| File | Purpose |
|---|---|
| `ai-models/component-3-risk/models/risk_bundle.joblib` | The trained bundle: LightGBM, Logistic Regression, the fair-price and fair-mileage regressors, risk thresholds, the training matrix used by LIME, and the evaluation metrics |
| `ml-api/risk_worker.py` | A persistent Python worker that loads the bundle once and answers one JSON request per line |
| `ml-api/risk_runtime/core.pyc` | Feature engineering, fair-value estimation, SHAP/LIME helpers, and risk scoring (Python 3.13 bytecode) |
| `backend/services/risk-model.js` | Starts the worker, queues requests, and applies the 90-second timeout |

The bundle's fingerprint is reported with every result as `modelVersion`. It is `lightgbm-` followed by the first 12 characters of the file's SHA-256 hash, so a changed bundle is easy to spot.

### Common Problems

- **Could not start Python model** — the backend could not find Python. Set `RISK_PYTHON` to the full path of Python 3.13 and restart.
- **Recovered inference module requires Python 3.13** — the Python in use is a different version. Point `RISK_PYTHON` at Python 3.13.
- **Python model stopped** — the worker crashed. Read the error printed in the `npm run dev` terminal.
- **Model is busy** — four assessments are already running. Wait a moment and retry.

## 6. Model Training and Evaluation

The bundle was trained on a dataset of 546 Sri Lankan vehicle listings with 31 columns. The target is `Weak Label`, and 68 listings (12.5%) are labelled risky. `Weak Label Confidence` is constant, so it is excluded from the inputs to avoid label leakage.

Evaluation used 5-fold cross-validation grouped by seller, repeated with 3 random seeds, and scored on the out-of-fold predictions so that one seller's listings never appear in both training and testing.

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC | PR-AUC | False-positive rate |
|---|---|---|---|---|---|---|---|
| LightGBM | 0.989 | 0.984 | 0.926 | 0.955 | 0.998 | 0.989 | 0.002 |
| Logistic Regression | 0.868 | 0.481 | 0.750 | 0.586 | 0.874 | 0.738 | 0.115 |

The training log recorded a LightGBM latency of about 2.9 ms per listing.

### Training Files

The training pipeline (`train.py`), the original scoring module source (`core.py`), the dataset (`data.csv`), and the advertisement scraper (`scraper.py`) belong to the research project and have not yet been copied into this folder. Until they are added, the model can be run and tested but not retrained from this repository.

## 7. Known Limitations

- **Weak labels.** `Weak Label` was generated by heuristic rules, and a depth-4 decision tree reproduces it about 99% of the time. The metrics above therefore measure how well the model reproduces those rules. They do not measure how well it detects real fraud, and the probability must not be read as a verified fraud probability. The model should be validated on an expert-adjudicated test set.
- **Price dominates the explanations.** Price deviation is by far the most important SHAP feature, so "cheap" and "risky" are partly conflated. In spot checks, an ad priced far below the market was rated High, while one priced far above it was rated Low.
- **LIME is a cross-check only.** On the training data the LightGBM LIME fidelity was about 0.37 and the SHAP–LIME agreement about 0.35, so SHAP should be treated as the primary explanation.
- **Inputs the form does not collect.** Seller listing count defaults to 1, and registration year and condition use the model's defaults. These assumptions are listed in every report.
- **Recovered scoring module.** The original `core.py` source was overwritten by notebook exports, and the scoring functions were recovered from compiled Python 3.13 bytecode. This ties the application to Python 3.13 until the source is restored. The bundle and this module execute Python code when loaded, so only trusted local files should be used.
- **Link import coverage.** Only individual ads from ikman.lk and riyasewana.com are supported. If a site blocks access or changes its layout, enter the details manually.
- **Demo content.** The Model evaluation page and the synthetic dashboard samples use demo data and a labelled JavaScript rule baseline. They are separate from the trained bundle and are not its validation.
