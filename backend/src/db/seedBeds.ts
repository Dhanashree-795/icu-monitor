import { pool, checkDbConnection, query } from "./index";

interface UnitDef {
  name: string;
  capacity: number;
}

interface BedDef {
  bedNumber: string;
  unitName: string;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING" | "MAINTENANCE";
  isIsolation: boolean;
  patientRef?: string;
  cleaningType?: "STANDARD" | "DEEP";
  cleaningStatus?: "PENDING" | "IN_PROGRESS";
  admissionNotes?: string;
}

const UNITS: UnitDef[] = [
  { name: "Medical ICU (MICU)", capacity: 12 },
  { name: "Surgical ICU (SICU)", capacity: 10 },
];

const BEDS: BedDef[] = [
  // Medical ICU Beds (12 beds)
  { bedNumber: "MICU-01", unitName: "Medical ICU (MICU)", status: "AVAILABLE", isIsolation: false },
  { bedNumber: "MICU-02", unitName: "Medical ICU (MICU)", status: "OCCUPIED", isIsolation: false, patientRef: "PT-1041", admissionNotes: "Post-respiratory stabilization, continuous pulse oximetry monitoring" },
  { bedNumber: "MICU-03", unitName: "Medical ICU (MICU)", status: "OCCUPIED", isIsolation: true, patientRef: "PT-1042", admissionNotes: "Airborne isolation protocol active. Negative pressure ventilation verified." },
  { bedNumber: "MICU-04", unitName: "Medical ICU (MICU)", status: "AVAILABLE", isIsolation: false },
  { bedNumber: "MICU-05", unitName: "Medical ICU (MICU)", status: "CLEANING", isIsolation: false, cleaningType: "STANDARD", cleaningStatus: "PENDING" },
  { bedNumber: "MICU-06", unitName: "Medical ICU (MICU)", status: "OCCUPIED", isIsolation: false, patientRef: "PT-1043", admissionNotes: "Hemodynamic instability, arterial line in place" },
  { bedNumber: "MICU-07", unitName: "Medical ICU (MICU)", status: "RESERVED", isIsolation: false, patientRef: "PT-RES-01" },
  { bedNumber: "MICU-08", unitName: "Medical ICU (MICU)", status: "CLEANING", isIsolation: true, cleaningType: "DEEP", cleaningStatus: "IN_PROGRESS" },
  { bedNumber: "MICU-09", unitName: "Medical ICU (MICU)", status: "MAINTENANCE", isIsolation: false },
  { bedNumber: "MICU-10", unitName: "Medical ICU (MICU)", status: "OCCUPIED", isIsolation: false, patientRef: "PT-1044", admissionNotes: "Cardiac telemetry and central venous pressure monitoring" },
  { bedNumber: "MICU-11", unitName: "Medical ICU (MICU)", status: "AVAILABLE", isIsolation: false },
  { bedNumber: "MICU-12", unitName: "Medical ICU (MICU)", status: "AVAILABLE", isIsolation: true },

  // Surgical ICU Beds (10 beds)
  { bedNumber: "SICU-01", unitName: "Surgical ICU (SICU)", status: "OCCUPIED", isIsolation: false, patientRef: "PT-2011", admissionNotes: "Post-laparotomy recovery, surgical drain surveillance" },
  { bedNumber: "SICU-02", unitName: "Surgical ICU (SICU)", status: "AVAILABLE", isIsolation: false },
  { bedNumber: "SICU-03", unitName: "Surgical ICU (SICU)", status: "OCCUPIED", isIsolation: true, patientRef: "PT-2012", admissionNotes: "Post-thoracic resection, contact precautions enforced" },
  { bedNumber: "SICU-04", unitName: "Surgical ICU (SICU)", status: "CLEANING", isIsolation: false, cleaningType: "STANDARD", cleaningStatus: "PENDING" },
  { bedNumber: "SICU-05", unitName: "Surgical ICU (SICU)", status: "AVAILABLE", isIsolation: false },
  { bedNumber: "SICU-06", unitName: "Surgical ICU (SICU)", status: "RESERVED", isIsolation: false, patientRef: "PT-RES-02" },
  { bedNumber: "SICU-07", unitName: "Surgical ICU (SICU)", status: "OCCUPIED", isIsolation: false, patientRef: "PT-2013", admissionNotes: "Polytrauma monitoring, post-orthopedic intervention" },
  { bedNumber: "SICU-08", unitName: "Surgical ICU (SICU)", status: "AVAILABLE", isIsolation: false },
  { bedNumber: "SICU-09", unitName: "Surgical ICU (SICU)", status: "MAINTENANCE", isIsolation: false },
  { bedNumber: "SICU-10", unitName: "Surgical ICU (SICU)", status: "CLEANING", isIsolation: true, cleaningType: "DEEP", cleaningStatus: "IN_PROGRESS" },
];

export async function seedBedsAndUnits(): Promise<void> {
  console.log("Checking database connection for bed seeding...");
  const health = await checkDbConnection();
  if (!health.connected) {
    throw new Error(`Cannot seed beds: ${health.message}`);
  }

  // 1. Insert or ensure ICU units exist
  const unitMap = new Map<string, number>();
  for (const u of UNITS) {
    const res = await query<{ id: number }>(
      `INSERT INTO icu_units (name, capacity, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (name) DO UPDATE SET capacity = EXCLUDED.capacity, updated_at = NOW()
       RETURNING id`,
      [u.name, u.capacity]
    );
    const id = res.rows[0]?.id;
    if (id) {
      unitMap.set(u.name, id);
    }
  }

  // Find housekeeping user ID for assigning in-progress cleaning
  const hkUser = await query<{ id: number }>(
    "SELECT id FROM users WHERE role = 'HOUSEKEEPING' LIMIT 1"
  );
  const housekeepingUserId = hkUser.rows[0]?.id || null;

  // Find doctor user ID for admissions
  const docUser = await query<{ id: number }>(
    "SELECT id FROM users WHERE role = 'DOCTOR' LIMIT 1"
  );
  const doctorUserId = docUser.rows[0]?.id || null;

  console.log(`Seeding ${BEDS.length} synthetic beds across ${UNITS.length} ICU units...`);

  for (const b of BEDS) {
    const unitId = unitMap.get(b.unitName);
    if (!unitId) continue;

    // Check if bed already exists
    const existingBed = await query<{ id: number; status: string }>(
      "SELECT id, status FROM beds WHERE bed_number = $1",
      [b.bedNumber]
    );

    let bedId: number;

    if (existingBed.rows.length === 0) {
      const inserted = await query<{ id: number }>(
        `INSERT INTO beds (bed_number, unit_id, status, is_isolation, current_patient_ref, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id`,
        [b.bedNumber, unitId, b.status, b.isIsolation, b.patientRef || null]
      );
      bedId = inserted.rows[0]!.id;
    } else {
      bedId = existingBed.rows[0]!.id;
      // Update bed state to match seed consistency
      await query(
        `UPDATE beds
         SET unit_id = $1, status = $2, is_isolation = $3, current_patient_ref = $4, updated_at = NOW()
         WHERE id = $5`,
        [unitId, b.status, b.isIsolation, b.patientRef || null, bedId]
      );
    }

    // Ensure consistent admissions for occupied beds
    if (b.status === "OCCUPIED" && b.patientRef) {
      const activeAdm = await query(
        "SELECT id FROM admissions WHERE bed_id = $1 AND status = 'ADMITTED'",
        [bedId]
      );
      if (activeAdm.rows.length === 0) {
        await query(
          `INSERT INTO admissions (patient_ref, bed_id, admission_time, expected_discharge_time, status, admitting_doctor_id, notes, created_at, updated_at)
           VALUES ($1, $2, NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 days', 'ADMITTED', $3, $4, NOW(), NOW())`,
          [b.patientRef, bedId, doctorUserId, b.admissionNotes || "Stable ICU observation"]
        );
      }
    }

    // Ensure consistent cleaning tasks for cleaning beds
    if (b.status === "CLEANING" && b.cleaningType) {
      const activeCleaning = await query(
        "SELECT id FROM cleaning_tasks WHERE bed_id = $1 AND status != 'COMPLETED'",
        [bedId]
      );
      if (activeCleaning.rows.length === 0) {
        const startTime = b.cleaningStatus === "IN_PROGRESS" ? "NOW() - INTERVAL '25 minutes'" : "NULL";
        const assignedId = b.cleaningStatus === "IN_PROGRESS" ? housekeepingUserId : null;

        await query(
          `INSERT INTO cleaning_tasks (bed_id, task_type, status, assigned_user_id, start_time, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, ${startTime}, $5, NOW() - INTERVAL '40 minutes', NOW())`,
          [
            bedId,
            b.cleaningType,
            b.cleaningStatus || "PENDING",
            assignedId,
            b.isIsolation ? "Terminal deep decontamination for airborne isolation protocol" : "Standard turnover sanitization and linen exchange",
          ]
        );
      }
    }
  }

  // Record initial audit event if empty
  const logCount = await query<{ count: string }>("SELECT COUNT(*) FROM audit_logs");
  if (parseInt(logCount.rows[0]?.count || "0", 10) === 0) {
    await query(
      `INSERT INTO audit_logs (user_email, user_role, action, entity_type, entity_id, details, created_at)
       VALUES
       ('admin@admin.icu.in', 'ADMIN', 'SYSTEM_INITIALIZED', 'ICU_UNITS', 1, '{"message": "ICU Monitor beds and units configured with synthetic demonstration data."}', NOW() - INTERVAL '2 hours'),
       ('doctor@doctor.icu.in', 'DOCTOR', 'ADMIT_PATIENT', 'BED', 2, '{"bed_number": "MICU-02", "patient_ref": "PT-1041"}', NOW() - INTERVAL '1 day'),
       ('nurse@nurse.icu.in', 'NURSE', 'DISCHARGE_PATIENT', 'BED', 5, '{"bed_number": "MICU-05", "discharged_to": "Stepdown Unit"}', NOW() - INTERVAL '45 minutes'),
       ('housekeeping@housekeeping.icu.in', 'HOUSEKEEPING', 'CLEANING_STARTED', 'CLEANING_TASK', 1, '{"bed_number": "MICU-08", "type": "DEEP"}', NOW() - INTERVAL '25 minutes')`
    );
  }

  console.log("Synthetic bed and unit seeding completed successfully.");
}

if (require.main === module) {
  seedBedsAndUnits()
    .then(() => {
      console.log("Bed seeding finished successfully.");
      process.exit(0);
    })
    .catch((err: Error) => {
      console.error("Bed seeding failed:", err.message);
      process.exit(1);
    })
    .finally(() => {
      pool.end().catch(() => {});
    });
}
