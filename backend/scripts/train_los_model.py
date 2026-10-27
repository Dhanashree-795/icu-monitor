"""
AcuityCare — Experimental Length-of-Stay (LOS) Regression Model Training
Uses Synthetic Development ICU Data

IMPORTANT DISCLAIMER:
This machine learning model and its evaluation metrics are strictly for synthetic educational development.
Model predictions are experimental and MUST NOT be used for clinical decision making, triage,
or automatic patient discharge orders.
"""

import json
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

DATA_PATH = "backend/data/synthetic_icu_training_data.csv"
MODEL_DIR = "backend/models"
MODEL_PATH = os.path.join(MODEL_DIR, "los_random_forest_pipeline.joblib")
METADATA_PATH = os.path.join(MODEL_DIR, "model_metadata.json")

def train_and_evaluate():
    print(f"Loading synthetic dataset from: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH)
    print(f"Dataset shape: {df.shape}")
    
    # Feature columns (strictly clinical/operational categories; NO patient names or identifiers)
    categorical_features = ["icu_unit", "admission_type", "procedure_type", "condition_category"]
    numerical_features = ["patient_acuity_score", "is_isolation"]
    feature_cols = categorical_features + numerical_features
    target_col = "length_of_stay_hours"
    
    X = df[feature_cols]
    y = df[target_col]
    
    # Check for duplicate feature rows between train and test
    print(f"Features: {feature_cols}")
    print(f"Target: {target_col} (Hours derived from admission to discharge timestamps)")
    
    # 80/20 train/test held-out split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, shuffle=True
    )
    print(f"Training set: {len(X_train)} samples | Held-out test set: {len(X_test)} samples")
    
    # Preprocessing pipeline
    preprocessor = ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), categorical_features),
            ("num", StandardScaler(), numerical_features),
        ]
    )
    
    # 1. Simple Baseline: Predict median of training set
    baseline = DummyRegressor(strategy="median")
    baseline.fit(X_train, y_train)
    y_pred_baseline = baseline.predict(X_test)
    baseline_mae = float(mean_absolute_error(y_test, y_pred_baseline))
    baseline_rmse = float(np.sqrt(mean_squared_error(y_test, y_pred_baseline)))
    
    print("\n--- BASELINE MODEL (Median Regressor) ---")
    print(f"Held-out Test MAE:  {baseline_mae:.2f} hours")
    print(f"Held-out Test RMSE: {baseline_rmse:.2f} hours")
    
    # 2. Random Forest Regressor Pipeline
    rf_pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "regressor",
                RandomForestRegressor(
                    n_estimators=100,
                    max_depth=8,
                    min_samples_split=4,
                    random_state=42,
                    n_jobs=-1,
                ),
            ),
        ]
    )
    
    rf_pipeline.fit(X_train, y_train)
    y_pred_rf = rf_pipeline.predict(X_test)
    
    rf_mae = float(mean_absolute_error(y_test, y_pred_rf))
    rf_rmse = float(np.sqrt(mean_squared_error(y_test, y_pred_rf)))
    rf_r2 = float(r2_score(y_test, y_pred_rf))
    
    print("\n--- RANDOM FOREST REGRESSOR ---")
    print(f"Held-out Test MAE:  {rf_mae:.2f} hours (Improvement over baseline: {baseline_mae - rf_mae:.2f} hrs)")
    print(f"Held-out Test RMSE: {rf_rmse:.2f} hours")
    print(f"Held-out Test R²:   {rf_r2:.4f}")
    
    # Extract feature names & importances
    preprocessor_fitted = rf_pipeline.named_steps["preprocessor"]
    cat_encoder = preprocessor_fitted.named_transformers_["cat"]
    encoded_cat_names = list(cat_encoder.get_feature_names_out(categorical_features))
    all_feature_names = encoded_cat_names + numerical_features
    
    rf_model = rf_pipeline.named_steps["regressor"]
    importances = rf_model.feature_importances_
    
    importance_list = sorted(
        [{"feature": name, "importance": round(float(imp), 4)} for name, imp in zip(all_feature_names, importances)],
        key=lambda x: x["importance"],
        reverse=True,
    )
    
    # Top 5 predictive factors
    print("\nTop 5 Feature Importances:")
    for item in importance_list[:5]:
        print(f"  - {item['feature']}: {item['importance']:.4f}")
        
    # Save trained pipeline
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(rf_pipeline, MODEL_PATH)
    print(f"\nSaved trained pipeline to: {MODEL_PATH}")
    
    # Save metadata & evaluation results
    metadata = {
        "model_name": "ICU Length of Stay Random Forest Regressor",
        "model_version": "1.0.0-synthetic-exp",
        "is_experimental": True,
        "trained_at": pd.Timestamp.now().isoformat(),
        "disclaimer": "SYNTHETIC DEVELOPMENT DATASET ONLY. DO NOT USE FOR REAL CLINICAL CARE OR AUTOMATIC DISCHARGE ORDERS.",
        "dataset_path": DATA_PATH,
        "sample_count_total": len(df),
        "sample_count_train": len(X_train),
        "sample_count_test": len(X_test),
        "target": "length_of_stay_hours",
        "features": feature_cols,
        "evaluation_metrics": {
            "baseline_median_mae_hours": round(baseline_mae, 2),
            "baseline_median_rmse_hours": round(baseline_rmse, 2),
            "random_forest_mae_hours": round(rf_mae, 2),
            "random_forest_rmse_hours": round(rf_rmse, 2),
            "random_forest_r2": round(rf_r2, 4),
            "mae_improvement_over_baseline_hours": round(baseline_mae - rf_mae, 2),
        },
        "top_feature_importances": importance_list[:8],
        "scenarios_represented": 12,
    }
    
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved model metadata & metrics to: {METADATA_PATH}")

if __name__ == "__main__":
    train_and_evaluate()
