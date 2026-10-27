"""
Synthetic ICU Training Dataset Generator for Machine Learning Experiments
AcuityCare ICU Monitoring System

DISCLAIMER:
All records in this dataset are purely synthetic, educational development examples.
They do NOT represent real clinical diagnoses, validated risk scores, or actual hospital observations.
Under no circumstances should synthetic data or model outputs be used for real clinical decisions.
"""

import csv
import random
from datetime import datetime, timedelta

SCENARIOS = [
    {
        "procedure_type": "Elective angiography",
        "condition": "Stable, planned observation",
        "condition_category": "Stable",
        "default_unit": "Cardiovascular ICU (CVICU)",
        "admission_type": "Elective",
        "acuity_range": (1, 2),
        "los_mean_hours": 20.0,
        "los_std_hours": 6.0,
        "min_hours": 12.0,
        "max_hours": 42.0,
    },
    {
        "procedure_type": "Elective angioplasty",
        "condition": "Stable after procedure",
        "condition_category": "Postoperative",
        "default_unit": "Cardiovascular ICU (CVICU)",
        "admission_type": "Elective",
        "acuity_range": (2, 3),
        "los_mean_hours": 28.0,
        "los_std_hours": 8.0,
        "min_hours": 16.0,
        "max_hours": 56.0,
    },
    {
        "procedure_type": "Cardiac surgery",
        "condition": "Postoperative monitoring",
        "condition_category": "Postoperative",
        "default_unit": "Cardiovascular ICU (CVICU)",
        "admission_type": "Elective",
        "acuity_range": (3, 4),
        "los_mean_hours": 72.0,
        "los_std_hours": 24.0,
        "min_hours": 36.0,
        "max_hours": 144.0,
    },
    {
        "procedure_type": "Emergency cardiac admission",
        "condition": "Acute chest pain under evaluation",
        "condition_category": "Under evaluation",
        "default_unit": "Medical ICU (MICU)",
        "admission_type": "Emergency",
        "acuity_range": (3, 4),
        "los_mean_hours": 44.0,
        "los_std_hours": 16.0,
        "min_hours": 18.0,
        "max_hours": 96.0,
    },
    {
        "procedure_type": "Respiratory admission",
        "condition": "Pneumonia requiring monitoring",
        "condition_category": "Guarded",
        "default_unit": "Medical ICU (MICU)",
        "admission_type": "Emergency",
        "acuity_range": (2, 4),
        "los_mean_hours": 60.0,
        "los_std_hours": 20.0,
        "min_hours": 24.0,
        "max_hours": 120.0,
    },
    {
        "procedure_type": "Respiratory admission",
        "condition": "Severe respiratory distress",
        "condition_category": "Critical",
        "default_unit": "Medical ICU (MICU)",
        "admission_type": "Emergency",
        "acuity_range": (4, 5),
        "los_mean_hours": 110.0,
        "los_std_hours": 36.0,
        "min_hours": 48.0,
        "max_hours": 240.0,
    },
    {
        "procedure_type": "Infection admission",
        "condition": "Suspected sepsis",
        "condition_category": "Critical",
        "default_unit": "Medical ICU (MICU)",
        "admission_type": "Emergency",
        "acuity_range": (4, 5),
        "los_mean_hours": 120.0,
        "los_std_hours": 40.0,
        "min_hours": 48.0,
        "max_hours": 280.0,
    },
    {
        "procedure_type": "Neurological admission",
        "condition": "Stroke observation",
        "condition_category": "Guarded",
        "default_unit": "Medical ICU (MICU)",
        "admission_type": "Emergency",
        "acuity_range": (3, 4),
        "los_mean_hours": 52.0,
        "los_std_hours": 18.0,
        "min_hours": 24.0,
        "max_hours": 110.0,
    },
    {
        "procedure_type": "Trauma admission",
        "condition": "Post-trauma monitoring",
        "condition_category": "Postoperative",
        "default_unit": "Surgical ICU (SICU)",
        "admission_type": "Trauma",
        "acuity_range": (3, 5),
        "los_mean_hours": 84.0,
        "los_std_hours": 30.0,
        "min_hours": 30.0,
        "max_hours": 180.0,
    },
    {
        "procedure_type": "General surgery",
        "condition": "Postoperative recovery",
        "condition_category": "Postoperative",
        "default_unit": "Surgical ICU (SICU)",
        "admission_type": "Elective",
        "acuity_range": (2, 3),
        "los_mean_hours": 46.0,
        "los_std_hours": 14.0,
        "min_hours": 20.0,
        "max_hours": 90.0,
    },
    {
        "procedure_type": "Renal admission",
        "condition": "Acute kidney injury",
        "condition_category": "Guarded",
        "default_unit": "Medical ICU (MICU)",
        "admission_type": "Emergency",
        "acuity_range": (3, 4),
        "los_mean_hours": 68.0,
        "los_std_hours": 22.0,
        "min_hours": 28.0,
        "max_hours": 140.0,
    },
    {
        "procedure_type": "Cardiac admission",
        "condition": "Arrhythmia monitoring",
        "condition_category": "Guarded",
        "default_unit": "Cardiovascular ICU (CVICU)",
        "admission_type": "Emergency",
        "acuity_range": (2, 3),
        "los_mean_hours": 36.0,
        "los_std_hours": 12.0,
        "min_hours": 16.0,
        "max_hours": 72.0,
    },
]

ICU_UNITS = [
    "Medical ICU (MICU)",
    "Surgical ICU (SICU)",
    "Cardiovascular ICU (CVICU)",
    "Pediatric ICU (Pedia ICU)",
]

def generate_dataset(num_records: int = 240, seed: int = 42) -> list[dict]:
    random.seed(seed)
    records = []
    
    # Base start date for synthetic timeline
    base_time = datetime(2026, 8, 1, 8, 0, 0)
    
    for i in range(1, num_records + 1):
        # Round-robin + random selection to guarantee balanced scenario representation
        scenario = SCENARIOS[(i - 1) % len(SCENARIOS)]
        
        # Slight unit variation where applicable
        if random.random() < 0.2:
            icu_unit = random.choice(ICU_UNITS)
        else:
            icu_unit = scenario["default_unit"]
            
        admission_type = scenario["admission_type"]
        acuity_min, acuity_max = scenario["acuity_range"]
        acuity_score = random.randint(acuity_min, acuity_max)
        
        # Airborne / isolation status (higher chance for respiratory / infection)
        is_isolation = 1 if (scenario["procedure_type"] in ["Respiratory admission", "Infection admission"] and random.random() < 0.4) else 0
        
        # Genuine timestamp derivation:
        # Admission time distributed over a 2-month synthetic testing timeline
        adm_offset_hours = random.uniform(0, 1400)
        admitted_at = base_time + timedelta(hours=adm_offset_hours)
        
        # Length of stay sampled from Gaussian with truncation
        raw_stay = random.gauss(scenario["los_mean_hours"], scenario["los_std_hours"])
        # Add slight acuity and isolation adjustments (prolonged stay variance)
        acuity_factor = 1.0 + (acuity_score - 2.5) * 0.12
        iso_factor = 1.15 if is_isolation else 1.0
        adjusted_stay = raw_stay * acuity_factor * iso_factor
        
        clamped_hours = max(scenario["min_hours"], min(scenario["max_hours"], adjusted_stay))
        los_hours = round(clamped_hours, 1)
        
        # Compute exact discharge timestamp from admission time + derived duration
        discharged_at = admitted_at + timedelta(hours=los_hours)
        
        # Target derived strictly from actual recorded timestamps:
        actual_stay_seconds = (discharged_at - admitted_at).total_seconds()
        actual_stay_hours = round(actual_stay_seconds / 3600.0, 1)
        actual_stay_days = round(actual_stay_hours / 24.0, 2)
        
        records.append({
            "example_id": i,
            "icu_unit": icu_unit,
            "admission_type": admission_type,
            "procedure_type": scenario["procedure_type"],
            "condition_description": scenario["condition"],
            "condition_category": scenario["condition_category"],
            "patient_acuity_score": acuity_score,
            "is_isolation": is_isolation,
            "admitted_timestamp": admitted_at.isoformat(),
            "discharged_timestamp": discharged_at.isoformat(),
            "length_of_stay_hours": actual_stay_hours,
            "length_of_stay_days": actual_stay_days,
            "data_source": "SYNTHETIC_DEVELOPMENT_ONLY_NOT_CLINICAL",
        })
        
    return records

def main():
    records = generate_dataset(num_records=240, seed=42)
    output_path = "backend/data/synthetic_icu_training_data.csv"
    
    fieldnames = list(records[0].keys())
    with open(output_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)
        
    print(f"Generated {len(records)} synthetic ICU development records -> {output_path}")
    print(f"Sample record: {records[0]}")

if __name__ == "__main__":
    main()
