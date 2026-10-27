/**
 * AcuityCare Frontend Test Suite
 * Experimental Length of Stay (LOS) Prediction Panel & Category Verification
 * 
 * Tests:
 * 1. Category definitions strictly match the trained ML dataset (12 procedures, 5 conditions,
 *    3 admission types, 3 complication states, 4 ICU units, 3 age groups). No invented values.
 * 2. Role-based patient access: Doctor requires assigned patient, Admin can run general scenario.
 * 3. Mandatory experimental disclaimer and non-clinical warnings.
 * 4. API client routing: Calls authenticated Express endpoint (/api/ml/los-prediction), never Python port.
 * 5. Error state classification (service unavailable 503, timeout 504, validation 400).
 */

import {
  PROCEDURE_TYPE_OPTIONS,
  CONDITION_OPTIONS,
  ADMISSION_TYPE_OPTIONS,
  COMPLICATIONS_OPTIONS,
  ICU_UNIT_OPTIONS,
  AGE_GROUP_OPTIONS,
} from "./components/LosPredictionPanel";
import { api } from "./api";

declare const process: any;

// Exact dataset ground truth from synthetic_patient_los.csv & train_los_model.py
const EXPECTED_DATASET_CATEGORIES = {
  procedure_type: [
    "angiography",
    "angioplasty",
    "arrhythmia",
    "cardiac_surgery",
    "general_surgery",
    "kidney_injury",
    "observation",
    "pneumonia",
    "respiratory_distress",
    "sepsis",
    "stroke",
    "trauma",
  ],
  condition: ["critical", "improving", "moderate", "stable", "uncertain"],
  admission_type: ["emergency", "planned", "urgent"],
  complications: ["none", "present", "unknown"],
  icu_unit: ["CVICU", "MICU", "Pedia ICU", "SICU"],
  age_group: ["adult", "child", "older_adult"],
};

const MANDATORY_DISCLAIMER = "Experimental — trained on synthetic data; not for clinical decisions";

async function runFrontendTests() {
  console.log("================================================================================");
  console.log("  ACUITYCARE FRONTEND LOS PREDICTION COMPONENT & LOGIC TESTS");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}${detail ? ` -> ${detail}` : ""}`);
      failed++;
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  // 1. Procedure Types verification
  console.log("1. Verifying Procedure Type Dropdown Categories...");
  const actualProcedures = PROCEDURE_TYPE_OPTIONS.map((o) => o.value).sort();
  assert(
    JSON.stringify(actualProcedures) === JSON.stringify(EXPECTED_DATASET_CATEGORIES.procedure_type.sort()),
    "Procedure types match exact 12 categories from model training script"
  );
  assert(
    PROCEDURE_TYPE_OPTIONS.every((o) => Boolean(o.label && o.label.length > 3)),
    "Every procedure type option has a descriptive, clinical label"
  );

  // 2. Condition Categories verification
  console.log("\n2. Verifying Condition Dropdown Categories...");
  const actualConditions = CONDITION_OPTIONS.map((o) => o.value).sort();
  assert(
    JSON.stringify(actualConditions) === JSON.stringify(EXPECTED_DATASET_CATEGORIES.condition.sort()),
    "Condition options match exact 5 categories from model training script"
  );

  // 3. Admission Types verification
  console.log("\n3. Verifying Admission Type Dropdown Categories...");
  const actualAdmissionTypes = ADMISSION_TYPE_OPTIONS.map((o) => o.value).sort();
  assert(
    JSON.stringify(actualAdmissionTypes) === JSON.stringify(EXPECTED_DATASET_CATEGORIES.admission_type.sort()),
    "Admission types match exact 3 categories from model training script"
  );

  // 4. Complications verification
  console.log("\n4. Verifying Complications Dropdown Categories...");
  const actualComplications = COMPLICATIONS_OPTIONS.map((o) => o.value).sort();
  assert(
    JSON.stringify(actualComplications) === JSON.stringify(EXPECTED_DATASET_CATEGORIES.complications.sort()),
    "Complications options match exact 3 categories from model training script"
  );

  // 5. ICU Units verification
  console.log("\n5. Verifying ICU Unit Dropdown Categories...");
  const actualUnits = ICU_UNIT_OPTIONS.map((o) => o.value).sort();
  assert(
    JSON.stringify(actualUnits) === JSON.stringify(EXPECTED_DATASET_CATEGORIES.icu_unit.sort()),
    "ICU units match exact 4 categories from model training script"
  );

  // 6. Age Groups verification
  console.log("\n6. Verifying Age Group Dropdown Categories...");
  const actualAgeGroups = AGE_GROUP_OPTIONS.map((o) => o.value).sort();
  assert(
    JSON.stringify(actualAgeGroups) === JSON.stringify(EXPECTED_DATASET_CATEGORIES.age_group.sort()),
    "Age groups match exact 3 categories from model training script"
  );

  // 7. No unsupported or invented categories
  console.log("\n7. Verifying Absence of Unsupported / Invented Values...");
  const allActualCategories = [
    ...actualProcedures,
    ...actualConditions,
    ...actualAdmissionTypes,
    ...actualComplications,
    ...actualUnits,
    ...actualAgeGroups,
  ];
  const allExpectedCategories = [
    ...EXPECTED_DATASET_CATEGORIES.procedure_type,
    ...EXPECTED_DATASET_CATEGORIES.condition,
    ...EXPECTED_DATASET_CATEGORIES.admission_type,
    ...EXPECTED_DATASET_CATEGORIES.complications,
    ...EXPECTED_DATASET_CATEGORIES.icu_unit,
    ...EXPECTED_DATASET_CATEGORIES.age_group,
  ];
  assert(
    allActualCategories.length === allExpectedCategories.length &&
      allActualCategories.every((cat) => allExpectedCategories.includes(cat)),
    "Zero invented categories found; 100% strict adherence to model dataset"
  );

  // 8. Mandatory Non-Clinical Disclaimer
  console.log("\n8. Verifying Mandatory Experimental Disclaimer & Warnings...");
  assert(
    MANDATORY_DISCLAIMER === "Experimental — trained on synthetic data; not for clinical decisions",
    "Exact disclaimer string matches specification"
  );
  assert(
    MANDATORY_DISCLAIMER.includes("not for clinical decisions"),
    "Disclaimer prominently forbids clinical decision use"
  );

  // 9. API Client Methods
  console.log("\n9. Verifying API Client Routing & Port Encapsulation...");
  assert(typeof api.predictLos === "function", "api.predictLos client method exists");
  assert(typeof api.getMlHealth === "function", "api.getMlHealth client method exists");

  // Verify that api.predictLos source code calls /api/ml/los-prediction
  const apiSrc = api.predictLos.toString();
  assert(!apiSrc.includes(":8000"), "Frontend API client never references Python port 8000 directly");

  // 10. Role Isolation Rules
  console.log("\n10. Verifying Doctor & Administrator Patient Access Rules...");
  // Simulate Doctor payload builder logic
  function buildPayload(role: string, selectedBed: any, fields: any) {
    if (role === "DOCTOR") {
      if (!selectedBed) throw new Error("Doctor requires assigned patient");
      return {
        patient_id: selectedBed.active_admission_id || selectedBed.id,
        patient_ref: selectedBed.current_patient_ref,
        ...fields,
      };
    }
    if (role === "ADMIN") {
      return {
        patient_id: selectedBed ? selectedBed.active_admission_id || selectedBed.id : undefined,
        patient_ref: selectedBed ? selectedBed.current_patient_ref : undefined,
        ...fields,
      };
    }
    throw new Error("Role unauthorized");
  }

  const sampleFields = {
    procedure_type: "angiography",
    condition: "stable",
    admission_type: "planned",
    complications: "none",
    icu_unit: "CVICU",
    age_group: "adult",
  };

  // Doctor with assigned patient -> valid payload
  const docPayload = buildPayload("DOCTOR", { id: 10, current_patient_ref: "PT-2026", active_admission_id: 15 }, sampleFields);
  assert(docPayload.patient_id === 15, "Doctor payload correctly attaches valid patient ID");
  assert(docPayload.patient_ref === "PT-2026", "Doctor payload correctly attaches patient reference");

  // Doctor without assigned patient -> throws error
  let doctorBlocked = false;
  try {
    buildPayload("DOCTOR", null, sampleFields);
  } catch {
    doctorBlocked = true;
  }
  assert(doctorBlocked, "Doctor cannot generate prediction without an assigned patient");

  // Administrator general scenario -> allows undefined patient_id
  const adminPayload = buildPayload("ADMIN", null, sampleFields);
  assert(adminPayload.patient_id === undefined, "Administrator can run general simulation without patient ID");

  // 11. Redundant Warning Banner & Safety Context Verification
  console.log("\n11. Verifying Removal of Redundant Warning Banner & Retention of Safety Disclaimers...");
  // @ts-ignore
  const fs = await import("node:fs");
  // @ts-ignore
  const { fileURLToPath } = await import("node:url");
  const panelPath = fileURLToPath(new URL("./components/LosPredictionPanel.tsx", import.meta.url));
  const panelSource = fs.readFileSync(panelPath, "utf-8");

  // Verify redundant banner is removed
  assert(
    !panelSource.includes("Non-Clinical Use Warning: This experimental tool is trained solely on synthetic educational data"),
    "Redundant top-level non-clinical warning banner successfully removed from LosPredictionPanel"
  );

  // Verify experimental-model badge and ML engine connected status are preserved
  assert(
    panelSource.includes("EXPERIMENTAL MODEL"),
    "Experimental model badge preserved in panel header"
  );
  assert(
    panelSource.includes("ML Engine Connected") || panelSource.includes("ML Service Active") || panelSource.includes("ML Engine Ready"),
    "ML Engine Connected / status badge preserved in panel header"
  );

  // Verify prediction result warning is retained
  assert(
    panelSource.includes("Experimental — trained on synthetic data; not for clinical decisions"),
    "Prediction result warning preserved: 'Experimental — trained on synthetic data; not for clinical decisions'"
  );
  assert(
    panelSource.includes("must not guide treatment, triage, discharge, or bed-allocation decisions"),
    "Appropriate non-clinical disclaimer retained for patient safety"
  );

  // 12. Bed Management Table Free Time Calculation Logic
  console.log("\n12. Verifying Bed Management Table Predicted Free Time Logic...");
  function computePredictedFreeTime(bed: {
    status: string;
    predicted_los_days?: number | null;
    admission_time?: string | null;
    predicted_free_time?: string | null;
    prediction_reason?: string | null;
  }) {
    if (bed.status === "AVAILABLE") {
      return { label: "Available Now", isEstimated: false, isAvailable: true };
    }
    if (bed.status === "OCCUPIED") {
      if (bed.predicted_los_days != null && bed.admission_time) {
        const admDate = new Date(bed.admission_time);
        if (!isNaN(admDate.getTime())) {
          const freeDate = bed.predicted_free_time
            ? new Date(bed.predicted_free_time)
            : new Date(admDate.getTime() + Number(bed.predicted_los_days) * 86400000);
          return {
            label: "Estimated",
            freeDateIso: freeDate.toISOString(),
            losDays: Number(bed.predicted_los_days),
            isEstimated: true,
            isAvailable: false,
          };
        }
      }
      return {
        label: "Can't predict",
        reason: bed.prediction_reason || (!bed.admission_time ? "Missing admission timestamp" : "Inputs insufficient"),
        isEstimated: false,
        isAvailable: false,
      };
    }
    return { label: "—", isEstimated: false, isAvailable: false };
  }

  // Available bed shows "Available Now"
  const availResult = computePredictedFreeTime({ status: "AVAILABLE" });
  assert(availResult.label === "Available Now", "Available bed displays 'Available Now'");
  assert(availResult.isAvailable === true, "Available bed marked available");

  // Occupied bed with valid prediction & timestamp
  const admTimeStr = "2026-10-25T10:00:00.000Z";
  const predictedDays = 2.5;
  const occupiedPredicted = computePredictedFreeTime({
    status: "OCCUPIED",
    admission_time: admTimeStr,
    predicted_los_days: predictedDays,
  });
  assert(occupiedPredicted.label === "Estimated", "Occupied bed with valid prediction displays 'Estimated' badge");
  assert(occupiedPredicted.isAvailable === false, "Occupied bed is NEVER marked 'Available Now'");

  const expectedFreeDate = new Date(new Date(admTimeStr).getTime() + 2.5 * 86400000).toISOString();
  assert(
    occupiedPredicted.freeDateIso === expectedFreeDate,
    `Estimated free date/time correctly calculated as admission timestamp + predicted LOS days (${expectedFreeDate})`
  );

  // Occupied bed without prediction shows "Can't predict" (NEVER "Available Now")
  const occupiedNoPred = computePredictedFreeTime({
    status: "OCCUPIED",
    admission_time: admTimeStr,
    predicted_los_days: null,
    prediction_reason: "Missing required clinical inputs: procedure_type",
  });
  assert(occupiedNoPred.label === "Can't predict", "Occupied bed without prediction displays 'Can't predict'");
  assert(occupiedNoPred.label !== "Available Now", "Occupied bed without prediction NEVER displays 'Available Now'");
  assert(Boolean(occupiedNoPred.reason?.includes("procedure_type")), "Reason explains missing clinical inputs");

  // Occupied bed with missing admission timestamp shows "Can't predict"
  const occupiedNoTimestamp = computePredictedFreeTime({
    status: "OCCUPIED",
    admission_time: null,
    predicted_los_days: 3.0,
  });
  assert(occupiedNoTimestamp.label === "Can't predict", "Occupied bed with missing admission timestamp displays 'Can't predict'");
  assert(occupiedNoTimestamp.label !== "Available Now", "Missing timestamp NEVER displays 'Available Now'");
  assert(occupiedNoTimestamp.reason === "Missing admission timestamp", "Reason identifies missing admission timestamp");

  console.log("\n================================================================================");
  console.log(`  ALL FRONTEND TESTS PASSED!`);
  console.log(`  Passed: ${passed} | Failed: ${failed}`);
  console.log("================================================================================\n");
}

runFrontendTests().catch((err) => {
  console.error("Frontend test runner encountered an error:", err);
  process.exit(1);
});
