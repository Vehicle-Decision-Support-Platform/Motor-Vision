from pathlib import Path
import joblib
from lightgbm import LGBMRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
from core import load_data, make_training_pairs, synthetic_target, COLUMNS

ROOT=Path(__file__).resolve().parent
PROJECT_ROOT=ROOT.parents[2]
df=load_data(PROJECT_ROOT/'datasets/processed/component-2-recommendation/vehicles.csv')
X=make_training_pairs(df)
y=synthetic_target(X)
X_train,X_test,y_train,y_test=train_test_split(X,y,test_size=0.2,random_state=42)
model=LGBMRegressor(n_estimators=300,learning_rate=0.05,num_leaves=15,max_depth=6,random_state=42,verbosity=-1)
model.fit(X_train,y_train)
pred=model.predict(X_test)
(ROOT.parent/'models').mkdir(exist_ok=True)
joblib.dump(model,ROOT.parent/'models'/'lightgbm_relevance.joblib')
print('Model saved to ai-models/component-2-recommendation/models/lightgbm_relevance.joblib')
print('Synthetic-label MAE:',round(mean_absolute_error(y_test,pred),5))
print('Synthetic-label R2:',round(r2_score(y_test,pred),5))
print('NOTE: Metrics measure fit to a synthetic matching rule, NOT real user recommendation accuracy.')
