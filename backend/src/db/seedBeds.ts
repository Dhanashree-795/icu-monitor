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
  patientName?: string;
  condition?: string;
  procedureType?: string;
  doctorEmail?: string;
  cleaningType?: "STANDARD" | "DEEP";
  cleaningStatus?: "PENDING" | "IN_PROGRESS";
  cleanerEmail?: string;
  admissionNotes?: string;
}

const UNITS: UnitDef[] = [
  { name: "Medical ICU (MICU)", capacity: 12 },
  { name: "Surgical ICU (SICU)", capacity: 10 },
  { name: "Cardiovascular ICU (CVICU)", capacity: 8 },
  { name: "Pediatric ICU (Pedia ICU)", capacity: 8 },
];

const BEDS: BedDef[] = [
  // Medical ICU Beds (12 beds)
  { bedNumber: "MICU-01", unitName: "Medical ICU (MICU)", status: "AVAILABLE", isIsolation: false },
  {
    bedNumber: "MICU-02",
    unitName: "Medical ICU (MICU)",
    status: "OCCUPIED",
    isIsolation: false,
    patientRef: "PT-1041",
    patientName: "Priya Nair",
    condition: "Acute chest pain under evaluation",
    procedureType: "Emergency cardiac admission",
    doctorEmail: "kavya.iyer@doctor.icu.in",
    admissionNotes: "Post-respiratory stabilization, continuous pulse oximetry monitoring"
  },
  {
    bedNumber: "MICU-03",
    unitName: "Medical ICU (MICU)",
    status: "OCCUPIED",
    isIsolation: true,
    patientRef: "PT-1042",
    patientName: "Kiran Patel",
    condition: "Severe respiratory distress",
    procedureType: "Respiratory admission",
    doctorEmail: "vikram.nair@doctor.icu.in",
    admissionNotes: "Airborne isolation protocol active. Negative pressure ventilation verified."
  },
  { bedNumber: "MICU-04", unitName: "Medical ICU (MICU)", status: "AVAILABLE", isIsolation: false },
  {
    bedNumber: "MICU-05",
    unitName: "Medical ICU (MICU)",
    status: "CLEANING",
    isIsolation: false,
    cleaningType: "STANDARD",
    cleaningStatus: "PENDING"
    // Leave unassigned
  },
  {
    bedNumber: "MICU-06",
    unitName: "Medical ICU (MICU)",
    status: "OCCUPIED",
    isIsolation: false,
    patientRef: "PT-1043",
    patientName: "Meera Shah",
    condition: "Suspected sepsis",
    procedureType: "Infection admission",
    doctorEmail: "rajesh.sharma@doctor.icu.in",
    admissionNotes: "Hemodynamic instability, arterial line in place"
  },
  { bedNumber: "MICU-07", unitName: "Medical ICU (MICU)", status: "RESERVED", isIsolation: false, patientRef: "PT-RES-01" },
  {
    bedNumber: "MICU-08",
    unitName: "Medical ICU (MICU)",
    status: "CLEANING",
    isIsolation: true,
    cleaningType: "DEEP",
    cleaningStatus: "IN_PROGRESS",
    cleanerEmail: "kavitha.devi@housekeeping.icu.in"
  },
  { bedNumber: "MICU-09", unitName: "Medical ICU (MICU)", status: "MAINTENANCE", isIsolation: false },
  {
    bedNumber: "MICU-10",
    unitName: "Medical ICU (MICU)",
    status: "OCCUPIED",
    isIsolation: false,
    patientRef: "PT-1044",
    patientName: "Arjun Reddy",
    condition: "Arrhythmia monitoring",
    procedureType: "Cardiac admission",
    doctorEmail: "meera.kapoor@doctor.icu.in",
    admissionNotes: "Cardiac telemetry and central venous pressure monitoring"
  },
  { bedNumber: "MICU-11", unitName: "Medical ICU (MICU)", status: "AVAILABLE", isIsolation: false },
  { bedNumber: "MICU-12", unitName: "Medical ICU (MICU)", status: "AVAILABLE", isIsolation: true },

  // Surgical ICU Beds (10 beds)
  {
    bedNumber: "SICU-01",
    unitName: "Surgical ICU (SICU)",
    status: "OCCUPIED",
    isIsolation: false,
    patientRef: "PT-2011",
    patientName: "Vikram Das",
    condition: "Postoperative recovery",
    procedureType: "General surgery",
    doctorEmail: "arjun.reddy@doctor.icu.in",
    admissionNotes: "Post-laparotomy recovery, surgical drain surveillance"
  },
  { bedNumber: "SICU-02", unitName: "Surgical ICU (SICU)", status: "AVAILABLE", isIsolation: false },
  {
    bedNumber: "SICU-03",
    unitName: "Surgical ICU (SICU)",
    status: "OCCUPIED",
    isIsolation: true,
    patientRef: "PT-2012",
    patientName: "Kavya Menon",
    condition: "Postoperative recovery",
    procedureType: "Thoracic surgery",
    doctorEmail: "vikram.nair@doctor.icu.in",
    admissionNotes: "Post-thoracic resection, contact precautions enforced"
  },
  {
    bedNumber: "SICU-04",
    unitName: "Surgical ICU (SICU)",
    status: "CLEANING",
    isIsolation: false,
    cleaningType: "STANDARD",
    cleaningStatus: "PENDING",
    cleanerEmail: "geetha.raj@housekeeping.icu.in"
  },
  { bedNumber: "SICU-05", unitName: "Surgical ICU (SICU)", status: "AVAILABLE", isIsolation: false },
  { bedNumber: "SICU-06", unitName: "Surgical ICU (SICU)", status: "RESERVED", isIsolation: false, patientRef: "PT-RES-02" },
  {
    bedNumber: "SICU-07",
    unitName: "Surgical ICU (SICU)",
    status: "OCCUPIED",
    isIsolation: false,
    patientRef: "PT-2013",
    patientName: "Aditya Verma",
    condition: "Post-trauma monitoring",
    procedureType: "Trauma admission",
    doctorEmail: "rajesh.sharma@doctor.icu.in",
    admissionNotes: "Polytrauma monitoring, post-orthopedic intervention"
  },
  { bedNumber: "SICU-08", unitName: "Surgical ICU (SICU)", status: "AVAILABLE", isIsolation: false },
  { bedNumber: "SICU-09", unitName: "Surgical ICU (SICU)", status: "MAINTENANCE", isIsolation: false },
  {
    bedNumber: "SICU-10",
    unitName: "Surgical ICU (SICU)",
    status: "CLEANING",
    isIsolation: true,
    cleaningType: "DEEP",
    cleaningStatus: "IN_PROGRESS",
    cleanerEmail: "anil.kumar@housekeeping.icu.in"
  },

  // Cardiovascular ICU (CVICU) Beds (6 beds)
  {
    bedNumber: "CVICU-01",
    unitName: "Cardiovascular ICU (CVICU)",
    status: "OCCUPIED",
    isIsolation: false,
    patientRef: "PT-VERIF-882",
    patientName: "Aarav Kumar",
    condition: "Stable, planned observation",
    procedureType: "Elective angiography",
    doctorEmail: "rajesh.sharma@doctor.icu.in",
    admissionNotes: "Post-coronary angiography surveillance, intra-aortic balloon pump monitoring"
  },
  {
    bedNumber: "CVICU-02",
    unitName: "Cardiovascular ICU (CVICU)",
    status: "OCCUPIED",
    isIsolation: false,
    patientRef: "PT-3011",
    patientName: "Ananya Rao",
    condition: "Stable after procedure",
    procedureType: "Elective angioplasty",
    doctorEmail: "meera.kapoor@doctor.icu.in",
    admissionNotes: "Post-coronary artery bypass graft (CABG), intra-aortic balloon pump monitoring"
  },
  { bedNumber: "CVICU-03", unitName: "Cardiovascular ICU (CVICU)", status: "CLEANING", isIsolation: false, cleaningType: "STANDARD", cleaningStatus: "PENDING" },
  { bedNumber: "CVICU-04", unitName: "Cardiovascular ICU (CVICU)", status: "AVAILABLE", isIsolation: false },
  {
    bedNumber: "CVICU-05",
    unitName: "Cardiovascular ICU (CVICU)",
    status: "OCCUPIED",
    isIsolation: true,
    patientRef: "PT-3012",
    patientName: "Rohan Mehta",
    condition: "Postoperative monitoring",
    procedureType: "Cardiac surgery",
    doctorEmail: "arjun.reddy@doctor.icu.in",
    admissionNotes: "Post-valve replacement surgery, continuous arterial waveform monitoring"
  },
  { bedNumber: "CVICU-06", unitName: "Cardiovascular ICU (CVICU)", status: "AVAILABLE", isIsolation: false },

  // Pediatric ICU (Pedia ICU) Beds (6 beds)
  { bedNumber: "PEDIA-01", unitName: "Pediatric ICU (Pedia ICU)", status: "AVAILABLE", isIsolation: false },
  { bedNumber: "PEDIA-02", unitName: "Pediatric ICU (Pedia ICU)", status: "AVAILABLE", isIsolation: false },
  {
    bedNumber: "PEDIA-03",
    unitName: "Pediatric ICU (Pedia ICU)",
    status: "OCCUPIED",
    isIsolation: true,
    patientRef: "PT-4011",
    patientName: "Sneha Iyer",
    condition: "Pneumonia requiring monitoring",
    procedureType: "Respiratory admission",
    doctorEmail: "kavya.iyer@doctor.icu.in",
    admissionNotes: "Pediatric severe bronchiolitis under high-flow nasal cannula therapy"
  },
  {
    bedNumber: "PEDIA-04",
    unitName: "Pediatric ICU (Pedia ICU)",
    status: "CLEANING",
    isIsolation: false,
    cleaningType: "STANDARD",
    cleaningStatus: "IN_PROGRESS",
    cleanerEmail: "ramesh.babu@housekeeping.icu.in"
  },
  { bedNumber: "PEDIA-05", unitName: "Pediatric ICU (Pedia ICU)", status: "RESERVED", isIsolation: false, patientRef: "PT-RES-03" },
  { bedNumber: "PEDIA-06", unitName: "Pediatric ICU (Pedia ICU)", status: "AVAILABLE", isIsolation: false },
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

  // Map all doctors by email
  const docsRes = await query<{ id: number; email: string }>(
    "SELECT id, email FROM users WHERE role = 'DOCTOR'"
  );
  const docMap = new Map<string, number>();
  for (const doc of docsRes.rows) {
    docMap.set(doc.email, doc.id);
  }
  const defaultDoctorId = docsRes.rows[0]?.id || null;

  // Map all housekeepers by email
  const hksRes = await query<{ id: number; email: string }>(
    "SELECT id, email FROM users WHERE role = 'HOUSEKEEPING'"
  );
  const hkMap = new Map<string, number>();
  for (const hk of hksRes.rows) {
    hkMap.set(hk.email, hk.id);
  }
  const defaultHkId = hksRes.rows[0]?.id || null;

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
      const activeAdm = await query<{ id: number }>(
        "SELECT id FROM admissions WHERE bed_id = $1 AND status = 'ADMITTED'",
        [bedId]
      );
      const docId = (b.doctorEmail && docMap.get(b.doctorEmail)) || defaultDoctorId;
      if (activeAdm.rows.length === 0) {
        await query(
          `INSERT INTO admissions (patient_ref, patient_name, condition, procedure_type, bed_id, admission_time, expected_discharge_time, status, admitting_doctor_id, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 days', 'ADMITTED', $6, $7, NOW(), NOW())`,
          [b.patientRef, b.patientName || null, b.condition || "Stable observation", b.procedureType || null, bedId, docId, b.admissionNotes || "Stable ICU observation"]
        );
      } else {
        await query(
          `UPDATE admissions
           SET patient_name = $1, condition = $2, procedure_type = $3, admitting_doctor_id = $4, notes = $5, updated_at = NOW()
           WHERE id = $6`,
          [b.patientName || null, b.condition || "Stable observation", b.procedureType || null, docId, b.admissionNotes || "Stable ICU observation", activeAdm.rows[0]!.id]
        );
      }
    }

    // Ensure consistent cleaning tasks for cleaning beds
    if (b.status === "CLEANING" && b.cleaningType) {
      const activeCleaning = await query<{ id: number }>(
        "SELECT id FROM cleaning_tasks WHERE bed_id = $1 AND status != 'COMPLETED'",
        [bedId]
      );
      const startTime = b.cleaningStatus === "IN_PROGRESS" ? "NOW() - INTERVAL '25 minutes'" : "NULL";
      const assignedId = b.cleanerEmail ? hkMap.get(b.cleanerEmail) || null : (b.cleaningStatus === "IN_PROGRESS" ? defaultHkId : null);

      if (activeCleaning.rows.length === 0) {
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
      } else {
        await query(
          `UPDATE cleaning_tasks
           SET task_type = $1, status = $2, assigned_user_id = $3, updated_at = NOW()
           WHERE id = $4`,
          [b.cleaningType, b.cleaningStatus || "PENDING", assignedId, activeCleaning.rows[0]!.id]
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
