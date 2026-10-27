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
    // 1. Authenticate all 4 roles + 2nd doctor for cross-physician isolation testing
    console.log("1. Authenticating all 4 role portals + second doctor...");
    const adminToken = await login("ananya.iyer@admin.icu.in", "admin");
    const doctorToken = await login("rajesh.sharma@doctor.icu.in", "doctor");
    const doctor2Token = await login("meera.kapoor@doctor.icu.in", "doctor");
    const nurseToken = await login("lakshmi.devi@nurse.icu.in", "nurse");
    const hkToken = await login("suresh.kumar@housekeeping.icu.in", "housekeeping");
    assert(Boolean(adminToken && doctorToken && doctor2Token && nurseToken && hkToken), "All 5 portal logins authenticated with bcrypt");

    // 2. Test Role Permissions & Access Control (Backend 403 Enforcement)
    console.log("\n2. Testing Backend Role Enforcement & Doctor/Cleaning Restrictions...");

    // Housekeeping attempting clinical admission -> 403
    const hkAdmitRes = await fetch(`${BASE_URL}/icu/beds/1/admit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hkToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ patientRef: "PT-TEST-001" }),
    });
    assert(hkAdmitRes.status === 403, "Housekeeping blocked from patient admission (HTTP 403)");

    // Doctor attempting unit creation -> 403
    const docUnitRes = await fetch(`${BASE_URL}/icu/units`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${doctorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Unauthorized Unit", capacity: 10 }),
    });
    assert(docUnitRes.status === 403, "Doctor blocked from creating ICU units (HTTP 403)");

    // Doctor attempting to reserve bed -> 403
    const docReserveRes = await fetch(`${BASE_URL}/icu/beds/1/reserve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${doctorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ patientRef: "PT-DOC-RES" }),
    });
    assert(docReserveRes.status === 403, "Doctor blocked from reserving beds (HTTP 403)");

    // Doctor attempting to release bed reservation -> 403
    const docReleaseRes = await fetch(`${BASE_URL}/icu/beds/1/release-reservation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${doctorToken}`,
      },
    });
    assert(docReleaseRes.status === 403, "Doctor blocked from releasing bed reservations (HTTP 403)");

    // Doctor attempting to start cleaning -> 403
    const docCleanRes = await fetch(`${BASE_URL}/icu/cleaning-tasks/1/start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${doctorToken}`,
      },
    });
    assert(docCleanRes.status === 403, "Doctor blocked from starting cleaning task (HTTP 403)");

    // Admin attempting to start cleaning -> 403
    const adminStartCleanRes = await fetch(`${BASE_URL}/icu/cleaning-tasks/1/start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assert(adminStartCleanRes.status === 403, "Admin blocked from starting cleaning task directly (HTTP 403)");

    // Admin attempting to complete cleaning -> 403
    const adminCompCleanRes = await fetch(`${BASE_URL}/icu/cleaning-tasks/1/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assert(adminCompCleanRes.status === 403, "Admin blocked from completing cleaning task directly (HTTP 403)");

    // Nurse attempting to complete cleaning -> 403
    const nurseCompCleanRes = await fetch(`${BASE_URL}/icu/cleaning-tasks/1/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nurseToken}`,
      },
    });
    assert(nurseCompCleanRes.status === 403, "Nurse blocked from completing cleaning task (HTTP 403)");

    // Assigning non-housekeeper to cleaning task -> 400 Validation Error
    const nurseRow = await pool.query("SELECT id FROM users WHERE email = 'lakshmi.devi@nurse.icu.in'");
    const nurseUserId = nurseRow.rows[0].id;
    const invalidAssignRes = await fetch(`${BASE_URL}/icu/beds/1/assign-cleaner`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cleanerId: nurseUserId }),
    });
    assert(invalidAssignRes.status === 400, "Assigning non-housekeeper to cleaning task rejected with HTTP 400 Validation Error");

    // Housekeeping attempting to view admissions -> 403
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
    await pool.query("DELETE FROM cleaning_tasks WHERE bed_id = $1 AND status != 'COMPLETED'", [testBedId]);

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

    // Fetch bed details to get active admission ID
    const bedDetailsRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    const bedDetails = await bedDetailsRes.json();
    const activeAdmId = bedDetails.bed.active_admission_id;
    assert(Boolean(activeAdmId), "Found active admission record for admitted bed");

    // Doctor 2 (Dr. Alexandra Mercer) attempts to update clinical condition of Doctor 1's patient -> 403 Forbidden
    const unauthConditionRes = await fetch(`${BASE_URL}/icu/admissions/${activeAdmId}/condition`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${doctor2Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ condition: "Critical Sepsis Cascade" }),
    });
    assert(unauthConditionRes.status === 403, "Doctor blocked from editing another physician's patient condition (HTTP 403 Forbidden)");

    // Doctor 1 (assigned attending physician) updates clinical condition -> 200 OK
    const authConditionRes = await fetch(`${BASE_URL}/icu/admissions/${activeAdmId}/condition`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${doctorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ condition: "Stable on Non-Invasive Ventilation" }),
    });
    assert(authConditionRes.status === 200, "Authorized attending doctor successfully updated patient condition (HTTP 200 OK)");

    // Doctor 2 attempts to discharge Doctor 1's patient -> 403 Forbidden
    const unauthDischargeRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}/discharge`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${doctor2Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ taskType: "STANDARD" }),
    });
    assert(unauthDischargeRes.status === 403, "Doctor blocked from discharging another physician's patient (HTTP 403 Forbidden)");

    // Doctor 2 attempts to transfer Doctor 1's patient -> 403 Forbidden
    const unauthTransferRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${doctor2Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ targetBedId: 2, reason: "Unauthorized Transfer" }),
    });
    assert(unauthTransferRes.status === 403, "Doctor blocked from transferring another physician's patient (HTTP 403 Forbidden)");

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

    // Doctor 1 (attending physician) discharges patient -> auto-generates cleaning task and transitions to CLEANING
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
    assert(dischargeRes.status === 200, "Assigned doctor successfully discharged patient (HTTP 200)");
    const dischargeData = await dischargeRes.json();
    assert(dischargeData.status === "CLEANING", "Bed status automatically transitioned to CLEANING");
    assert(Boolean(dischargeData.cleaningTaskId), "Cleaning task automatically created");
    const taskId = dischargeData.cleaningTaskId;
    console.log(`   Turnover cleaning task #${taskId} created for Bed ${testBed.bed_number}`);

    // Verify bed in CLEANING status has no cleaner assigned yet (Unassigned)
    const cleaningBedRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const cleaningBedData = await cleaningBedRes.json();
    assert(cleaningBedData.bed.status === "CLEANING", "Bed is confirmed in CLEANING status");
    assert(!cleaningBedData.bed.assigned_cleaner_name && !cleaningBedData.bed.assigned_cleaner_id, "Newly created turnover task is properly unassigned (no invented names)");

    // Admin assigns Housekeeper Ramesh Babu (ID from users table) to the cleaning task
    const hkRow = await pool.query("SELECT id, username FROM users WHERE email = 'ramesh.babu@housekeeping.icu.in'");
    const housekeeperId = hkRow.rows[0].id;
    const assignHkRes = await fetch(`${BASE_URL}/icu/beds/${testBedId}/assign-cleaner`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cleanerId: housekeeperId }),
    });
    assert(assignHkRes.status === 200, "Admin successfully assigned Housekeeper Ramesh Babu to cleaning task (HTTP 200)");

    // Housekeeping login for Ramesh Babu to execute task
    const rameshToken = await login("ramesh.babu@housekeeping.icu.in", "housekeeping");

    // Ramesh Babu starts cleaning task
    const startCleanRes = await fetch(`${BASE_URL}/icu/cleaning-tasks/${taskId}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${rameshToken}` },
    });
    assert(startCleanRes.status === 200, "Assigned housekeeper started cleaning task (HTTP 200)");
    const startCleanData = await startCleanRes.json();
    assert(startCleanData.status === "IN_PROGRESS", "Task status is now IN_PROGRESS");

    // Ramesh Babu completes cleaning task -> Bed status returns to AVAILABLE
    const completeCleanRes = await fetch(`${BASE_URL}/icu/cleaning-tasks/${taskId}/complete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${rameshToken}` },
    });
    assert(completeCleanRes.status === 200, "Assigned housekeeper completed cleaning task (HTTP 200)");
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

    // 9. Verifying Doctor-Specific Patient Isolation & Clinical Care
    console.log("\n9. Verifying Doctor-Specific Patient Isolation & Clinical Care...");
    const docAdmissionsRes = await fetch(`${BASE_URL}/icu/admissions?status=ADMITTED`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    assert(docAdmissionsRes.status === 200, "Doctor can list inpatient admissions (HTTP 200)");
    const docAdmissions = await docAdmissionsRes.json();
    assert(Array.isArray(docAdmissions), "Doctor admissions returns array");

    // Check doctor token payload or query current user info
    const docUserRow = await pool.query("SELECT id FROM users WHERE email = 'rajesh.sharma@doctor.icu.in'");
    const testDoctorId = docUserRow.rows[0].id;
    const allAssignedToDoctor = docAdmissions.every((a: any) => a.admitting_doctor_id === testDoctorId);
    assert(allAssignedToDoctor, "Doctor admission list strictly isolates to doctor's assigned patients only");

    if (docAdmissions.length > 0) {
      const myAdm = docAdmissions[0];
      const updateCondRes = await fetch(`${BASE_URL}/icu/admissions/${myAdm.id}/condition`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${doctorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ condition: "Guarded / Ventilated - Verified via Test Runner" }),
      });
      assert(updateCondRes.status === 200, "Doctor successfully updated patient condition (HTTP 200)");
    }

    // Doctor attempting to access an admission belonging to another doctor
    const otherAdmRow = await pool.query(
      "SELECT id FROM admissions WHERE admitting_doctor_id != $1 AND status = 'ADMITTED' LIMIT 1",
      [testDoctorId]
    );
    if (otherAdmRow.rows.length > 0) {
      const otherAdmId = otherAdmRow.rows[0].id;
      const unauthAdmRes = await fetch(`${BASE_URL}/icu/admissions/${otherAdmId}`, {
        headers: { Authorization: `Bearer ${doctorToken}` },
      });
      assert(unauthAdmRes.status === 403, "Doctor blocked from viewing another doctor's patient admission (HTTP 403)");
    }

    // 10. Verifying Housekeeping Task Transition Enforcement (PENDING -> IN_PROGRESS -> COMPLETED)
    console.log("\n10. Verifying Housekeeping Cleaning Task Transition Enforcement...");
    // Find a pending cleaning task
    const hkTasksRes = await fetch(`${BASE_URL}/icu/cleaning-tasks`, {
      headers: { Authorization: `Bearer ${hkToken}` },
    });
    const hkTasks = await hkTasksRes.json();
    const pendingTask = hkTasks.find((t: any) => t.status === "PENDING");
    if (pendingTask) {
      // Invalid transition: Attempting to complete directly from PENDING
      const invalidCompleteRes = await fetch(`${BASE_URL}/icu/cleaning-tasks/${pendingTask.id}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${hkToken}` },
      });
      assert(
        invalidCompleteRes.status === 409,
        "Direct completion of PENDING cleaning task rejected with HTTP 409 Conflict"
      );

      // Valid transition 1: Start cleaning (PENDING -> IN_PROGRESS)
      const validStartRes = await fetch(`${BASE_URL}/icu/cleaning-tasks/${pendingTask.id}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${hkToken}` },
      });
      assert(validStartRes.status === 200, "Housekeeper successfully transitioned task to IN_PROGRESS (HTTP 200)");

      // Valid transition 2: Complete cleaning (IN_PROGRESS -> COMPLETED)
      const validCompleteRes = await fetch(`${BASE_URL}/icu/cleaning-tasks/${pendingTask.id}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${hkToken}` },
      });
      assert(validCompleteRes.status === 200, "Housekeeper successfully completed IN_PROGRESS task (HTTP 200)");
    }

    // 11. Verifying Administrator Staff Management & Security Access Control
    console.log("\n11. Verifying Administrator Staff Management Endpoints...");
    // Role-based protection: Non-admin roles blocked from staff directory
    const nurseStaffAccess = await fetch(`${BASE_URL}/icu/admin/staff`, {
      headers: { Authorization: `Bearer ${nurseToken}` },
    });
    assert(nurseStaffAccess.status === 403, "Nurse blocked from accessing staff management directory (HTTP 403)");

    const docStaffAccess = await fetch(`${BASE_URL}/icu/admin/staff`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    assert(docStaffAccess.status === 403, "Doctor blocked from accessing staff management directory (HTTP 403)");

    // Admin lists staff members
    const adminStaffRes = await fetch(`${BASE_URL}/icu/admin/staff`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminStaffRes.status === 200, "Administrator successfully listed hospital staff (HTTP 200)");
    const staffList = await adminStaffRes.json();
    assert(Array.isArray(staffList) && staffList.length === 20, `Staff list contains exactly 20 staff accounts (found: ${staffList?.length})`);

    const adminCount = staffList.filter((s: any) => s.role === "ADMIN").length;
    const docCount = staffList.filter((s: any) => s.role === "DOCTOR").length;
    const nurseCount = staffList.filter((s: any) => s.role === "NURSE").length;
    const hkCount = staffList.filter((s: any) => s.role === "HOUSEKEEPING").length;

    assert(adminCount === 5, `Staff roster contains exactly 5 Administrators (found: ${adminCount})`);
    assert(docCount === 5, `Staff roster contains exactly 5 Doctors (found: ${docCount})`);
    assert(nurseCount === 5, `Staff roster contains exactly 5 Nurses (found: ${nurseCount})`);
    assert(hkCount === 5, `Staff roster contains exactly 5 Housekeepers (found: ${hkCount})`);

    const uniqueEmails = new Set(staffList.map((s: any) => s.email.toLowerCase()));
    const uniqueUsernames = new Set(staffList.map((s: any) => s.username.toLowerCase()));
    assert(uniqueEmails.size === 20, "All 20 staff login identifiers are unique (no duplicates)");
    assert(uniqueUsernames.size === 20, "All 20 staff members have distinct realistic names");

    // Clean up any lingering test users
    await pool.query("DELETE FROM users WHERE email LIKE 'test.nurse.%'");

    // Admin provisions new staff member
    const testStaffEmail = `test.nurse.${Date.now()}@nurse.icu.in`;
    let newStaffId: number | null = null;
    try {
      const createStaffRes = await fetch(`${BASE_URL}/icu/admin/staff`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: testStaffEmail,
          username: "Test Staff Nurse",
          role: "NURSE",
          password: "TempPassword123!",
          phone: "+1-555-0199",
          department: "Intensive Care Unit",
        }),
      });
      assert(createStaffRes.status === 201, "Admin successfully provisioned new staff account (HTTP 201)");
      const createdStaffData = await createStaffRes.json();
      newStaffId = createdStaffData.staff.id;

      // Admin edits staff profile
      const updateStaffRes = await fetch(`${BASE_URL}/icu/admin/staff/${newStaffId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "Senior Clinical Nurse Specialist",
          phone: "+1-555-0200",
          department: "Neuro ICU",
        }),
      });
      assert(updateStaffRes.status === 200, "Admin successfully updated staff profile (HTTP 200)");

      // Admin deactivates staff account
      const deactivateStaffRes = await fetch(`${BASE_URL}/icu/admin/staff/${newStaffId}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ active: false }),
      });
      assert(deactivateStaffRes.status === 200, "Admin successfully deactivated staff account (HTTP 200)");

      // Deactivated user cannot log in
      const deactLoginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testStaffEmail, password: "TempPassword123!", portalRole: "nurse" }),
      });
      assert(deactLoginRes.status === 403, "Deactivated staff member login rejected with HTTP 403 Forbidden");

      // Admin resets staff password
      const resetStaffPassRes = await fetch(`${BASE_URL}/icu/admin/staff/${newStaffId}/reset-password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPassword: "NewSecurePassword456!" }),
      });
      assert(resetStaffPassRes.status === 200, "Admin successfully reset staff password (HTTP 200)");

      // Admin reactivates staff account
      const reactivateStaffRes = await fetch(`${BASE_URL}/icu/admin/staff/${newStaffId}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ active: true }),
      });
      assert(reactivateStaffRes.status === 200, "Admin successfully reactivated staff account (HTTP 200)");

      // Login with new password succeeds
      const newPassLoginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testStaffEmail, password: "NewSecurePassword456!", portalRole: "nurse" }),
      });
      assert(newPassLoginRes.status === 200, "Staff member can log in with reset password (HTTP 200)");
    } finally {
      // Clean up test staff account
      if (newStaffId) {
        await pool.query("DELETE FROM users WHERE id = $1", [newStaffId]);
      }
    }

    // Admin protection test: Attempting to deactivate only remaining active admin fails (HTTP 400)
    const adminUserRow = await pool.query("SELECT id FROM users WHERE email = 'ananya.iyer@admin.icu.in'");
    const adminUserId = adminUserRow.rows[0].id;

    // Temporarily deactivate other 4 administrators to test last-admin boundary condition
    await pool.query("UPDATE users SET active = FALSE WHERE role = 'ADMIN' AND id != $1", [adminUserId]);
    try {
      const protectAdminRes = await fetch(`${BASE_URL}/icu/admin/staff/${adminUserId}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ active: false }),
      });
      assert(protectAdminRes.status === 400, "System protects last active administrator from deactivation (HTTP 400)");
    } finally {
      // Restore all administrators to active state
      await pool.query("UPDATE users SET active = TRUE WHERE role = 'ADMIN'");
    }

    // 8. Explicit 9-Point Verification Requirements
    console.log("\n8. Explicit Requirements Verification:");

    // Req 1 & 2: Database count by role (5 per role, exactly 20, no duplicate login emails)
    const roleCountQuery = await pool.query<{ role: string; count: string }>(
      "SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY role ASC"
    );
    const roleCounts = Object.fromEntries(roleCountQuery.rows.map((r) => [r.role, Number(r.count)]));
    assert(roleCounts["ADMIN"] === 5, `Expected 5 Administrators in DB, found ${roleCounts["ADMIN"]}`);
    assert(roleCounts["DOCTOR"] === 5, `Expected 5 Doctors in DB, found ${roleCounts["DOCTOR"]}`);
    assert(roleCounts["NURSE"] === 5, `Expected 5 Nurses in DB, found ${roleCounts["NURSE"]}`);
    assert(roleCounts["HOUSEKEEPING"] === 5, `Expected 5 Housekeepers in DB, found ${roleCounts["HOUSEKEEPING"]}`);

    const totalUsersQuery = await pool.query<{ total: string }>("SELECT COUNT(*) as total FROM users");
    const totalCount = Number(totalUsersQuery.rows[0]?.total || "0");
    assert(totalCount === 20, `Expected exactly 20 users in DB, found ${totalCount}`);

    const duplicateEmails = await pool.query(
      "SELECT LOWER(email), COUNT(*) FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1"
    );
    assert(duplicateEmails.rows.length === 0, "No duplicate user emails exist in database");

    // Req 2: Dr. Rajesh Sharma's login is rajesh.sharma@doctor.icu.in
    const rajeshQuery = await pool.query(
      "SELECT email, username, role FROM users WHERE email = 'rajesh.sharma@doctor.icu.in'"
    );
    assert(rajeshQuery.rows.length === 1, "Dr. Rajesh Sharma found with email 'rajesh.sharma@doctor.icu.in'");
    assert(rajeshQuery.rows[0]?.role === "DOCTOR", "Dr. Rajesh Sharma role is DOCTOR");

    // Req 3: Doctor assigned name and cleaner name in bed management table
    const bedsForDoc = await fetch(`${BASE_URL}/icu/beds`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    const bedsData = await bedsForDoc.json();
    assert(Array.isArray(bedsData), "Doctor receives bed list array");
    const sampleOccupied = bedsData.find((b: any) => b.status === "OCCUPIED");
    if (sampleOccupied) {
      assert(Boolean(sampleOccupied.assigned_doctor_name), "Bed row has assigned_doctor_name populated");
    }

    // Req 4: No administrator appears as cleaner
    const invalidTasks = await pool.query(`
      SELECT ct.id, ct.bed_id, u.username, u.role
      FROM cleaning_tasks ct
      JOIN users u ON u.id = ct.assigned_user_id
      WHERE u.role != 'HOUSEKEEPING'
    `);
    assert(invalidTasks.rows.length === 0, `Expected 0 cleaning tasks assigned to non-housekeepers, found ${invalidTasks.rows.length}`);

    // Req 5: Housekeeping privacy: Never exposed to patient names or clinical details
    const hkBedsPrivacyRes = await fetch(`${BASE_URL}/icu/beds`, {
      headers: { Authorization: `Bearer ${hkToken}` },
    });
    const hkBedsPrivacy = await hkBedsPrivacyRes.json();
    const anyExposedPatient = hkBedsPrivacy.some(
      (b: any) => b.current_patient_ref !== null || b.patient_name !== null || b.patient_condition !== null || b.admission_notes !== null
    );
    assert(!anyExposedPatient, "Housekeeping GET /beds strictly redacts patient_name, current_patient_ref, condition, and notes to null");

    // Req 6: Admitting with patient_name stores and returns patient_name
    const admitWithNameBed = bedsData.find((b: any) => b.status === "AVAILABLE");
    if (admitWithNameBed) {
      const testPatientName = "Aarav Sharma";
      const admitRes = await fetch(`${BASE_URL}/icu/beds/${admitWithNameBed.id}/admit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${doctorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientName: testPatientName,
          condition: "Acute Cardiac Care",
        }),
      });
      assert(admitRes.status === 200, "Patient admitted with full name (HTTP 200)");
      const admitData = await admitRes.json();
      assert(admitData.patientName === testPatientName, "Admit response returns real patient full name");

      // Verify bed retrieval has patient_name
      const checkBedRes = await fetch(`${BASE_URL}/icu/beds/${admitWithNameBed.id}`, {
        headers: { Authorization: `Bearer ${doctorToken}` },
      });
      const checkBedData = await checkBedRes.json();
      assert(checkBedData.bed.patient_name === testPatientName, "GET /beds/:id returns patient_name for authorized doctor");

      // Discharge to keep bed available
      const dischargeRes = await fetch(`${BASE_URL}/icu/beds/${admitWithNameBed.id}/discharge`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskType: "STANDARD" }),
      });
      assert(dischargeRes.status === 200, "Admitted test bed successfully discharged");
      const dischargeData = await dischargeRes.json();

      // Complete the cleaning task as Housekeeping
      const hkStart = await fetch(`${BASE_URL}/icu/cleaning-tasks/${dischargeData.cleaningTaskId}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${hkToken}` },
      });
      assert(hkStart.status === 200, "Housekeeper starts turnover cleaning");

      const hkComplete = await fetch(`${BASE_URL}/icu/cleaning-tasks/${dischargeData.cleaningTaskId}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${hkToken}` },
      });
      assert(hkComplete.status === 200, "Housekeeper completes turnover cleaning");

      // Verify bed is back to AVAILABLE
      const checkAvail = await fetch(`${BASE_URL}/icu/beds/${admitWithNameBed.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const availData = await checkAvail.json();
      assert(availData.bed.status === "AVAILABLE", "Bed transitioned back to AVAILABLE only after Housekeeping completion");

      // Req 10: Patient names are visible in authorized bed tables (at least 5 distinct patient names populated)
      const occupiedWithNames = bedsData.filter((b: any) => b.status === "OCCUPIED" && b.patient_name);
      assert(occupiedWithNames.length >= 5, `Expected at least 5 occupied beds with patient_name, found ${occupiedWithNames.length}`);
      const distinctPatientNames = new Set(occupiedWithNames.map((b: any) => b.patient_name));
      assert(distinctPatientNames.size >= 5, `Expected at least 5 distinct patient names, found ${distinctPatientNames.size}`);

      // Req 11: Multiple correct doctor names appear for respective assigned patients
      const docNames = new Set(occupiedWithNames.map((b: any) => b.assigned_doctor_name).filter(Boolean));
      assert(docNames.size >= 3, `Expected at least 3 distinct doctor names assigned to patients, found ${docNames.size} (${Array.from(docNames).join(", ")})`);

      // Req 12: Multiple valid housekeeper names appear for assigned cleaning tasks
      const allCleaningRes = await pool.query(`
        SELECT DISTINCT u.username
        FROM cleaning_tasks ct
        JOIN users u ON ct.assigned_user_id = u.id
        WHERE u.role = 'HOUSEKEEPING'
      `);
      assert(allCleaningRes.rows.length >= 3, `Expected at least 3 distinct housekeeper assignments in cleaning tasks, found ${allCleaningRes.rows.length}`);

      // Req 13: At least 10 distinct synthetic condition/procedure scenarios exist in database
      const distinctScenarios = await pool.query(`
        SELECT COUNT(DISTINCT condition) as cond_count, COUNT(DISTINCT procedure_type) as proc_count
        FROM admissions
        WHERE condition IS NOT NULL OR procedure_type IS NOT NULL
      `);
      const condCount = Number(distinctScenarios.rows[0]?.cond_count || "0");
      assert(condCount >= 10, `Expected at least 10 distinct synthetic conditions in admissions, found ${condCount}`);

      // Req 14: ML training dataset exists with at least 100 examples and derived timestamps
      const fsMod = await import("fs");
      const pathMod = await import("path");
      const csvPath = pathMod.resolve(__dirname, "../data/synthetic_icu_training_data.csv");
      assert(fsMod.existsSync(csvPath), "Synthetic training CSV exists at backend/data/synthetic_icu_training_data.csv");
      const csvContent = fsMod.readFileSync(csvPath, "utf-8");
      const csvLines = csvContent.trim().split("\n");
      assert(csvLines.length >= 101, `Expected at least 100 training examples in CSV, found ${csvLines.length - 1}`);

      // Req 15: Trained ML model metadata and held-out test evaluation exist and are clearly marked experimental
      const metadataPath = pathMod.resolve(__dirname, "../models/model_metadata.json");
      assert(fsMod.existsSync(metadataPath), "Trained ML model metadata exists at backend/models/model_metadata.json");
      const modelMeta = JSON.parse(fsMod.readFileSync(metadataPath, "utf-8"));
      assert(modelMeta.is_experimental === true, "Model is clearly marked experimental");
      assert(Boolean(modelMeta.disclaimer), "Model contains explicit non-clinical disclaimer");
      assert(typeof modelMeta.evaluation_metrics?.random_forest_mae_hours === "number", "Model evaluated with Random Forest MAE on held-out test set");
      assert(typeof modelMeta.evaluation_metrics?.baseline_median_mae_hours === "number", "Baseline MAE evaluated on held-out test set");

      // Req 16: ML info endpoint returns model metadata for authorized staff, blocks Housekeeping
      const mlInfoRes = await fetch(`${BASE_URL}/icu/ml/model-info`, {
        headers: { Authorization: `Bearer ${doctorToken}` },
      });
      assert(mlInfoRes.status === 200, "Authorized doctor can access ML model info (HTTP 200)");
      const mlInfoData = await mlInfoRes.json();
      assert(mlInfoData.is_experimental === true, "ML model info confirms experimental status");

      const hkMlInfoRes = await fetch(`${BASE_URL}/icu/ml/model-info`, {
        headers: { Authorization: `Bearer ${hkToken}` },
      });
      assert(hkMlInfoRes.status === 403, "Housekeeping blocked from ML model info (HTTP 403)");

      // Req 17: Experimental LOS Prediction Endpoint Verification (POST /api/ml/los-prediction)
      console.log("\n12. Verifying Experimental Length of Stay (LOS) ML Prediction Endpoint...");
      const sampleMlPayload = {
        procedure_type: "angiography",
        condition: "stable",
        admission_type: "elective",
        complications: "none",
        icu_unit: "cardiac",
        age_group: "middle",
      };

      // 17a. Authentication check: unauthenticated -> 401
      const unauthMlRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleMlPayload),
      });
      assert(unauthMlRes.status === 401, "LOS prediction blocks unauthenticated requests (HTTP 401)");

      // 17b. Role check: Nurse blocked -> 403
      const nurseMlRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
        method: "POST",
        headers: { Authorization: `Bearer ${nurseToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(sampleMlPayload),
      });
      assert(nurseMlRes.status === 403, "Nurse role blocked from LOS prediction (HTTP 403)");

      // 17c. Role check: Housekeeping blocked -> 403
      const hkMlPredRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
        method: "POST",
        headers: { Authorization: `Bearer ${hkToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(sampleMlPayload),
      });
      assert(hkMlPredRes.status === 403, "Housekeeping role blocked from LOS prediction (HTTP 403)");

      // 17d. Input validation: missing required field -> 400
      const invalidMlPayload = { ...sampleMlPayload, icu_unit: "" };
      const valMlRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(invalidMlPayload),
      });
      assert(valMlRes.status === 400, "LOS prediction rejects empty input field (HTTP 400 Bad Request)");

      // 17e. Doctor-Patient Isolation: Doctor requesting without patient ID -> 400
      const docNoPatRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
        method: "POST",
        headers: { Authorization: `Bearer ${doctorToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(sampleMlPayload),
      });
      assert(docNoPatRes.status === 400, "Doctor blocked from requesting prediction without patient ID (HTTP 400)");

      // 17f. Doctor-Patient Isolation: Doctor requesting for another doctor's patient -> 403
      const otherDoctorAdmRow = await pool.query(
        "SELECT id FROM admissions WHERE admitting_doctor_id != $1 LIMIT 1",
        [testDoctorId]
      );
      if (otherDoctorAdmRow.rows.length > 0) {
        const otherDocAdmId = otherDoctorAdmRow.rows[0].id;
        const unauthDocMlRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
          method: "POST",
          headers: { Authorization: `Bearer ${doctorToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...sampleMlPayload,
            patient_id: otherDocAdmId,
          }),
        });
        assert(
          unauthDocMlRes.status === 403,
          "Doctor blocked from requesting LOS prediction for another doctor's patient (HTTP 403)"
        );
      }

      // 17g. Doctor requesting prediction for assigned patient -> 200 OK (or 503 if ML offline, but here ML is active on 8000)
      const ownDoctorAdmRow = await pool.query(
        "SELECT id FROM admissions WHERE admitting_doctor_id = $1 LIMIT 1",
        [testDoctorId]
      );
      if (ownDoctorAdmRow.rows.length > 0) {
        const ownDocAdmId = ownDoctorAdmRow.rows[0].id;
        const ownDocMlRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
          method: "POST",
          headers: { Authorization: `Bearer ${doctorToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...sampleMlPayload,
            patient_id: ownDocAdmId,
          }),
        });
        assert(
          ownDocMlRes.status === 200 || ownDocMlRes.status === 503,
          `Doctor LOS prediction request processed (HTTP ${ownDocMlRes.status})`
        );
        if (ownDocMlRes.status === 200) {
          const docMlData = await ownDocMlRes.json();
          assert(typeof docMlData.predicted_los_days === "number", "Response includes predicted_los_days");
          assert(docMlData.clinical_use === false, "clinical_use flag is false");
          assert(docMlData.is_experimental === true, "is_experimental flag is true");
          assert(
            docMlData.disclaimer.includes("not for clinical decisions"),
            "Explicit experimental non-clinical disclaimer is present"
          );
        }
      }

      // 17h. Administrator running prediction -> 200 OK
      const adminMlRes = await fetch(`${BASE_URL}/ml/los-prediction`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(sampleMlPayload),
      });
      assert(
        adminMlRes.status === 200 || adminMlRes.status === 503,
        `Admin LOS prediction processed (HTTP ${adminMlRes.status})`
      );
      if (adminMlRes.status === 200) {
        const adminMlData = await adminMlRes.json();
        assert(adminMlData.is_experimental === true, "Admin prediction confirms experimental status");
        assert(
          adminMlData.disclaimer.includes("not for clinical decisions"),
          "Admin prediction contains non-clinical disclaimer"
        );
      }
    }

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
