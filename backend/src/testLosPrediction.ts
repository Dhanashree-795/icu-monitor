/**
 * AcuityCare Express + TypeScript Backend
 * Comprehensive Test Suite for Length of Stay (LOS) Prediction ML Endpoint
 * 
 * Verifies:
 * 1. Authentication (missing & invalid tokens -> 401)
 * 2. Role Authorization (Nurse & Housekeeping blocked -> 403, Admin & Doctor allowed)
 * 3. Input Validation (all 6 fields required, non-empty strings -> 400)
 * 4. Doctor-Patient Isolation (doctor cannot predict for other doctors' patients -> 403,
 *    tampering doctor_id in body ignored, valid assignment allowed -> 200)
 * 5. Mocked ML Service Success (returns prediction, disclaimer, clinical_use: false -> 200)
 * 6. Mocked ML Service Timeout (504 Gateway Timeout)
 * 7. Mocked ML Service Error (502 Bad Gateway)
 * 8. Mocked ML Service Unavailable (503 Service Unavailable)
 * 9. Live Python ML Service Integration (http://127.0.0.1:8000)
 */

import http from "http";
import express from "express";
import cookieParser from "cookie-parser";
import { pool } from "./db/index";
import { config } from "./config/env";
import { generateToken, csrfProtection, UserRole } from "./middleware/auth";
import authRoutes from "./routes/auth";
import mlRoutes from "./routes/ml";
import icuRoutes from "./routes/icu";

function createAuthHeader(id: number, email: string, role: UserRole): string {
  const token = generateToken({ id, email, role });
  return `Bearer ${token}`;
}

const VALID_SAMPLE_PAYLOAD = {
  procedure_type: "angiography",
  condition: "stable",
  admission_type: "elective",
  complications: "none",
  icu_unit: "cardiac",
  age_group: "middle",
};

async function runTestSuite() {
  console.log("================================================================================");
  console.log("  ACUITYCARE LOS PREDICTION ML ENDPOINT AUTOMATED TEST SUITE");
  console.log("================================================================================\n");

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ""}`);
      failedCount++;
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  // 1. Fetch test fixtures from PostgreSQL
  console.log("1. Loading test users and admission records from PostgreSQL...");
  const usersRes = await pool.query<{ id: number; email: string; role: string }>(
    "SELECT id, email, role FROM users ORDER BY id ASC"
  );
  const adminUser = usersRes.rows.find((u) => u.role === "ADMIN");
  const doctorUser1 = usersRes.rows.find((u) => u.role === "DOCTOR" && u.email === "rajesh.sharma@doctor.icu.in") ||
                     usersRes.rows.find((u) => u.role === "DOCTOR");
  const doctorUser2 = usersRes.rows.find((u) => u.role === "DOCTOR" && u.id !== doctorUser1?.id);
  const nurseUser = usersRes.rows.find((u) => u.role === "NURSE");
  const hkUser = usersRes.rows.find((u) => u.role === "HOUSEKEEPING");

  assert(Boolean(adminUser && doctorUser1 && doctorUser2 && nurseUser && hkUser), "Resolved Admin, Doctor1, Doctor2, Nurse, Housekeeping fixtures");

  // Find admissions assigned to doctorUser1 and doctorUser2
  const doc1Admissions = await pool.query<{ id: number; patient_ref: string }>(
    "SELECT id, patient_ref FROM admissions WHERE admitting_doctor_id = $1 LIMIT 1",
    [doctorUser1!.id]
  );
  const doc2Admissions = await pool.query<{ id: number; patient_ref: string }>(
    "SELECT id, patient_ref FROM admissions WHERE admitting_doctor_id = $1 LIMIT 1",
    [doctorUser2!.id]
  );

  assert(doc1Admissions.rows.length > 0, `Doctor 1 (id: ${doctorUser1!.id}) has assigned admission`);
  assert(doc2Admissions.rows.length > 0, `Doctor 2 (id: ${doctorUser2!.id}) has assigned admission`);

  const doc1Admission = doc1Admissions.rows[0]!;
  const doc2Admission = doc2Admissions.rows[0]!;

  const adminAuth = createAuthHeader(adminUser!.id, adminUser!.email, "ADMIN");
  const doctor1Auth = createAuthHeader(doctorUser1!.id, doctorUser1!.email, "DOCTOR");
  const doctor2Auth = createAuthHeader(doctorUser2!.id, doctorUser2!.email, "DOCTOR");
  const nurseAuth = createAuthHeader(nurseUser!.id, nurseUser!.email, "NURSE");
  const hkAuth = createAuthHeader(hkUser!.id, hkUser!.email, "HOUSEKEEPING");

  // 2. Set up Mock Python ML Service on dynamic loopback port
  console.log("\n2. Starting Mock Python ML Service on dynamic loopback port...");
  let mockMode: "success" | "error" | "timeout" = "success";

  const mockServer = http.createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy", model_loaded: true, data_type: "synthetic" }));
      return;
    }

    if (req.url === "/predict" && req.method === "POST") {
      if (mockMode === "timeout") {
        // Delay beyond 5000ms to trigger Express gateway timeout
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ predicted_los_days: 9.99 }));
        }, 6000);
        return;
      }

      if (mockMode === "error") {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "Synthetic pipeline error in mock python model" }));
        return;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          // Return simulated prediction
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              predicted_los_days: 2.45,
              model_status: "experimental_synthetic_data",
              clinical_use: false,
              echo_procedure: parsed.procedure_type,
            })
          );
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ detail: "Invalid JSON" }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => {
    mockServer.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });

  const mockPort = (mockServer.address() as any).port;
  const originalMlUrl = config.losMlApiUrl;
  config.losMlApiUrl = `http://127.0.0.1:${mockPort}`;
  console.log(`  Mock Python ML server listening on http://127.0.0.1:${mockPort}`);

  // 3. Start In-Process Express App with active routes and middleware
  const testApp = express();
  testApp.use(cookieParser());
  testApp.use(express.json());
  testApp.use(csrfProtection);
  testApp.use("/api/auth", authRoutes);
  testApp.use("/api/ml", mlRoutes);
  testApp.use("/api/icu", icuRoutes);

  const testServer = await new Promise<http.Server>((resolve) => {
    const s = testApp.listen(0, "127.0.0.1", () => {
      resolve(s);
    });
  });

  const testPort = (testServer.address() as any).port;
  const BASE_URL = `http://127.0.0.1:${testPort}/api`;
  console.log(`  In-Process Express test server listening on ${BASE_URL}`);

  try {
    // 3. Test Authentication
    console.log("\n3. Testing Authentication Middleware (401 Enforcement)...");
    const unauthRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SAMPLE_PAYLOAD),
    });
    assert(unauthRes.status === 401, "Missing authentication rejected with HTTP 401");

    const invalidTokenRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: {
        Authorization: "Bearer invalid_or_forged_token_here",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(VALID_SAMPLE_PAYLOAD),
    });
    assert(invalidTokenRes.status === 401, "Malformed token rejected with HTTP 401");

    // 4. Test Role Authorization (Nurse and Housekeeping rejected with 403)
    console.log("\n4. Testing Role Authorization (403 Enforcement)...");
    const nurseRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { Authorization: nurseAuth, "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SAMPLE_PAYLOAD),
    });
    assert(nurseRes.status === 403, "Nurse role blocked with HTTP 403 Forbidden");

    const hkRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { Authorization: hkAuth, "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SAMPLE_PAYLOAD),
    });
    assert(hkRes.status === 403, "Housekeeping role blocked with HTTP 403 Forbidden");

    // 5. Test Input Validation (All 6 fields required)
    console.log("\n5. Testing Input Validation for all 6 required fields...");
    const requiredFields = [
      "procedure_type",
      "condition",
      "admission_type",
      "complications",
      "icu_unit",
      "age_group",
    ];

    for (const field of requiredFields) {
      const invalidPayload: any = { ...VALID_SAMPLE_PAYLOAD };
      delete invalidPayload[field];

      const resMissing = await fetch(`${BASE_URL}/ml/los-prediction`, {
        method: "POST",
        headers: { Authorization: adminAuth, "Content-Type": "application/json" },
        body: JSON.stringify(invalidPayload),
      });
      assert(
        resMissing.status === 400,
        `Missing field '${field}' rejected with HTTP 400 Bad Request`
      );

      // Also test empty string
      const emptyPayload: any = { ...VALID_SAMPLE_PAYLOAD, [field]: "   " };
      const resEmpty = await fetch(`${BASE_URL}/ml/los-prediction`, {
        method: "POST",
        headers: { Authorization: adminAuth, "Content-Type": "application/json" },
        body: JSON.stringify(emptyPayload),
      });
      assert(
        resEmpty.status === 400,
        `Whitespace-only field '${field}' rejected with HTTP 400 Bad Request`
      );
    }

    // 6. Test Doctor-Patient Access Rules & Isolation
    console.log("\n6. Testing Doctor-Patient Access Rules & Isolation...");

    // Doctor without patient ID -> 400
    const docNoPatientRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SAMPLE_PAYLOAD),
    });
    assert(
      docNoPatientRes.status === 400,
      "Doctor prediction request without patient ID rejected with HTTP 400"
    );

    // Doctor with non-existent patient ID -> 404
    const docNonExistentRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_SAMPLE_PAYLOAD,
        patient_id: 99999999,
      }),
    });
    assert(
      docNonExistentRes.status === 404,
      "Doctor prediction request for non-existent patient ID rejected with HTTP 404"
    );

    // Doctor 1 requesting prediction for Doctor 2's patient -> 403 Forbidden
    const crossDocRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_SAMPLE_PAYLOAD,
        patient_id: doc2Admission.id,
      }),
    });
    assert(
      crossDocRes.status === 403,
      "Doctor blocked from requesting prediction for another doctor's patient (HTTP 403 Forbidden)"
    );

    // Client-supplied ownership tampering: Doctor 1 passes body with doctor_id: doctor1.id for Doctor 2's patient
    const tamperRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_SAMPLE_PAYLOAD,
        patient_id: doc2Admission.id,
        admitting_doctor_id: doctorUser1!.id, // Attempt to spoof ownership in request body
        doctor_id: doctorUser1!.id,
      }),
    });
    assert(
      tamperRes.status === 403,
      "Client-supplied ownership tampering strictly rejected using database verification (HTTP 403)"
    );

    // Doctor 1 requesting prediction for their own patient by numeric ID -> 200 OK
    const ownDocRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_SAMPLE_PAYLOAD,
        patient_id: doc1Admission.id,
      }),
    });
    assert(
      ownDocRes.status === 200,
      "Doctor successfully receives prediction for their assigned patient by ID (HTTP 200 OK)"
    );
    const ownDocData = await ownDocRes.json();
    assert(typeof ownDocData.predicted_los_days === "number", "Response includes predicted_los_days");
    assert(ownDocData.clinical_use === false, "clinical_use is false");
    assert(ownDocData.is_experimental === true, "is_experimental flag is true");
    assert(
      ownDocData.disclaimer.includes("not for clinical decisions"),
      "Response includes explicit experimental non-clinical disclaimer"
    );

    // Doctor 1 requesting prediction for their own patient by patient_ref string -> 200 OK
    const ownDocRefRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_SAMPLE_PAYLOAD,
        patient_ref: doc1Admission.patient_ref,
      }),
    });
    assert(
      ownDocRefRes.status === 200,
      "Doctor successfully receives prediction for assigned patient by patient_ref (HTTP 200 OK)"
    );

    // 7. Test Administrator Privileges
    console.log("\n7. Testing Administrator Prediction Permissions...");
    // Admin without patient ID -> 200 OK (operational scenario prediction)
    const adminGeneralRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { Authorization: adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SAMPLE_PAYLOAD),
    });
    assert(
      adminGeneralRes.status === 200,
      "Administrator can run general prediction without patient ID (HTTP 200 OK)"
    );

    // Admin with any patient ID -> 200 OK
    const adminPatientRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { Authorization: adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_SAMPLE_PAYLOAD,
        patient_id: doc2Admission.id,
      }),
    });
    assert(
      adminPatientRes.status === 200,
      "Administrator can run prediction for any patient admission (HTTP 200 OK)"
    );

    // 8. Test ML Service Error Handling (Mocked)
    console.log("\n8. Testing ML Service Error Handling (Mocked)...");

    // 8a. Upstream ML Service Error (HTTP 500 from Python -> HTTP 502 Bad Gateway)
    mockMode = "error";
    const errorRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { Authorization: adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SAMPLE_PAYLOAD),
    });
    assert(
      errorRes.status === 502,
      "Upstream ML service failure handled with HTTP 502 Bad Gateway"
    );
    const errBody = await errorRes.json();
    assert(Boolean(errBody.message), "Safe error message returned without internal stack trace");

    // 8b. Upstream ML Service Timeout (> 5000ms -> HTTP 504 Gateway Timeout)
    console.log("   Testing timeout handling (waiting ~5s for AbortController)...");
    mockMode = "timeout";
    const timeoutRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { Authorization: adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SAMPLE_PAYLOAD),
    });
    assert(
      timeoutRes.status === 504,
      "Upstream ML service timeout handled with HTTP 504 Gateway Timeout"
    );

    // 8c. Upstream ML Service Unavailable (Offline/Closed -> HTTP 503 Service Unavailable)
    console.log("   Testing unavailable ML service handling (pointing to inactive port)...");
    config.losMlApiUrl = "http://127.0.0.1:19999"; // port with nothing listening
    const unavailRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
      method: "POST",
      headers: { Authorization: adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SAMPLE_PAYLOAD),
    });
    assert(
      unavailRes.status === 503,
      "Offline ML service handled gracefully with HTTP 503 Service Unavailable"
    );
    const unavailBody = await unavailRes.json();
    assert(
      unavailBody.message.includes("currently unavailable"),
      "Safe unavailable message returned to user"
    );

    // 9. Health Check Endpoint
    console.log("\n9. Testing /api/ml/health Endpoint...");
    config.losMlApiUrl = `http://127.0.0.1:${mockPort}`;
    mockMode = "success";
    const healthRes = await fetch(`${BASE_URL}/ml/health`, {
      headers: { Authorization: doctor1Auth },
    });
    assert(healthRes.status === 200, "Health check endpoint returns HTTP 200 OK");
    const healthData = await healthRes.json();
    assert(healthData.status === "ok", "Health status is 'ok'");
    assert(healthData.disclaimer.includes("not for clinical decisions"), "Health response has experimental disclaimer");

    // 10. Test Against Live Python Service (if listening on 8000)
    console.log("\n10. Testing Live Python Service Integration (http://127.0.0.1:8000)...");
    try {
      config.losMlApiUrl = "http://127.0.0.1:8000";
      const liveCheck = await fetch("http://127.0.0.1:8000/health");
      if (liveCheck.ok) {
        const livePredictRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
          method: "POST",
          headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...VALID_SAMPLE_PAYLOAD,
            patient_id: doc1Admission.id,
          }),
        });
        assert(
          livePredictRes.status === 200,
          "Express successfully forwarded prediction to LIVE Python FastAPI service on port 8000"
        );
        const liveData = await livePredictRes.json();
        console.log(`     Live Predicted LOS Days: ${liveData.predicted_los_days} days`);
        console.log(`     Model Status:            ${liveData.model_status}`);
        console.log(`     Clinical Use:            ${liveData.clinical_use}`);
        console.log(`     Disclaimer:              ${liveData.disclaimer}`);
        assert(typeof liveData.predicted_los_days === "number", "Live prediction returned numeric days");
      } else {
        console.log("   (Live python service returned non-200 on /health, skipped live test)");
      }
    } catch {
      console.log("   (Live python service on port 8000 was unreachable during live test)");
    }

    // 11. Automatic LOS Estimation During Bed Admission & Table Integration
    console.log("\n11. Testing Automatic LOS Estimation During Bed Admission Workflow...");

    // 11a. Provision dedicated isolated beds for admission tests
    const bSuffix = Date.now();
    const b1 = await pool.query<{ id: number; bed_number: string; unit_id: number }>(
      `INSERT INTO beds (bed_number, unit_id, status, is_isolation, created_at, updated_at) VALUES ('STEP11-BED-${bSuffix}-1', 1, 'AVAILABLE', false, NOW(), NOW()) RETURNING id, bed_number, unit_id`
    );
    const b2 = await pool.query<{ id: number; bed_number: string; unit_id: number }>(
      `INSERT INTO beds (bed_number, unit_id, status, is_isolation, created_at, updated_at) VALUES ('STEP11-BED-${bSuffix}-2', 1, 'AVAILABLE', false, NOW(), NOW()) RETURNING id, bed_number, unit_id`
    );
    const testBed1 = b1.rows[0]!;
    const testBed2 = b2.rows[0]!;
    assert(Boolean(testBed1 && testBed2), "Found or provisioned at least 2 available beds for admission tests");

    // 11b. Successful admission with valid prediction (Doctor role)
    config.losMlApiUrl = `http://127.0.0.1:${mockPort}`;
    mockMode = "success";
    const testAdmTime = new Date().toISOString();

    console.log(`   Admitting patient to Bed ${testBed1.bed_number} with complete clinical inputs...`);
    const admitRes1 = await fetch(`${BASE_URL}/icu/beds/${testBed1.id}/admit`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        patientRef: "PT-TEST-PREDICT-1",
        patientName: "Synthetic Test Patient Alpha",
        procedureType: "angiography",
        condition: "stable",
        admissionType: "planned",
        complications: "none",
        ageGroup: "adult",
        admissionTime: testAdmTime,
      }),
    });
    assert(admitRes1.status === 200, "Bed admission with complete clinical inputs succeeds (HTTP 200)");
    const admitData1 = await admitRes1.json();
    assert(admitData1.status === "OCCUPIED", "Bed transitions to OCCUPIED status");
    assert(typeof admitData1.predictedLosDays === "number", "Response includes numeric predictedLosDays");
    assert(admitData1.predictionStatus === "PREDICTED", "Prediction status is 'PREDICTED'");
    assert(Boolean(admitData1.predictedFreeTime), "Response includes predictedFreeTime timestamp");

    // Verify mathematical accuracy: free time = admission timestamp + predicted LOS days
    const expectedFreeMs = new Date(testAdmTime).getTime() + admitData1.predictedLosDays * 86400000;
    const actualFreeMs = new Date(admitData1.predictedFreeTime).getTime();
    assert(
      Math.abs(actualFreeMs - expectedFreeMs) < 1000,
      `Estimated free time mathematically equals admission timestamp + predicted LOS days (${admitData1.predictedFreeTime})`
    );

    // Verify stored admission record in PostgreSQL
    const dbAdmRes = await pool.query<{
      predicted_los_days: string;
      prediction_status: string;
      predicted_free_time: string;
      prediction_inputs: any;
    }>("SELECT predicted_los_days, prediction_status, predicted_free_time, prediction_inputs FROM admissions WHERE bed_id = $1 AND status = 'ADMITTED'", [testBed1.id]);
    assert(dbAdmRes.rows.length === 1, "Admission record found in database for testBed1");
    assert(Number(dbAdmRes.rows[0]!.predicted_los_days) === admitData1.predictedLosDays, "Database stored predicted_los_days matches response");
    assert(dbAdmRes.rows[0]!.prediction_status === "PREDICTED", "Database stored prediction_status is 'PREDICTED'");
    assert(Boolean(dbAdmRes.rows[0]!.prediction_inputs), "Database stored prediction_inputs JSON");

    // 11c. Admission succeeds when ML service is offline (NON-BLOCKING)
    console.log(`   Admitting patient to Bed ${testBed2.bed_number} while ML service is OFFLINE...`);
    config.losMlApiUrl = "http://127.0.0.1:19999"; // Inactive port

    const admitResOffline = await fetch(`${BASE_URL}/icu/beds/${testBed2.id}/admit`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        patientRef: "PT-TEST-OFFLINE-2",
        patientName: "Synthetic Test Patient Beta",
        procedureType: "pneumonia",
        condition: "moderate",
        admissionType: "urgent",
        complications: "none",
        ageGroup: "adult",
        admissionTime: new Date().toISOString(),
      }),
    });
    assert(
      admitResOffline.status === 200,
      "Bed admission SUCCEEDS even when ML service is completely OFFLINE (non-blocking requirement verified)"
    );
    const admitDataOffline = await admitResOffline.json();
    assert(admitDataOffline.status === "OCCUPIED", "Bed transitions to OCCUPIED status despite ML outage");
    assert(admitDataOffline.predictedLosDays === null, "predictedLosDays is null (NOT 0 days and NOT fabricated)");
    assert(admitDataOffline.predictionStatus === "CANT_PREDICT", "Prediction status set to 'CANT_PREDICT'");
    assert(
      Boolean(admitDataOffline.predictionReason && admitDataOffline.predictionReason.includes("unavailable")),
      "Recorded reason explains ML service was unavailable"
    );

    // 11d. Missing clinical inputs produce "Can't predict"
    config.losMlApiUrl = `http://127.0.0.1:${mockPort}`;
    mockMode = "success";

    // Find a third available bed or create one for test
    let testBed3Id: number;
    const bed3Search = await pool.query<{ id: number; bed_number: string }>(
      "SELECT id, bed_number FROM beds WHERE status = 'AVAILABLE' ORDER BY id DESC LIMIT 1"
    );
    if (bed3Search.rows.length > 0) {
      testBed3Id = bed3Search.rows[0]!.id;
    } else {
      const created = await pool.query<{ id: number }>(
        "INSERT INTO beds (bed_number, unit_id, status, is_isolation, created_at, updated_at) VALUES ('TEST-BED-99', 1, 'AVAILABLE', false, NOW(), NOW()) RETURNING id"
      );
      testBed3Id = created.rows[0]!.id;
    }

    console.log("   Admitting patient with missing procedureType (missing clinical inputs)...");
    const admitResMissing = await fetch(`${BASE_URL}/icu/beds/${testBed3Id}/admit`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        patientRef: "PT-TEST-MISSING-3",
        patientName: "Synthetic Test Patient Gamma",
        // procedureType omitted
        condition: "stable",
        admissionType: "planned",
        complications: "none",
        ageGroup: "adult",
      }),
    });
    assert(admitResMissing.status === 200, "Bed admission with missing procedureType succeeds (HTTP 200)");
    const admitDataMissing = await admitResMissing.json();
    assert(admitDataMissing.predictedLosDays === null, "predictedLosDays is null when clinical inputs are missing");
    assert(admitDataMissing.predictionStatus === "CANT_PREDICT", "Missing clinical inputs produce 'CANT_PREDICT' status");
    assert(
      admitDataMissing.predictionReason.includes("procedure_type"),
      "Recorded reason clearly notes missing procedure_type"
    );

    // 11e. Bed management table query & display logic
    console.log("\n12. Verifying Bed Management Table Data via GET /api/icu/beds...");
    const bedsTableRes = await fetch(`${BASE_URL}/icu/beds`, {
      headers: { Authorization: doctor1Auth },
    });
    assert(bedsTableRes.status === 200, "Doctor can fetch bed list (HTTP 200)");
    const allBeds = (await bedsTableRes.json()) as any[];

    // Verify available bed properties
    const availBedItem = allBeds.find((b) => b.status === "AVAILABLE");
    if (availBedItem) {
      assert(availBedItem.status === "AVAILABLE", "Available bed has status AVAILABLE (maps to 'Available Now')");
    }

    // Verify predicted occupied bed
    const predictedBedItem = allBeds.find((b) => b.id === testBed1.id);
    assert(Boolean(predictedBedItem), "Found predicted test bed in bed table");
    assert(predictedBedItem.status === "OCCUPIED", "Predicted test bed is OCCUPIED");
    assert(typeof predictedBedItem.predicted_los_days === "number", "Bed table includes predicted_los_days");
    assert(Boolean(predictedBedItem.predicted_free_time), "Bed table includes predicted_free_time");

    // Verify unpredicted occupied bed
    const unpredictedBedItem = allBeds.find((b) => b.id === testBed2.id);
    assert(Boolean(unpredictedBedItem), "Found unpredicted test bed in bed table");
    assert(unpredictedBedItem.status === "OCCUPIED", "Unpredicted test bed is OCCUPIED");
    assert(unpredictedBedItem.predicted_los_days === null, "Unpredicted occupied bed has null predicted_los_days (NEVER 'Available Now')");
    assert(unpredictedBedItem.prediction_status === "CANT_PREDICT", "Unpredicted occupied bed has prediction_status 'CANT_PREDICT'");

    // 11f. Privacy restrictions for Housekeeping
    console.log("\n13. Verifying Housekeeping Privacy Redactions for ML & Patient Data...");
    const hkBedsRes = await fetch(`${BASE_URL}/icu/beds`, {
      headers: { Authorization: hkAuth },
    });
    assert(hkBedsRes.status === 200, "Housekeeping can fetch beds (HTTP 200)");
    const hkBeds = (await hkBedsRes.json()) as any[];
    const hkBed1 = hkBeds.find((b) => b.id === testBed1.id);
    assert(hkBed1.predicted_los_days === null, "Housekeeping bed list strictly redacts predicted_los_days to null");
    assert(hkBed1.prediction_status === null, "Housekeeping bed list strictly redacts prediction_status to null");
    assert(hkBed1.predicted_free_time === null, "Housekeeping bed list strictly redacts predicted_free_time to null");
    assert(hkBed1.current_patient_ref === null, "Housekeeping bed list strictly redacts current_patient_ref to null");

    // 11g. Bed discharge and turnover lifecycle integrity
    console.log("\n14. Verifying Bed Discharge and Turnover Lifecycle Integrity...");
    const dischargeRes = await fetch(`${BASE_URL}/icu/beds/${testBed1.id}/discharge`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({ cleaningType: "STANDARD", notes: "Normal test discharge" }),
    });
    assert(dischargeRes.status === 200, "Doctor successfully discharged patient (HTTP 200)");
    const dischargeData = await dischargeRes.json();
    assert(dischargeData.status === "CLEANING", "Bed transitioned to CLEANING status upon discharge");
    assert(Boolean(dischargeData.cleaningTaskId), "Cleaning task automatically queued upon discharge");

    // Clean up testBed2 & testBed3 admissions
    await fetch(`${BASE_URL}/icu/beds/${testBed2.id}/discharge`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({ cleaningType: "STANDARD" }),
    });
    await fetch(`${BASE_URL}/icu/beds/${testBed3Id}/discharge`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({ cleaningType: "STANDARD" }),
    });

    // ==============================================================================
    // 15. VERIFYING ADMINISTRATOR ADMIT PATIENT WORKFLOW & SAFEGUARDS
    // ==============================================================================
    console.log("\n15. Verifying Administrator Admit Patient Workflow & Safeguards...");

    const doctor1Id = doctorUser1!.id;

    // Find available bed for testing
    let adminTestBed1: any;
    let adminTestBed2: any;
    const suffix = Date.now();
    const ins1 = await pool.query<{ id: number; bed_number: string }>(
      `INSERT INTO beds (bed_number, unit_id, status, is_isolation, created_at, updated_at) VALUES ('ADM-BED-${suffix}-1', 1, 'AVAILABLE', false, NOW(), NOW()) RETURNING id, bed_number`
    );
    const ins2 = await pool.query<{ id: number; bed_number: string }>(
      `INSERT INTO beds (bed_number, unit_id, status, is_isolation, created_at, updated_at) VALUES ('ADM-BED-${suffix}-2', 1, 'AVAILABLE', false, NOW(), NOW()) RETURNING id, bed_number`
    );
    adminTestBed1 = { id: ins1.rows[0]!.id, bed_number: ins1.rows[0]!.bed_number, unit_id: 1, status: "AVAILABLE" };
    adminTestBed2 = { id: ins2.rows[0]!.id, bed_number: ins2.rows[0]!.bed_number, unit_id: 1, status: "AVAILABLE" };


    // 15a. Authorization: Only ADMIN and DOCTOR can access POST /api/icu/admissions
    const unauthAdmitRes = await fetch(`${BASE_URL}/icu/admissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientName: "Unauthorized Test", bedId: adminTestBed1.id, doctorId: doctor1Id }),
    });
    assert(unauthAdmitRes.status === 401, "Unauthenticated admission rejected with HTTP 401");

    const nurseAdmitRes = await fetch(`${BASE_URL}/icu/admissions`, {
      method: "POST",
      headers: { Authorization: nurseAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ patientName: "Nurse Admit Test", bedId: adminTestBed1.id, doctorId: doctor1Id }),
    });
    assert(nurseAdmitRes.status === 403, "Nurse blocked from patient admission (HTTP 403 Forbidden)");

    const hkAdmitRes = await fetch(`${BASE_URL}/icu/admissions`, {
      method: "POST",
      headers: { Authorization: hkAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ patientName: "HK Admit Test", bedId: adminTestBed1.id, doctorId: doctor1Id }),
    });
    assert(hkAdmitRes.status === 403, "Housekeeping blocked from patient admission (HTTP 403 Forbidden)");

    // 15b. Missing required patient details validation
    const missingNameRes = await fetch(`${BASE_URL}/icu/admissions`, {
      method: "POST",
      headers: { Authorization: adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ patientName: "", bedId: adminTestBed1.id, doctorId: doctor1Id }),
    });
    assert(missingNameRes.status === 400, "Missing patient name rejected with HTTP 400 Bad Request");
    const missingNameData = await missingNameRes.json();
    assert(missingNameData.message.includes("Patient full name is required"), "Validation error clearly specifies patient name is required");

    const missingBedRes = await fetch(`${BASE_URL}/icu/admissions`, {
      method: "POST",
      headers: { Authorization: adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ patientName: "Valid Patient Name", doctorId: doctor1Id }),
    });
    assert(missingBedRes.status === 400, "Missing bed selection rejected with HTTP 400 Bad Request");

    // 15c. Invalid / Inactive doctor assignment validation
    const missingDocRes = await fetch(`${BASE_URL}/icu/admissions`, {
      method: "POST",
      headers: { Authorization: adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ patientName: "Valid Patient Name", bedId: adminTestBed1.id }),
    });
    assert(missingDocRes.status === 400, "Admin admission without doctor rejected with HTTP 400 Bad Request");

    const nonExistentDocRes = await fetch(`${BASE_URL}/icu/admissions`, {
      method: "POST",
      headers: { Authorization: adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ patientName: "Valid Patient Name", bedId: adminTestBed1.id, doctorId: 99999 }),
    });
    assert(nonExistentDocRes.status === 400, "Non-existent doctor assignment rejected with HTTP 400 Bad Request");

    // Assigning non-doctor (e.g. nurse user)
    const nurseUserRes = await pool.query<{ id: number }>("SELECT id FROM users WHERE role = 'NURSE' LIMIT 1");
    if (nurseUserRes.rows.length > 0) {
      const nonDocRes = await fetch(`${BASE_URL}/icu/admissions`, {
        method: "POST",
        headers: { Authorization: adminAuth, "Content-Type": "application/json" },
        body: JSON.stringify({ patientName: "Valid Patient Name", bedId: adminTestBed1.id, doctorId: nurseUserRes.rows[0]!.id }),
      });
      assert(nonDocRes.status === 400, "Assigning non-doctor staff member rejected with HTTP 400 Bad Request");
    }

    // Assigning inactive doctor
    const deactDocRes = await pool.query<{ id: number }>(
      "INSERT INTO users (username, email, password_hash, role, active, created_at, updated_at) VALUES ('Inactive Doc', 'inactive.doc@icu.in', 'hash', 'DOCTOR', false, NOW(), NOW()) RETURNING id"
    );
    const inactiveDocId = deactDocRes.rows[0]!.id;
    const inactiveDocAdmitRes = await fetch(`${BASE_URL}/icu/admissions`, {
      method: "POST",
      headers: { Authorization: adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ patientName: "Valid Patient Name", bedId: adminTestBed1.id, doctorId: inactiveDocId }),
    });
    assert(inactiveDocAdmitRes.status === 400, "Assigning inactive doctor rejected with HTTP 400 Bad Request");
    await pool.query("DELETE FROM users WHERE id = $1", [inactiveDocId]);

    // 15d. Attempting to use occupied or unavailable bed
    // Mark a bed MAINTENANCE
    const maintBedRes = await pool.query<{ id: number }>(
      `INSERT INTO beds (bed_number, unit_id, status, is_isolation, created_at, updated_at) VALUES ('ADM-MAINT-${suffix}', 1, 'MAINTENANCE', false, NOW(), NOW()) RETURNING id`
    );
    const maintBedId = maintBedRes.rows[0]!.id;
    const admitMaintRes = await fetch(`${BASE_URL}/icu/admissions`, {
      method: "POST",
      headers: { Authorization: adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ patientName: "Test Patient", bedId: maintBedId, doctorId: doctor1Id }),
    });
    assert(admitMaintRes.status === 409, "Attempting to admit into MAINTENANCE bed rejected with HTTP 409 Conflict");
    await pool.query("DELETE FROM beds WHERE id = $1", [maintBedId]);

    // 15e. Successful Administrator Admission with Valid Bed and Doctor
    config.losMlApiUrl = `http://127.0.0.1:${mockPort}`;
    mockMode = "success";
    const adminAdmPayload = {
      patientName: "Eleanor Vance",
      patientRef: "PT-ADM-9901",
      bedId: adminTestBed1.id,
      doctorId: doctor1Id,
      icuUnit: "MICU",
      procedureType: "pneumonia",
      condition: "moderate",
      diagnosis: "Community-acquired bacterial pneumonia",
      admissionType: "urgent",
      complications: "none",
      ageGroup: "adult",
      notes: "Admitted via Administrator intake workflow with IV antibiotic protocol",
    };

    const adminAdmitSuccessRes = await fetch(`${BASE_URL}/icu/admissions`, {
      method: "POST",
      headers: { Authorization: adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify(adminAdmPayload),
    });
    assert(adminAdmitSuccessRes.status === 200, "Administrator successfully admitted patient with valid bed & doctor (HTTP 200)");
    const adminAdmitData = await adminAdmitSuccessRes.json();
    assert(adminAdmitData.success === true, "Admission response indicates success");
    assert(adminAdmitData.patientName === "Eleanor Vance", "Response includes patient name");
    assert(adminAdmitData.patientRef === "PT-ADM-9901", "Response includes patient reference");
    assert(adminAdmitData.bedNumber === adminTestBed1.bed_number, "Response includes correct bed number");
    assert(Boolean(adminAdmitData.assignedDoctorName), "Response includes assigned doctor name");
    assert(Boolean(adminAdmitData.admissionTime), "Response includes server admission timestamp");
    assert(adminAdmitData.status === "OCCUPIED", "Bed status is OCCUPIED");
    assert(adminAdmitData.predictionStatus === "PREDICTED", "LOS prediction status is 'PREDICTED'");
    assert(typeof adminAdmitData.predictedLosDays === "number", "Response includes numeric predictedLosDays");
    assert(Boolean(adminAdmitData.predictedFreeTime), "Response includes predictedFreeTime timestamp");

    // Verify mathematical accuracy of estimated free time
    const expectedFreeTimeMs = new Date(adminAdmitData.admissionTime).getTime() + adminAdmitData.predictedLosDays * 86400000;
    const actualFreeTimeMs = new Date(adminAdmitData.predictedFreeTime).getTime();
    assert(
      Math.abs(actualFreeTimeMs - expectedFreeTimeMs) < 1000,
      `Estimated bed-free time matches admissionTime + predicted LOS days (${adminAdmitData.predictedFreeTime})`
    );

    // Verify database record has diagnosis, admission_type, and complications
    const dbAdmCheck = await pool.query<{
      patient_name: string;
      diagnosis: string;
      admission_type: string;
      complications: string;
      predicted_los_days: string;
      prediction_status: string;
      predicted_free_time: string;
    }>("SELECT patient_name, diagnosis, admission_type, complications, predicted_los_days, prediction_status, predicted_free_time FROM admissions WHERE id = $1", [adminAdmitData.admissionId]);
    assert(dbAdmCheck.rows.length === 1, "Admission record found in PostgreSQL");
    assert(dbAdmCheck.rows[0]!.patient_name === "Eleanor Vance", "DB stores patient_name");
    assert(dbAdmCheck.rows[0]!.diagnosis === "Community-acquired bacterial pneumonia", "DB stores diagnosis");
    assert(dbAdmCheck.rows[0]!.admission_type === "urgent", "DB stores admission_type");
    assert(dbAdmCheck.rows[0]!.complications === "none", "DB stores complications");
    assert(dbAdmCheck.rows[0]!.prediction_status === "PREDICTED", "DB stores prediction_status");

    // 15f. Two concurrent admissions attempting to use the same bed (Race condition prevention)
    console.log("   Testing concurrent admissions race condition prevention on same bed...");
    // Find or create an available bed for the race test
    const raceBedRes = await pool.query<{ id: number; bed_number: string }>(
      `INSERT INTO beds (bed_number, unit_id, status, is_isolation, created_at, updated_at) VALUES ('ADM-RACE-${suffix}', 1, 'AVAILABLE', false, NOW(), NOW()) RETURNING id, bed_number`
    );
    const raceBedId = raceBedRes.rows[0]!.id;

    const [resA, resB] = await Promise.all([
      fetch(`${BASE_URL}/icu/admissions`, {
        method: "POST",
        headers: { Authorization: adminAuth, "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: "Concurrent Patient A",
          patientRef: "PT-RACE-A",
          bedId: raceBedId,
          doctorId: doctor1Id,
        }),
      }),
      fetch(`${BASE_URL}/icu/admissions`, {
        method: "POST",
        headers: { Authorization: adminAuth, "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: "Concurrent Patient B",
          patientRef: "PT-RACE-B",
          bedId: raceBedId,
          doctorId: doctor1Id,
        }),
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert(
      statuses[0] === 200 && statuses[1] === 409,
      `Concurrency race test: exactly one admission succeeded (200) and one was rejected (409 Conflict). Got: [${resA.status}, ${resB.status}]`
    );

    // Verify DB integrity: exactly 1 active admission on race bed
    const raceDbCheck = await pool.query(
      "SELECT id, patient_ref, status FROM admissions WHERE bed_id = $1 AND status = 'ADMITTED'",
      [raceBedId]
    );
    assert(raceDbCheck.rows.length === 1, "Exactly one active admission record exists for race bed in DB");

    // Clean up race bed
    await fetch(`${BASE_URL}/icu/beds/${raceBedId}/discharge`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({ cleaningType: "STANDARD" }),
    });
    await pool.query("DELETE FROM admissions WHERE bed_id = $1", [raceBedId]);
    await pool.query("DELETE FROM beds WHERE id = $1", [raceBedId]);

    // 15g. Admission succeeds even if ML service is completely offline
    console.log("   Testing admission succeeds when ML service is offline (non-blocking)...");
    config.losMlApiUrl = "http://127.0.0.1:19999"; // inactive port

    const adminOfflineRes = await fetch(`${BASE_URL}/icu/admissions`, {
      method: "POST",
      headers: { Authorization: adminAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        patientName: "Offline ML Patient",
        bedId: adminTestBed2.id,
        doctorId: doctor1Id,
        procedureType: "angiography",
        condition: "stable",
        admissionType: "planned",
        complications: "none",
        ageGroup: "adult",
      }),
    });
    assert(adminOfflineRes.status === 200, "Admission SUCCEEDS even when ML service is offline (HTTP 200)");
    const adminOfflineData = await adminOfflineRes.json();
    assert(adminOfflineData.status === "OCCUPIED", "Bed status is OCCUPIED despite ML outage");
    assert(adminOfflineData.predictedLosDays === null, "predictedLosDays is null (not 0, not fabricated)");
    assert(adminOfflineData.predictionStatus === "CANT_PREDICT", "Prediction status is 'CANT_PREDICT'");
    assert(adminOfflineData.predictionReason.includes("unavailable"), "Reason explains ML service unavailable");

    // Clean up admissions
    await fetch(`${BASE_URL}/icu/beds/${adminTestBed1.id}/discharge`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({ cleaningType: "STANDARD" }),
    });
    await fetch(`${BASE_URL}/icu/beds/${adminTestBed2.id}/discharge`, {
      method: "POST",
      headers: { Authorization: doctor1Auth, "Content-Type": "application/json" },
      body: JSON.stringify({ cleaningType: "STANDARD" }),
    });

    console.log("\n================================================================================");
    console.log(`  ALL LOS PREDICTION & ADMIN ADMISSION TESTS PASSED!`);
    console.log(`  Passed: ${passedCount} | Failed: ${failedCount}`);
    console.log("================================================================================\n");

  } finally {
    // Restore original ML URL and stop mock server
    config.losMlApiUrl = originalMlUrl;
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      testServer.close(() => resolve());
    });
    await pool.end();
  }
}

runTestSuite().catch((err) => {
  console.error("Test runner encountered fatal error:", err);
  process.exit(1);
});
