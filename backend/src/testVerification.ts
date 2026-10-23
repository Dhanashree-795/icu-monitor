import { pool } from "./db/index";

const BASE_URL = "http://localhost:5000/api";

interface LoginResponse {
  message: string;
  token: string;
  user: {
    id: number;
    email: string;
    role: string;
  };
}

async function login(email: string, portalRole: string, password = "Demo@ICU2026"): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, portalRole }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Login failed for ${email} (${portalRole}): ${res.status} - ${err}`);
  }
  const data = (await res.json()) as LoginResponse;
  return data.token;
}

async function runTests() {
  console.log("=== STARTING ICU BED MANAGEMENT VERIFICATION TESTS ===\n");
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passedCount++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failedCount++;
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  try {
    // 1. Authenticate all 4 roles
    console.log("1. Authenticating all 4 role portals...");
    const adminToken = await login("admin@admin.icu.in", "admin");
    const doctorToken = await login("doctor@doctor.icu.in", "doctor");
    const nurseToken = await login("nurse@nurse.icu.in", "nurse");
    const hkToken = await login("housekeeping@housekeeping.icu.in", "housekeeping");
    assert(Boolean(adminToken && doctorToken && nurseToken && hkToken), "All 4 portal logins authenticated with bcrypt");

    // 2. Test Role Permissions & Access Control (Backend 403 Enforcement)
    console.log("\n2. Testing Backend Role Enforcement...");

    // Housekeeping attempting clinical admission
    const hkAdmitRes = await fetch(`${BASE_URL}/icu/beds/1/admit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hkToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ patientRef: "PT-TEST-001" }),
    });
    assert(hkAdmitRes.status === 403, "Housekeeping blocked from patient admission (HTTP 403)");

    // Doctor attempting unit creation
    const docUnitRes = await fetch(`${BASE_URL}/icu/units`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${doctorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Unauthorized Unit", capacity: 10 }),
    });
    assert(docUnitRes.status === 403, "Doctor blocked from creating ICU units (HTTP 403)");

    // Doctor attempting to start cleaning
    const docCleanRes = await fetch(`${BASE_URL}/icu/cleaning-tasks/1/start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${doctorToken}`,
      },
    });
    assert(docCleanRes.status === 403, "Doctor blocked from cleaning task execution (HTTP 403)");

    // Housekeeping attempting to view admissions
    const hkAdmissionsRes = await fetch(`${BASE_URL}/icu/admissions`, {
      headers: {
        Authorization: `Bearer ${hkToken}`,
      },
    });
    assert(hkAdmissionsRes.status === 403, "Housekeeping blocked from viewing clinical admissions (HTTP 403)");

    // 3. Test Full Clinical Lifecycle: Bed Selection -> Admission -> Discharge -> Cleaning -> Available
    console.log("\n3. Testing End-to-End Clinical Lifecycle & Transitions...");

    // Find or reset an AVAILABLE bed
    const bedsRes = await fetch(`${BASE_URL}/icu/beds?status=AVAILABLE`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    const availableBeds = (await bedsRes.json()) as any[];
    assert(availableBeds.length > 0, "Found available beds in database");
    const testBed = availableBeds[0];
    const testBedId = testBed.id;
    console.log(`   Using Bed ${testBed.bed_number} (ID: ${testBedId}) for clinical test cycle`);

    // Doctor admits synthetic patient
    const admitRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}/admit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${doctorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientRef: "PT-VERIF-882",
        expectedDischargeHours: 24,
        notes: "Automated verification test admission",
      }),
    });
    assert(admitRes.status === 200, "Doctor successfully admitted patient (HTTP 200)");
    const admitData = await admitRes.json();
    assert(admitData.status === "OCCUPIED", "Bed status updated to OCCUPIED");
    assert(admitData.patientRef === "PT-VERIF-882", "Bed references synthetic patient PT-VERIF-882");

    // Attempting double-admission on OCCUPIED bed must fail (409 Conflict)
    const doubleAdmitRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}/admit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${doctorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ patientRef: "PT-CONFLICT" }),
    });
    assert(doubleAdmitRes.status === 409, "Double admission on occupied bed rejected with HTTP 409 Conflict");

    // Doctor discharges patient -> auto-generates cleaning task and transitions to CLEANING
    const dischargeRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}/discharge`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${doctorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskType: "STANDARD",
        notes: "Routine discharge turnover required",
      }),
    });
    assert(dischargeRes.status === 200, "Discharge completed successfully (HTTP 200)");
    const dischargeData = await dischargeRes.json();
    assert(dischargeData.status === "CLEANING", "Bed status automatically transitioned to CLEANING");
    assert(Boolean(dischargeData.cleaningTaskId), "Cleaning task automatically created");
    const taskId = dischargeData.cleaningTaskId;
    console.log(`   Turnover cleaning task #${taskId} created for Bed ${testBed.bed_number}`);

    // Housekeeping starts cleaning task
    const startCleanRes = await fetch(`${BASE_URL}/icu/cleaning-tasks/${taskId}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${hkToken}` },
    });
    assert(startCleanRes.status === 200, "Housekeeping started cleaning task (HTTP 200)");
    const startCleanData = await startCleanRes.json();
    assert(startCleanData.status === "IN_PROGRESS", "Task status is now IN_PROGRESS");

    // Housekeeping completes cleaning task -> Bed status returns to AVAILABLE
    const completeCleanRes = await fetch(`${BASE_URL}/icu/cleaning-tasks/${taskId}/complete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${hkToken}` },
    });
    assert(completeCleanRes.status === 200, "Housekeeping completed cleaning task (HTTP 200)");
    const completeCleanData = await completeCleanRes.json();
    assert(completeCleanData.bedStatus === "AVAILABLE", "Task completed and bed returned to AVAILABLE");

    // Verify bed is now AVAILABLE in database
    const verifyBedRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    const verifyBedData = await verifyBedRes.json();
    assert(verifyBedData.bed.status === "AVAILABLE", "Bed status returned to AVAILABLE after cleaning completion");

    // 4. Test Bed Reservation and Maintenance Actions (Nurse Role)
    console.log("\n4. Testing Nurse Bed Reservation and Maintenance Actions...");

    // Nurse reserves bed
    const reserveRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}/reserve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nurseToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notes: "Reserved for incoming cardiac transfer" }),
    });
    assert(reserveRes.status === 200, "Nurse reserved bed (HTTP 200)");

    // Nurse releases reservation
    const releaseRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}/release-reservation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${nurseToken}` },
    });
    assert(releaseRes.status === 200, "Nurse released reservation (HTTP 200)");

    // Nurse puts bed into maintenance
    const maintRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}/maintenance`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nurseToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "Ventilator hose replacement and sensor calibration" }),
    });
    assert(maintRes.status === 200, "Nurse marked bed for maintenance (HTTP 200)");

    // Nurse completes maintenance with cleaning requirement
    const compMaintRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}/complete-maintenance`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nurseToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requiresCleaning: true,
      }),
    });
    assert(compMaintRes.status === 200, "Nurse completed maintenance and scheduled sanitization (HTTP 200)");
    const compMaintData = await compMaintRes.json();
    assert(compMaintData.status === "CLEANING", "Bed transitioned to CLEANING state");
    const maintCleanTaskId = compMaintData.cleaningTaskId;
    assert(Boolean(maintCleanTaskId), "Received cleaningTaskId from maintenance completion");

    // Also test GET /api/icu/cleaning-tasks?status=PENDING
    const tasksRes = await fetch(`${BASE_URL}/icu/cleaning-tasks?status=PENDING`, {
      headers: { Authorization: `Bearer ${hkToken}` },
    });
    assert(tasksRes.status === 200, "Housekeeping can list pending cleaning tasks (HTTP 200)");
    const pendingTasks = await tasksRes.json();
    assert(Array.isArray(pendingTasks), "Cleaning tasks returns an array");

    // Housekeeping completes sanitization
    await fetch(`${BASE_URL}/icu/cleaning-tasks/${maintCleanTaskId}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${hkToken}` },
    });
    await fetch(`${BASE_URL}/icu/cleaning-tasks/${maintCleanTaskId}/complete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${hkToken}` },
    });

    const postMaintBedRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const postMaintBedData = await postMaintBedRes.json();
    assert(postMaintBedData.bed.status === "AVAILABLE", "Bed returned to AVAILABLE after post-maintenance cleaning");

    // 5. Test Dashboard Counts against Raw PostgreSQL Database Ground Truth
    console.log("\n5. Verifying Dashboard Metrics against PostgreSQL Ground Truth...");
    const statsRes = await fetch(`${BASE_URL}/icu/dashboard/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(statsRes.status === 200, "Dashboard stats fetched successfully (HTTP 200)");
    const statsData = await statsRes.json();

    // Query raw DB counts
    const dbTotalRes = await pool.query<{ count: string }>("SELECT COUNT(*) as count FROM beds");
    const dbTotal = parseInt(dbTotalRes.rows[0]?.count || "0", 10);
    assert(statsData.totalBeds === dbTotal, `Dashboard totalBeds (${statsData.totalBeds}) matches DB (${dbTotal})`);

    const dbStatusRes = await pool.query<{ status: string; count: string }>(
      "SELECT status, COUNT(*) as count FROM beds GROUP BY status"
    );
    const dbCounts: Record<string, number> = {};
    for (const row of dbStatusRes.rows) {
      dbCounts[row.status] = parseInt(row.count, 10);
    }

    assert(
      statsData.availableBeds === (dbCounts["AVAILABLE"] || 0),
      `Dashboard availableBeds (${statsData.availableBeds}) matches DB (${dbCounts["AVAILABLE"] || 0})`
    );
    assert(
      statsData.occupiedBeds === (dbCounts["OCCUPIED"] || 0),
      `Dashboard occupiedBeds (${statsData.occupiedBeds}) matches DB (${dbCounts["OCCUPIED"] || 0})`
    );
    assert(
      statsData.reservedBeds === (dbCounts["RESERVED"] || 0),
      `Dashboard reservedBeds (${statsData.reservedBeds}) matches DB (${dbCounts["RESERVED"] || 0})`
    );
    assert(
      statsData.cleaningBeds === (dbCounts["CLEANING"] || 0),
      `Dashboard cleaningBeds (${statsData.cleaningBeds}) matches DB (${dbCounts["CLEANING"] || 0})`
    );
    assert(
      statsData.maintenanceBeds === (dbCounts["MAINTENANCE"] || 0),
      `Dashboard maintenanceBeds (${statsData.maintenanceBeds}) matches DB (${dbCounts["MAINTENANCE"] || 0})`
    );

    // 6. Test Audit Logs
    console.log("\n6. Verifying Audit Logs & Traceability...");
    const auditRes = await fetch(`${BASE_URL}/icu/audit-logs?limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(auditRes.status === 200, "Audit logs fetched successfully (HTTP 200)");
    const auditData = await auditRes.json();
    assert(Array.isArray(auditData) && auditData.length > 0, "Audit trail contains recorded actions");
    const recentActions = auditData.map((a: any) => a.action);
    console.log(`   Recent audited operations: ${recentActions.slice(0, 5).join(", ")}`);

    // 7. Test Housekeeping Role Isolation & Clinical Data Privacy
    console.log("\n7. Verifying Housekeeping Clinical Data Privacy & Redaction...");
    const hkBedsRes = await fetch(`${BASE_URL}/icu/beds`, {
      headers: { Authorization: `Bearer ${hkToken}` },
    });
    assert(hkBedsRes.status === 200, "Housekeeping can list beds (HTTP 200)");
    const hkBedsData = await hkBedsRes.json();
    const hasAnyPatientRef = hkBedsData.some((b: any) => b.current_patient_ref !== null);
    assert(!hasAnyPatientRef, "All patient references strictly redacted from Housekeeping bed list");

    const hasAnyAdmissionNotes = hkBedsData.some((b: any) => b.admission_notes !== null);
    assert(!hasAnyAdmissionNotes, "All clinical admission notes strictly redacted from Housekeeping bed list");

    const hkBedDetailsRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}`, {
      headers: { Authorization: `Bearer ${hkToken}` },
    });
    assert(hkBedDetailsRes.status === 200, "Housekeeping can view bed details (HTTP 200)");
    const hkBedDetailsData = await hkBedDetailsRes.json();
    assert(hkBedDetailsData.bed.current_patient_ref === null, "Patient ref redacted in single bed query");
    const hasAuditPatientLeak = JSON.stringify(hkBedDetailsData.history).includes("PT-VERIF");
    assert(!hasAuditPatientLeak, "Audit logs redact patient IDs for Housekeeping");

    // 8. Test Bed Readiness Intelligence & Simulation Scenarios
    console.log("\n8. Verifying Bed Readiness Intelligence & Simulation Controls...");

    // Housekeeping blocked from readiness endpoint
    const hkReadinessRes = await fetch(`${BASE_URL}/icu/readiness`, {
      headers: { Authorization: `Bearer ${hkToken}` },
    });
    assert(hkReadinessRes.status === 403, "Housekeeping blocked from Bed Readiness Intelligence (HTTP 403)");

    // Doctor and Nurse can access readiness
    const docReadinessRes = await fetch(`${BASE_URL}/icu/readiness`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    assert(docReadinessRes.status === 200, "Doctor can access Bed Readiness Intelligence (HTTP 200)");

    const readinessData = await docReadinessRes.json();
    assert(Boolean(readinessData.summary), "Readiness response contains summary metrics");
    assert(Boolean(readinessData.horizons?.window2h), "Readiness response contains 2-hour window projection");
    assert(Boolean(readinessData.horizons?.window4h), "Readiness response contains 4-hour window projection");
    assert(Boolean(readinessData.horizons?.window8h), "Readiness response contains 8-hour window projection");
    assert(Array.isArray(readinessData.allBeds), "Readiness response includes per-bed projections");
    assert(Array.isArray(readinessData.benchmarks), "Readiness response includes turnover performance benchmarks");

    // Verify confidence labels and explanations
    const sampleBed = readinessData.allBeds[0];
    assert(["HIGH", "MEDIUM", "LOW"].includes(sampleBed.confidence), "Beds have valid confidence labels (HIGH/MEDIUM/LOW)");
    assert(Boolean(sampleBed.confidenceExplanation), "Confidence labels include clear transparent explanations");
    assert(Boolean(sampleBed.reason), "Beds include heuristic estimation reasons");

    // Doctor & Nurse blocked from updating simulation scenario
    const docUpdateScenarioRes = await fetch(`${BASE_URL}/icu/readiness/settings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${doctorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scenario: "Surge" }),
    });
    assert(docUpdateScenarioRes.status === 403, "Doctor blocked from modifying simulation scenarios (HTTP 403)");

    const nurseUpdateScenarioRes = await fetch(`${BASE_URL}/icu/readiness/settings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nurseToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scenario: "Surge" }),
    });
    assert(nurseUpdateScenarioRes.status === 403, "Nurse blocked from modifying simulation scenarios (HTTP 403)");

    // Admin can update simulation scenario to Surge
    const adminUpdateScenarioRes = await fetch(`${BASE_URL}/icu/readiness/settings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scenario: "Surge", warningBufferBeds: 4 }),
    });
    assert(adminUpdateScenarioRes.status === 200, "Admin successfully updated simulation scenario to Surge (HTTP 200)");

    // Verify readiness reflects Surge scenario and evaluates capacity warning
    const surgeReadinessRes = await fetch(`${BASE_URL}/icu/readiness`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const surgeReadinessData = await surgeReadinessRes.json();
    assert(surgeReadinessData.scenario.current === "Surge", "Readiness reflects active 'Surge' simulation scenario");
    assert(surgeReadinessData.scenario.simulatedDemand === 5, "Surge scenario models +5 incoming demand requests");

    // Admin resets simulation scenario back to Normal
    const resetScenarioRes = await fetch(`${BASE_URL}/icu/readiness/settings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scenario: "Normal", warningBufferBeds: 2 }),
    });
    assert(resetScenarioRes.status === 200, "Admin reset simulation scenario back to Normal (HTTP 200)");

    console.log(`\n========================================`);
    console.log(`ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!`);
    console.log(`Passed: ${passedCount} | Failed: ${failedCount}`);
    console.log(`========================================\n`);
  } finally {
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error("Verification test runner encountered an error:", err);
  process.exit(1);
});
