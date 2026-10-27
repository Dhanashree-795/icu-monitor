import { Router, Request, Response } from "express";
import { PoolClient } from "pg";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import { pool, query } from "../db/index";
import { authenticateToken, requireRole, AuthUser } from "../middleware/auth";
import { config } from "../config/env";

const router = Router();

// Require valid authentication for all ICU routes
router.use(authenticateToken);

// Helper to record audit logs within a transaction or directly
async function recordAudit(
  client: PoolClient | typeof pool,
  user: AuthUser,
  action: string,
  entityType: string,
  entityId: number | null,
  details: Record<string, unknown>
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs (user_id, user_email, user_role, action, entity_type, entity_id, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [user.id, user.email, user.role, action, entityType, entityId, JSON.stringify(details)]
  );
}

export interface LosPredictionOutcome {
  status: "PREDICTED" | "CANT_PREDICT";
  reason: string;
  predictedLosDays: number | null;
  predictedFreeTime: Date | null;
  inputs: Record<string, string> | null;
}

/**
 * Automatically estimate LOS when admitting a patient.
 * Maps available data strictly to supported model categories.
 * If inputs are missing, service is unavailable, or prediction fails,
 * sets status to CANT_PREDICT without blocking admission or fabricating numbers.
 */
export async function estimateAdmissionLos(
  rawInputs: {
    unitName?: string | null;
    icuUnit?: string | null;
    procedureType?: string | null;
    condition?: string | null;
    admissionType?: string | null;
    complications?: string | null;
    ageGroup?: string | null;
  },
  admissionTime: Date | null
): Promise<LosPredictionOutcome> {
  // If admission timestamp is missing: Can't predict
  if (!admissionTime || isNaN(admissionTime.getTime())) {
    return {
      status: "CANT_PREDICT",
      reason: "Missing admission timestamp",
      predictedLosDays: null,
      predictedFreeTime: null,
      inputs: null,
    };
  }

  // 1. Map ICU Unit (justified from unit name or explicit)
  let mappedIcuUnit: string | null = null;
  const rawUnit = (rawInputs.icuUnit || rawInputs.unitName || "").trim();
  if (/pedia/i.test(rawUnit)) mappedIcuUnit = "Pedia ICU";
  else if (/cvicu|cardio/i.test(rawUnit)) mappedIcuUnit = "CVICU";
  else if (/micu|medical/i.test(rawUnit)) mappedIcuUnit = "MICU";
  else if (/sicu|surgical/i.test(rawUnit)) mappedIcuUnit = "SICU";

  // 2. Map Procedure Type (must match one of 12 supported model categories)
  const VALID_PROCEDURES = new Set([
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
  ]);
  let mappedProcedure: string | null = null;
  if (rawInputs.procedureType) {
    const normProc = rawInputs.procedureType.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (VALID_PROCEDURES.has(normProc)) {
      mappedProcedure = normProc;
    }
  }

  // 3. Map Condition (must match one of 5 supported model categories)
  const VALID_CONDITIONS = new Set(["stable", "improving", "moderate", "critical", "uncertain"]);
  let mappedCondition: string | null = null;
  if (rawInputs.condition) {
    const normCond = rawInputs.condition.trim().toLowerCase();
    if (VALID_CONDITIONS.has(normCond)) {
      mappedCondition = normCond;
    }
  }

  // 4. Map Admission Type (must match one of 3 supported model categories)
  const VALID_ADMISSION_TYPES = new Set(["planned", "urgent", "emergency"]);
  let mappedAdmissionType: string | null = null;
  if (rawInputs.admissionType) {
    const normAdm = rawInputs.admissionType.trim().toLowerCase();
    if (VALID_ADMISSION_TYPES.has(normAdm)) {
      mappedAdmissionType = normAdm;
    }
  }

  // 5. Map Complications (must match one of 3 supported model categories)
  const VALID_COMPLICATIONS = new Set(["none", "present", "unknown"]);
  let mappedComplications: string | null = null;
  if (rawInputs.complications) {
    const normComp = rawInputs.complications.trim().toLowerCase();
    if (VALID_COMPLICATIONS.has(normComp)) {
      mappedComplications = normComp;
    }
  }

  // 6. Map Age Group (must match one of 3 supported model categories)
  const VALID_AGE_GROUPS = new Set(["adult", "child", "older_adult"]);
  let mappedAgeGroup: string | null = null;
  if (rawInputs.ageGroup) {
    const normAge = rawInputs.ageGroup.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (VALID_AGE_GROUPS.has(normAge)) {
      mappedAgeGroup = normAge;
    }
  }

  const missingFields: string[] = [];
  if (!mappedIcuUnit) missingFields.push("icu_unit");
  if (!mappedProcedure) missingFields.push("procedure_type");
  if (!mappedCondition) missingFields.push("condition");
  if (!mappedAdmissionType) missingFields.push("admission_type");
  if (!mappedComplications) missingFields.push("complications");
  if (!mappedAgeGroup) missingFields.push("age_group");

  if (missingFields.length > 0) {
    return {
      status: "CANT_PREDICT",
      reason: `Missing required clinical inputs: ${missingFields.join(", ")}`,
      predictedLosDays: null,
      predictedFreeTime: null,
      inputs: null,
    };
  }

  const cleanPayload = {
    icu_unit: mappedIcuUnit!,
    procedure_type: mappedProcedure!,
    condition: mappedCondition!,
    admission_type: mappedAdmissionType!,
    complications: mappedComplications!,
    age_group: mappedAgeGroup!,
  };

  const baseUrl = config.losMlApiUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const mlRes = await fetch(`${baseUrl}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(cleanPayload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!mlRes.ok) {
      return {
        status: "CANT_PREDICT",
        reason: "Experimental ML service prediction failed",
        predictedLosDays: null,
        predictedFreeTime: null,
        inputs: cleanPayload,
      };
    }

    const data = (await mlRes.json()) as { predicted_los_days?: number };
    const days = typeof data.predicted_los_days === "number" ? data.predicted_los_days : null;

    if (days === null || isNaN(days)) {
      return {
        status: "CANT_PREDICT",
        reason: "Model returned invalid prediction output",
        predictedLosDays: null,
        predictedFreeTime: null,
        inputs: cleanPayload,
      };
    }

    const freeTime = new Date(admissionTime.getTime() + days * 86400000);

    return {
      status: "PREDICTED",
      reason: "Prediction generated by experimental model",
      predictedLosDays: Number(days.toFixed(2)),
      predictedFreeTime: freeTime,
      inputs: cleanPayload,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        status: "CANT_PREDICT",
        reason: "Experimental ML service timed out",
        predictedLosDays: null,
        predictedFreeTime: null,
        inputs: cleanPayload,
      };
    }
    return {
      status: "CANT_PREDICT",
      reason: "Experimental ML service unavailable or offline",
      predictedLosDays: null,
      predictedFreeTime: null,
      inputs: cleanPayload,
    };
  }
}

// ==============================================================================
// 1. DASHBOARD & SUMMARY STATS
// ==============================================================================

/**
 * GET /api/icu/dashboard/stats
 * Accessible by all authenticated roles (ADMIN, DOCTOR, NURSE, HOUSEKEEPING)
 */
router.get("/dashboard/stats", async (_req: Request, res: Response): Promise<void> => {
  try {
    const bedsResult = await query<{
      status: string;
      count: string;
    }>(`SELECT status, COUNT(*) AS count FROM beds GROUP BY status`);

    const totalBedsResult = await query<{ count: string }>(`SELECT COUNT(*) AS count FROM beds`);
    const totalBeds = parseInt(totalBedsResult.rows[0]?.count || "0", 10);

    const counts: Record<string, number> = {
      AVAILABLE: 0,
      OCCUPIED: 0,
      RESERVED: 0,
      CLEANING: 0,
      MAINTENANCE: 0,
    };

    for (const row of bedsResult.rows) {
      counts[row.status] = parseInt(row.count, 10);
    }

    const occupied = counts["OCCUPIED"] || 0;
    const occupancyRate = totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0;

    // Cleaning tasks metrics
    const cleaningResult = await query<{
      status: string;
      count: string;
      overdue_count: string;
    }>(`
      SELECT
        status,
        COUNT(*) AS count,
        COUNT(*) FILTER (
          WHERE (status = 'PENDING' AND created_at < NOW() - INTERVAL '45 minutes')
             OR (status = 'IN_PROGRESS' AND task_type = 'STANDARD' AND start_time < NOW() - INTERVAL '60 minutes')
             OR (status = 'IN_PROGRESS' AND task_type = 'DEEP' AND start_time < NOW() - INTERVAL '90 minutes')
        ) AS overdue_count
      FROM cleaning_tasks
      WHERE status != 'COMPLETED'
      GROUP BY status
    `);

    let pendingCleaning = 0;
    let inProgressCleaning = 0;
    let overdueCleaning = 0;

    for (const row of cleaningResult.rows) {
      if (row.status === "PENDING") pendingCleaning = parseInt(row.count, 10);
      if (row.status === "IN_PROGRESS") inProgressCleaning = parseInt(row.count, 10);
      overdueCleaning += parseInt(row.overdue_count || "0", 10);
    }

    // Units breakdown
    const unitsResult = await query<{
      id: number;
      name: string;
      capacity: number;
      total_beds: string;
      occupied_beds: string;
      available_beds: string;
      maintenance_beds: string;
    }>(`
      SELECT
        u.id,
        u.name,
        u.capacity,
        COUNT(b.id) AS total_beds,
        COUNT(b.id) FILTER (WHERE b.status = 'OCCUPIED') AS occupied_beds,
        COUNT(b.id) FILTER (WHERE b.status = 'AVAILABLE') AS available_beds,
        COUNT(b.id) FILTER (WHERE b.status = 'MAINTENANCE') AS maintenance_beds
      FROM icu_units u
      LEFT JOIN beds b ON b.unit_id = u.id
      GROUP BY u.id, u.name, u.capacity
      ORDER BY u.id ASC
    `);

    res.status(200).json({
      totalBeds,
      availableBeds: counts["AVAILABLE"] || 0,
      occupiedBeds: counts["OCCUPIED"] || 0,
      reservedBeds: counts["RESERVED"] || 0,
      cleaningBeds: counts["CLEANING"] || 0,
      maintenanceBeds: counts["MAINTENANCE"] || 0,
      occupancyRate,
      pendingCleaningCount: pendingCleaning,
      inProgressCleaningCount: inProgressCleaning,
      overdueCleaningCount: overdueCleaning,
      units: unitsResult.rows.map((u) => ({
        id: u.id,
        name: u.name,
        capacity: u.capacity,
        totalBeds: parseInt(u.total_beds, 10),
        occupiedBeds: parseInt(u.occupied_beds, 10),
        availableBeds: parseInt(u.available_beds, 10),
        maintenanceBeds: parseInt(u.maintenance_beds || "0", 10),
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: "Failed to retrieve dashboard metrics" });
  }
});

/**
 * GET /api/icu/staff
 * List all active staff users (for doctor/cleaner dropdown assignments)
 * Permissions: ADMIN, DOCTOR, NURSE, HOUSEKEEPING
 */
router.get("/staff", async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.username, u.role, u.active, u.phone, u.department, u.assigned_unit_id,
              unit.name AS assigned_unit_name
       FROM users u
       LEFT JOIN icu_units unit ON unit.id = u.assigned_unit_id
       WHERE u.active = TRUE
       ORDER BY u.role ASC, u.email ASC`
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("List staff error:", err);
    res.status(500).json({ error: "Failed to list staff" });
  }
});

// ==============================================================================
// 2. ICU UNITS
// ==============================================================================

/**
 * GET /api/icu/units
 * List all ICU units
 */
router.get("/units", async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.capacity, u.created_at, u.updated_at,
              COUNT(b.id) AS bed_count
       FROM icu_units u
       LEFT JOIN beds b ON b.unit_id = u.id
       GROUP BY u.id
       ORDER BY u.id ASC`
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("List units error:", err);
    res.status(500).json({ error: "Failed to load ICU units" });
  }
});

/**
 * POST /api/icu/units
 * Create an ICU unit (ADMIN only)
 */
router.post("/units", requireRole("ADMIN"), async (req: Request, res: Response): Promise<void> => {
  const { name, capacity } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Validation error", message: "Unit name is required." });
    return;
  }

  const numCapacity = Number(capacity) || 10;
  if (numCapacity <= 0 || numCapacity > 100) {
    res.status(400).json({ error: "Validation error", message: "Capacity must be between 1 and 100." });
    return;
  }

  try {
    const result = await query<{ id: number; name: string; capacity: number }>(
      `INSERT INTO icu_units (name, capacity, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING id, name, capacity`,
      [name.trim(), numCapacity]
    );

    const newUnit = result.rows[0]!;
    await recordAudit(pool, req.user!, "UNIT_CREATED", "UNIT", newUnit.id, {
      name: newUnit.name,
      capacity: newUnit.capacity,
    });

    res.status(201).json({
      success: true,
      message: `Unit '${newUnit.name}' created successfully.`,
      unit: newUnit,
    });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "Conflict", message: `A unit named '${name}' already exists.` });
      return;
    }
    console.error("Create unit error:", err);
    res.status(500).json({ error: "Failed to create unit" });
  }
});

// ==============================================================================
// 3. BEDS MANAGEMENT & ACTIONS
// ==============================================================================

/**
 * GET /api/icu/beds
 * List and filter beds by status, unitId, isolation, and search
 */
router.get("/beds", async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, unitId, isolation, search } = req.query;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status && typeof status === "string") {
      conditions.push(`b.status = $${paramIndex++}`);
      params.push(status.toUpperCase());
    }

    if (unitId && typeof unitId === "string" && !isNaN(Number(unitId))) {
      conditions.push(`b.unit_id = $${paramIndex++}`);
      params.push(Number(unitId));
    }

    if (isolation !== undefined && isolation !== "") {
      conditions.push(`b.is_isolation = $${paramIndex++}`);
      params.push(isolation === "true" || isolation === "1");
    }

    if (search && typeof search === "string" && search.trim()) {
      conditions.push(`(b.bed_number ILIKE $${paramIndex} OR b.current_patient_ref ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const queryStr = `
      SELECT
        b.id,
        b.bed_number,
        b.unit_id,
        u.name AS unit_name,
        b.status,
        b.is_isolation,
        b.current_patient_ref,
        b.created_at,
        b.updated_at,
        adm.id AS active_admission_id,
        adm.patient_name,
        adm.procedure_type AS patient_procedure_type,
        adm.admission_time,
        adm.expected_discharge_time,
        adm.notes AS admission_notes,
        adm.condition AS patient_condition,
        adm.admitting_doctor_id AS assigned_doctor_id,
        doc.email AS assigned_doctor_email,
        doc.username AS assigned_doctor_name,
        adm.predicted_los_days,
        adm.prediction_status,
        adm.prediction_reason,
        adm.predicted_free_time,
        adm.prediction_updated_at,
        adm.prediction_inputs,
        cln.id AS active_cleaning_task_id,
        cln.task_type AS cleaning_task_type,
        cln.status AS cleaning_task_status,
        cln.start_time AS cleaning_start_time,
        cln.created_at AS cleaning_created_at,
        cln.notes AS cleaning_notes,
        cleaner.id AS assigned_cleaner_id,
        cleaner.email AS assigned_cleaner_email,
        cleaner.username AS assigned_cleaner_name
      FROM beds b
      JOIN icu_units u ON u.id = b.unit_id
      LEFT JOIN admissions adm ON adm.bed_id = b.id AND adm.status = 'ADMITTED'
      LEFT JOIN users doc ON doc.id = adm.admitting_doctor_id
      LEFT JOIN cleaning_tasks cln ON cln.bed_id = b.id AND cln.status != 'COMPLETED'
      LEFT JOIN users cleaner ON cleaner.id = cln.assigned_user_id
      ${whereClause}
      ORDER BY b.bed_number ASC
    `;

    const result = await query(queryStr, params);

    let rows = result.rows.map((r: any) => ({
      ...r,
      predicted_los_days: r.predicted_los_days != null ? Number(r.predicted_los_days) : null,
    }));
    if (req.user?.role === "HOUSEKEEPING") {
      rows = rows.map((r: any) => ({
        ...r,
        patient_name: null,
        patient_procedure_type: null,
        current_patient_ref: null,
        active_admission_id: null,
        admission_time: null,
        expected_discharge_time: null,
        admission_notes: null,
        patient_condition: null,
        assigned_doctor_id: null,
        assigned_doctor_email: null,
        assigned_doctor_name: null,
        predicted_los_days: null,
        prediction_status: null,
        prediction_reason: null,
        predicted_free_time: null,
        prediction_updated_at: null,
        prediction_inputs: null,
      }));
    }

    res.status(200).json(rows);
  } catch (err) {
    console.error("List beds error:", err);
    res.status(500).json({ error: "Failed to list beds" });
  }
});

/**
 * GET /api/icu/beds/:id
 * Retrieve specific bed details with status history from audit logs
 */
router.get("/beds/:id", async (req: Request, res: Response): Promise<void> => {
  const bedId = Number(req.params.id);
  if (isNaN(bedId)) {
    res.status(400).json({ error: "Invalid bed ID" });
    return;
  }

  try {
    const bedResult = await query(
      `SELECT
        b.id,
        b.bed_number,
        b.unit_id,
        u.name AS unit_name,
        b.status,
        b.is_isolation,
        b.current_patient_ref,
        b.created_at,
        b.updated_at,
        adm.id AS active_admission_id,
        adm.patient_name,
        adm.procedure_type AS patient_procedure_type,
        adm.admission_time,
        adm.expected_discharge_time,
        adm.notes AS admission_notes,
        adm.condition AS patient_condition,
        adm.admitting_doctor_id AS assigned_doctor_id,
        doc.email AS assigned_doctor_email,
        doc.username AS assigned_doctor_name,
        adm.predicted_los_days,
        adm.prediction_status,
        adm.prediction_reason,
        adm.predicted_free_time,
        adm.prediction_updated_at,
        adm.prediction_inputs,
        cln.id AS active_cleaning_task_id,
        cln.task_type AS cleaning_task_type,
        cln.status AS cleaning_task_status,
        cln.start_time AS cleaning_start_time,
        cln.created_at AS cleaning_created_at,
        cln.notes AS cleaning_notes,
        cleaner.id AS assigned_cleaner_id,
        cleaner.email AS assigned_cleaner_email,
        cleaner.username AS assigned_cleaner_name
       FROM beds b
       JOIN icu_units u ON u.id = b.unit_id
       LEFT JOIN admissions adm ON adm.bed_id = b.id AND adm.status = 'ADMITTED'
       LEFT JOIN users doc ON doc.id = adm.admitting_doctor_id
       LEFT JOIN cleaning_tasks cln ON cln.bed_id = b.id AND cln.status != 'COMPLETED'
       LEFT JOIN users cleaner ON cleaner.id = cln.assigned_user_id
       WHERE b.id = $1`,
      [bedId]
    );

    const bed = bedResult.rows[0];
    if (!bed) {
      res.status(404).json({ error: "Bed not found" });
      return;
    }

    // Status transition and event history from audit_logs
    const historyResult = await query(
      `SELECT id, user_email, user_role, action, details, created_at
       FROM audit_logs
       WHERE entity_type = 'BED' AND entity_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [bedId]
    );

    let sanitizedBed: any = {
      ...bed,
      predicted_los_days: bed.predicted_los_days != null ? Number(bed.predicted_los_days) : null,
    };
    let sanitizedHistory = historyResult.rows;

    if (req.user?.role === "HOUSEKEEPING") {
      sanitizedBed = {
        ...bed,
        patient_name: null,
        patient_procedure_type: null,
        current_patient_ref: null,
        active_admission_id: null,
        admission_time: null,
        expected_discharge_time: null,
        admission_notes: null,
        patient_condition: null,
        assigned_doctor_id: null,
        assigned_doctor_email: null,
        assigned_doctor_name: null,
        predicted_los_days: null,
        prediction_status: null,
        prediction_reason: null,
        predicted_free_time: null,
        prediction_updated_at: null,
        prediction_inputs: null,
      };
      sanitizedHistory = historyResult.rows.map((h: any) => {
        const copyDetails = { ...(h.details || {}) };
        if (copyDetails.patient_name) copyDetails.patient_name = "[REDACTED - PRIVACY]";
        if (copyDetails.patient_ref) copyDetails.patient_ref = "[REDACTED - PRIVACY]";
        if (copyDetails.discharged_patient_ref) copyDetails.discharged_patient_ref = "[REDACTED - PRIVACY]";
        return {
          ...h,
          details: copyDetails,
        };
      });
    }

    res.status(200).json({
      bed: sanitizedBed,
      history: sanitizedHistory,
    });
  } catch (err) {
    console.error("Bed details error:", err);
    res.status(500).json({ error: "Failed to retrieve bed details" });
  }
});

/**
 * POST /api/icu/beds
 * Create a new bed (ADMIN only)
 */
router.post("/beds", requireRole("ADMIN"), async (req: Request, res: Response): Promise<void> => {
  const { bedNumber, unitId, isIsolation } = req.body;

  if (!bedNumber || typeof bedNumber !== "string" || !bedNumber.trim()) {
    res.status(400).json({ error: "Validation error", message: "Bed number is required." });
    return;
  }

  const numUnitId = Number(unitId);
  if (!numUnitId || isNaN(numUnitId)) {
    res.status(400).json({ error: "Validation error", message: "Valid unit ID is required." });
    return;
  }

  try {
    const result = await query<{ id: number; bed_number: string }>(
      `INSERT INTO beds (bed_number, unit_id, status, is_isolation, created_at, updated_at)
       VALUES ($1, $2, 'AVAILABLE', $3, NOW(), NOW())
       RETURNING id, bed_number`,
      [bedNumber.trim().toUpperCase(), numUnitId, Boolean(isIsolation)]
    );

    const newBed = result.rows[0]!;
    await recordAudit(pool, req.user!, "BED_CREATED", "BED", newBed.id, {
      bed_number: newBed.bed_number,
      unit_id: numUnitId,
      is_isolation: Boolean(isIsolation),
    });

    res.status(201).json({
      success: true,
      message: `Bed '${newBed.bed_number}' added successfully.`,
      bed: newBed,
    });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "Conflict", message: `Bed number '${bedNumber}' already exists.` });
      return;
    }
    if (err.code === "23503") {
      res.status(404).json({ error: "Not Found", message: `Unit ID ${unitId} does not exist.` });
      return;
    }
    console.error("Create bed error:", err);
    res.status(500).json({ error: "Failed to create bed" });
  }
});

/**
 * PATCH /api/icu/beds/:id
 * Edit bed details (ADMIN only)
 */
router.patch("/beds/:id", requireRole("ADMIN"), async (req: Request, res: Response): Promise<void> => {
  const bedId = Number(req.params.id);
  const { bedNumber, unitId, isIsolation } = req.body;

  try {
    const fields: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    if (bedNumber && typeof bedNumber === "string" && bedNumber.trim()) {
      fields.push(`bed_number = $${pIdx++}`);
      params.push(bedNumber.trim().toUpperCase());
    }

    if (unitId && !isNaN(Number(unitId))) {
      fields.push(`unit_id = $${pIdx++}`);
      params.push(Number(unitId));
    }

    if (isIsolation !== undefined) {
      fields.push(`is_isolation = $${pIdx++}`);
      params.push(Boolean(isIsolation));
    }

    if (fields.length === 0) {
      res.status(400).json({ error: "No fields to update provided." });
      return;
    }

    fields.push(`updated_at = NOW()`);
    params.push(bedId);

    const result = await query(
      `UPDATE beds SET ${fields.join(", ")} WHERE id = $${pIdx} RETURNING id, bed_number, unit_id, is_isolation, status`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Bed not found." });
      return;
    }

    await recordAudit(pool, req.user!, "BED_EDITED", "BED", bedId, req.body);

    res.status(200).json({
      success: true,
      message: "Bed updated successfully.",
      bed: result.rows[0],
    });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "Conflict", message: `Bed number '${bedNumber}' already exists.` });
      return;
    }
    console.error("Patch bed error:", err);
    res.status(500).json({ error: "Failed to update bed." });
  }
});

// ==============================================================================
// 4. CLINICAL WORKFLOWS: ADMISSION & DISCHARGE (TRANSACTION PROTECTED)
// ==============================================================================

/**
 * POST /api/icu/beds/:id/admit
 * Admit a synthetic patient into an available bed
 * Permissions: ADMIN, DOCTOR
 * Uses SELECT ... FOR UPDATE transaction to prevent race conditions
 */
router.post(
  "/beds/:id/admit",
  requireRole("ADMIN", "DOCTOR"),
  async (req: Request, res: Response): Promise<void> => {
    const bedId = Number(req.params.id);
    const {
      patientRef,
      patientName,
      procedureType,
      condition,
      diagnosis,
      admissionReason,
      reason,
      doctorId,
      admittingDoctorId,
      admissionTime,
      expectedDischargeTime,
      notes,
      admissionType,
      admission_type,
      complications,
      ageGroup,
      age_group,
      icuUnit,
      icu_unit,
    } = req.body;

    const cleanPatientName = (patientName && typeof patientName === "string" && patientName.trim())
      ? patientName.trim()
      : null;

    const cleanProcedureType = (procedureType && typeof procedureType === "string" && procedureType.trim())
      ? procedureType.trim()
      : null;

    const rawRef = (patientRef && typeof patientRef === "string" && patientRef.trim())
      ? patientRef.trim().toUpperCase()
      : null;

    // Generate synthetic patient reference if not provided (e.g., PT-8472)
    const syntheticRef = rawRef || `PT-${Math.floor(1000 + Math.random() * 9000)}`;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Lock bed row to prevent race conditions
      const bedResult = await client.query<{
        id: number;
        bed_number: string;
        status: string;
        is_isolation: boolean;
        unit_id: number;
        unit_name: string;
      }>(
        `SELECT b.id, b.bed_number, b.status, b.is_isolation, b.unit_id, u.name AS unit_name
         FROM beds b
         JOIN icu_units u ON u.id = b.unit_id
         WHERE b.id = $1 FOR UPDATE`,
        [bedId]
      );

      const bed = bedResult.rows[0];
      if (!bed) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Bed not found" });
        return;
      }

      // Validate patientName if explicitly supplied as blank
      if (req.body.patientName !== undefined && typeof req.body.patientName === "string" && req.body.patientName.trim() === "") {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Validation error",
          message: "Patient full name is required.",
        });
        return;
      }

      // Bed must be AVAILABLE or RESERVED to admit
      if (bed.status !== "AVAILABLE" && bed.status !== "RESERVED") {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "Invalid bed state",
          message: `Bed '${bed.bed_number}' cannot be assigned because it is currently ${bed.status}. Only AVAILABLE or RESERVED beds can accept admissions.`,
        });
        return;
      }

      // Resolve doctor assignment: DOCTOR role always assigns to self (do not trust frontend doctor ID)
      let resolvedDoctorId = req.user!.id;
      let doctorName = req.user!.username || req.user!.email;
      if (req.user!.role === "ADMIN") {
        const rawDoctorId = doctorId !== undefined && doctorId !== null && doctorId !== ""
          ? doctorId
          : admittingDoctorId;
        if (rawDoctorId !== undefined && rawDoctorId !== null && rawDoctorId !== "") {
          const targetDoctorId = Number(rawDoctorId);
          if (isNaN(targetDoctorId)) {
            await client.query("ROLLBACK");
            res.status(400).json({
              error: "Invalid doctor assignment",
              message: "Selected doctor is invalid, inactive, or not authorized for clinical patient care.",
            });
            return;
          }
          const docCheck = await client.query<{ id: number; username: string; email: string; role: string; active: boolean }>(
            "SELECT id, username, email, role, active FROM users WHERE id = $1",
            [targetDoctorId]
          );
          const docUser = docCheck.rows[0];
          if (!docUser || docUser.role !== "DOCTOR" || !docUser.active) {
            await client.query("ROLLBACK");
            res.status(400).json({
              error: "Invalid doctor assignment",
              message: "Selected doctor is invalid, inactive, or not authorized for clinical patient care.",
            });
            return;
          }
          resolvedDoctorId = docUser.id;
          doctorName = docUser.username || docUser.email;
        }
      }


      // Parse admission time and expected discharge time
      const admTime = admissionTime ? new Date(admissionTime) : new Date();
      const expDischarge = expectedDischargeTime ? new Date(expectedDischargeTime) : new Date(Date.now() + 48 * 3600 * 1000);

      const cleanDiagnosis = (diagnosis || admissionReason || reason) && typeof (diagnosis || admissionReason || reason) === "string"
        ? (diagnosis || admissionReason || reason).trim()
        : null;
      const cleanAdmissionType = (admissionType || admission_type) && typeof (admissionType || admission_type) === "string"
        ? (admissionType || admission_type).trim()
        : "planned";
      const cleanComplications = complications && typeof complications === "string"
        ? complications.trim()
        : "none";

      // Estimate LOS automatically using available admission data
      const losEstimate = await estimateAdmissionLos(
        {
          unitName: bed.unit_name,
          icuUnit: icuUnit || icu_unit,
          procedureType: cleanProcedureType,
          condition: condition || undefined,
          admissionType: cleanAdmissionType,
          complications: cleanComplications,
          ageGroup: ageGroup || age_group,
        },
        admTime
      );

      // Update bed to OCCUPIED
      await client.query(
        `UPDATE beds
         SET status = 'OCCUPIED', current_patient_ref = $1, updated_at = NOW()
         WHERE id = $2`,
        [syntheticRef, bedId]
      );

      const combinedNotes = [
        cleanDiagnosis ? `Diagnosis: ${cleanDiagnosis}` : "",
        cleanProcedureType ? `Procedure: ${cleanProcedureType}` : "",
        condition ? `Condition: ${condition}` : "",
        notes,
      ].filter(Boolean).join(" | ") || "ICU synthetic observation";

      const rawCondition = (condition || "").trim() || "Acute ICU Observation";

      // Create admission record with patient_name, procedure_type, and experimental LOS prediction
      const admissionResult = await client.query<{ id: number }>(
        `INSERT INTO admissions (
           patient_ref, patient_name, procedure_type, bed_id, admission_time, expected_discharge_time,
           status, admitting_doctor_id, condition, notes, diagnosis, admission_type, complications,
           predicted_los_days, prediction_status, prediction_reason, predicted_free_time, prediction_updated_at, prediction_inputs,
           created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'ADMITTED', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), $17, NOW(), NOW())
         RETURNING id`,
        [
          syntheticRef,
          cleanPatientName,
          cleanProcedureType,
          bedId,
          admTime,
          expDischarge,
          resolvedDoctorId,
          rawCondition,
          combinedNotes,
          cleanDiagnosis,
          cleanAdmissionType,
          cleanComplications,
          losEstimate.predictedLosDays,
          losEstimate.status,
          losEstimate.reason,
          losEstimate.predictedFreeTime,
          losEstimate.inputs ? JSON.stringify(losEstimate.inputs) : null,
        ]
      );

      const admissionId = admissionResult.rows[0]!.id;

      // Write audit log
      await recordAudit(client, req.user!, "ADMIT_PATIENT", "BED", bedId, {
        bed_number: bed.bed_number,
        patient_ref: syntheticRef,
        patient_name: cleanPatientName,
        procedure_type: cleanProcedureType,
        admission_id: admissionId,
        is_isolation: bed.is_isolation,
        admitting_doctor_id: resolvedDoctorId,
        condition,
        admission_time: admTime.toISOString(),
        predicted_los_days: losEstimate.predictedLosDays,
        prediction_status: losEstimate.status,
      });

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        message: cleanPatientName
          ? `Patient '${cleanPatientName}' (${syntheticRef}) successfully admitted to Bed '${bed.bed_number}'.`
          : `Synthetic patient '${syntheticRef}' successfully admitted to Bed '${bed.bed_number}'.`,
        admissionId,
        patientRef: syntheticRef,
        patientName: cleanPatientName,
        bedNumber: bed.bed_number,
        status: "OCCUPIED",
        admittingDoctorId: resolvedDoctorId,
        assignedDoctorName: doctorName,
        admissionTime: admTime.toISOString(),
        predictedLosDays: losEstimate.predictedLosDays,
        predictionStatus: losEstimate.status,
        predictionReason: losEstimate.reason,
        predictedFreeTime: losEstimate.predictedFreeTime ? losEstimate.predictedFreeTime.toISOString() : null,
      });
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      console.error("Admit patient error:", err);
      res.status(500).json({ error: "Failed to admit patient" });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/icu/admissions
 * Administrator Patient Admission Workflow Endpoint
 * Permissions: ADMIN, DOCTOR
 * Uses SELECT ... FOR UPDATE database transaction to guarantee concurrency safety and atomic state.
 */
router.post(
  "/admissions",
  requireRole("ADMIN", "DOCTOR"),
  async (req: Request, res: Response): Promise<void> => {
    const {
      patientName,
      patientRef,
      bedId,
      doctorId,
      admittingDoctorId,
      icuUnit,
      procedureType,
      condition,
      diagnosis,
      admissionReason,
      admissionType,
      complications,
      ageGroup,
      notes,
      expectedDischargeHours,
    } = req.body;

    // 1. Validate required patient details
    const cleanPatientName = (patientName && typeof patientName === "string" && patientName.trim())
      ? patientName.trim()
      : null;

    if (!cleanPatientName) {
      res.status(400).json({
        error: "Validation error",
        message: "Patient full name is required.",
      });
      return;
    }

    const targetBedId = Number(bedId);
    if (!bedId || isNaN(targetBedId) || targetBedId <= 0) {
      res.status(400).json({
        error: "Validation error",
        message: "Valid ICU bed selection is required.",
      });
      return;
    }

    // 2. Validate doctor eligibility
    let resolvedDoctorId = req.user!.id;
    let doctorName = req.user!.username || req.user!.email;

    if (req.user!.role === "ADMIN") {
      const rawDoctorId = doctorId !== undefined && doctorId !== null && doctorId !== ""
        ? doctorId
        : admittingDoctorId;
      const targetDoctorId = Number(rawDoctorId);
      if (!rawDoctorId || isNaN(targetDoctorId) || targetDoctorId <= 0) {
        res.status(400).json({
          error: "Validation error",
          message: "An active attending physician must be assigned.",
        });
        return;
      }

      const docCheck = await query<{ id: number; username: string; email: string; role: string; active: boolean }>(
        "SELECT id, username, email, role, active FROM users WHERE id = $1",
        [targetDoctorId]
      );

      const docUser = docCheck.rows[0];
      if (!docUser || docUser.role !== "DOCTOR" || !docUser.active) {
        res.status(400).json({
          error: "Invalid doctor assignment",
          message: "Selected doctor is invalid, inactive, or not authorized for clinical patient care.",
        });
        return;
      }

      resolvedDoctorId = docUser.id;
      doctorName = docUser.username || docUser.email;
    }

    // 3. Begin database transaction with row-level locking
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Lock bed row to prevent concurrent double-admissions
      const bedResult = await client.query<{
        id: number;
        bed_number: string;
        status: string;
        is_isolation: boolean;
        unit_id: number;
        unit_name: string;
      }>(
        `SELECT b.id, b.bed_number, b.status, b.is_isolation, b.unit_id, u.name AS unit_name
         FROM beds b
         JOIN icu_units u ON u.id = b.unit_id
         WHERE b.id = $1 FOR UPDATE`,
        [targetBedId]
      );

      const bed = bedResult.rows[0];
      if (!bed) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Bed not found", message: "The selected bed does not exist." });
        return;
      }

      // Revalidate bed availability strictly
      if (bed.status !== "AVAILABLE") {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "Bed unavailable",
          message: `Bed '${bed.bed_number}' cannot be assigned because it is currently ${bed.status}. Only AVAILABLE beds can accept admissions.`,
        });
        return;
      }

      // Generate or sanitize synthetic patient reference (e.g. PT-8472)
      const rawRef = (patientRef && typeof patientRef === "string" && patientRef.trim())
        ? patientRef.trim().toUpperCase()
        : null;
      const syntheticRef = rawRef || `PT-${Math.floor(1000 + Math.random() * 9000)}`;

      // Server-generated admission timestamp
      const admTime = new Date();
      const stayHours = Number(expectedDischargeHours) > 0 ? Number(expectedDischargeHours) : 48;
      const expDischarge = new Date(admTime.getTime() + stayHours * 3600 * 1000);

      const cleanProcedureType = (procedureType && typeof procedureType === "string" && procedureType.trim())
        ? procedureType.trim()
        : null;
      const cleanCondition = (condition && typeof condition === "string" && condition.trim())
        ? condition.trim()
        : "Stable under observation";
      const cleanDiagnosis = (diagnosis || admissionReason) && typeof (diagnosis || admissionReason) === "string"
        ? (diagnosis || admissionReason).trim()
        : null;
      const cleanAdmissionType = (admissionType && typeof admissionType === "string" && admissionType.trim())
        ? admissionType.trim()
        : "planned";
      const cleanComplications = (complications && typeof complications === "string" && complications.trim())
        ? complications.trim()
        : "none";

      // 4. Estimate LOS automatically using available recorded fields
      const losEstimate = await estimateAdmissionLos(
        {
          unitName: bed.unit_name,
          icuUnit: icuUnit || bed.unit_name,
          procedureType: cleanProcedureType,
          condition: cleanCondition,
          admissionType: cleanAdmissionType,
          complications: cleanComplications,
          ageGroup: ageGroup || undefined,
        },
        admTime
      );

      // 5. Update bed to OCCUPIED
      await client.query(
        `UPDATE beds
         SET status = 'OCCUPIED', current_patient_ref = $1, updated_at = NOW()
         WHERE id = $2`,
        [syntheticRef, targetBedId]
      );

      const combinedNotes = [
        cleanDiagnosis ? `Diagnosis: ${cleanDiagnosis}` : "",
        cleanProcedureType ? `Procedure: ${cleanProcedureType}` : "",
        notes && typeof notes === "string" && notes.trim() ? notes.trim() : "",
      ].filter(Boolean).join(" | ") || "ICU clinical admission";

      // 6. Insert admission record
      const admissionResult = await client.query<{ id: number }>(
        `INSERT INTO admissions (
           patient_ref, patient_name, procedure_type, bed_id, admission_time, expected_discharge_time,
           status, admitting_doctor_id, condition, notes, diagnosis, admission_type, complications,
           predicted_los_days, prediction_status, prediction_reason, predicted_free_time, prediction_updated_at, prediction_inputs,
           created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'ADMITTED', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), $17, NOW(), NOW())
         RETURNING id`,
        [
          syntheticRef,
          cleanPatientName,
          cleanProcedureType,
          targetBedId,
          admTime,
          expDischarge,
          resolvedDoctorId,
          cleanCondition,
          combinedNotes,
          cleanDiagnosis,
          cleanAdmissionType,
          cleanComplications,
          losEstimate.predictedLosDays,
          losEstimate.status,
          losEstimate.reason,
          losEstimate.predictedFreeTime,
          losEstimate.inputs ? JSON.stringify(losEstimate.inputs) : null,
        ]
      );

      const admissionId = admissionResult.rows[0]!.id;

      // 7. Write audit log
      await recordAudit(client, req.user!, "ADMIT_PATIENT", "BED", targetBedId, {
        bed_number: bed.bed_number,
        patient_ref: syntheticRef,
        patient_name: cleanPatientName,
        procedure_type: cleanProcedureType,
        admission_id: admissionId,
        is_isolation: bed.is_isolation,
        admitting_doctor_id: resolvedDoctorId,
        condition: cleanCondition,
        admission_time: admTime.toISOString(),
        predicted_los_days: losEstimate.predictedLosDays,
        prediction_status: losEstimate.status,
      });

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        message: `Patient '${cleanPatientName}' (${syntheticRef}) successfully admitted to Bed '${bed.bed_number}'.`,
        admissionId,
        patientRef: syntheticRef,
        patientName: cleanPatientName,
        bedId: bed.id,
        bedNumber: bed.bed_number,
        icuUnit: bed.unit_name,
        admittingDoctorId: resolvedDoctorId,
        assignedDoctorName: doctorName,
        admissionTime: admTime.toISOString(),
        status: "OCCUPIED",
        condition: cleanCondition,
        diagnosis: cleanDiagnosis,
        admissionType: cleanAdmissionType,
        complications: cleanComplications,
        predictedLosDays: losEstimate.predictedLosDays,
        predictionStatus: losEstimate.status,
        predictionReason: losEstimate.reason,
        predictedFreeTime: losEstimate.predictedFreeTime ? losEstimate.predictedFreeTime.toISOString() : null,
      });
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      console.error("Admit patient error:", err);
      res.status(500).json({ error: "Failed to admit patient" });
    } finally {
      client.release();
    }
  }
);


/**
 * POST /api/icu/beds/:id/discharge
 * Discharge an admitted patient and automatically create a pending cleaning task
 * Permissions: ADMIN, DOCTOR, NURSE
 * Transaction protected
 */
router.post(
  "/beds/:id/discharge",
  requireRole("ADMIN", "DOCTOR", "NURSE"),
  async (req: Request, res: Response): Promise<void> => {
    const bedId = Number(req.params.id);
    const { taskType, notes } = req.body;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Lock bed row
      const bedResult = await client.query<{
        id: number;
        bed_number: string;
        status: string;
        is_isolation: boolean;
        current_patient_ref: string | null;
      }>("SELECT id, bed_number, status, is_isolation, current_patient_ref FROM beds WHERE id = $1 FOR UPDATE", [bedId]);

      const bed = bedResult.rows[0];
      if (!bed) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Bed not found" });
        return;
      }

      if (bed.status !== "OCCUPIED") {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "Invalid bed state",
          message: `Bed '${bed.bed_number}' is not currently OCCUPIED (current status: ${bed.status}). Only occupied beds can be discharged.`,
        });
        return;
      }

      // Find active admission record
      const admRes = await client.query<{ id: number; admitting_doctor_id: number; patient_ref: string }>(
        "SELECT id, admitting_doctor_id, patient_ref FROM admissions WHERE bed_id = $1 AND status = 'ADMITTED' FOR UPDATE",
        [bedId]
      );
      const activeAdm = admRes.rows[0];

      // Doctor isolation: Doctors can only discharge patients assigned to them
      if (req.user!.role === "DOCTOR") {
        if (!activeAdm || activeAdm.admitting_doctor_id !== req.user!.id) {
          await client.query("ROLLBACK");
          res.status(403).json({
            error: "Forbidden",
            message: "Doctors may only perform patient-related actions on patients assigned to them.",
          });
          return;
        }
      }

      // Close active admission record
      await client.query(
        `UPDATE admissions
         SET status = 'DISCHARGED', actual_discharge_time = NOW(), updated_at = NOW()
         WHERE bed_id = $1 AND status = 'ADMITTED'`,
        [bedId]
      );

      // Determine cleaning task type: Isolation beds mandate DEEP cleaning
      const resolvedTaskType = bed.is_isolation || taskType === "DEEP" ? "DEEP" : "STANDARD";

      // Transition bed status to CLEANING and clear patient reference
      await client.query(
        `UPDATE beds
         SET status = 'CLEANING', current_patient_ref = NULL, updated_at = NOW()
         WHERE id = $1`,
        [bedId]
      );

      // Automatically create a pending cleaning task
      const cleaningResult = await client.query<{ id: number }>(
        `INSERT INTO cleaning_tasks (bed_id, task_type, status, notes, created_at, updated_at)
         VALUES ($1, $2, 'PENDING', $3, NOW(), NOW())
         RETURNING id`,
        [
          bedId,
          resolvedTaskType,
          notes || (bed.is_isolation ? "Automatic terminal deep clean triggered after isolation discharge" : "Standard bed turnover sanitization"),
        ]
      );

      const cleaningTaskId = cleaningResult.rows[0]!.id;

      // Audit log
      await recordAudit(client, req.user!, "DISCHARGE_PATIENT", "BED", bedId, {
        bed_number: bed.bed_number,
        discharged_patient_ref: bed.current_patient_ref,
        cleaning_task_id: cleaningTaskId,
        cleaning_task_type: resolvedTaskType,
      });

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        message: `Patient discharged from Bed '${bed.bed_number}'. Bed state transitioned to CLEANING (${resolvedTaskType} cleaning queued).`,
        bedNumber: bed.bed_number,
        status: "CLEANING",
        cleaningTaskId,
        cleaningType: resolvedTaskType,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Discharge error:", err);
      res.status(500).json({ error: "Failed to discharge patient" });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/icu/beds/:id/transfer
 * Transfer a patient from one bed to another
 * Permissions: ADMIN, DOCTOR, NURSE
 * Uses deadlock-free ordered locking, creates turnover cleaning on source bed, and updates destination bed.
 */
router.post(
  "/beds/:id/transfer",
  requireRole("ADMIN", "DOCTOR", "NURSE"),
  async (req: Request, res: Response): Promise<void> => {
    const sourceBedId = Number(req.params.id);
    const { destinationBedId, targetBedId, reason, transferTime } = req.body;

    const numTargetBedId = Number(destinationBedId || targetBedId);
    if (!numTargetBedId || isNaN(numTargetBedId) || numTargetBedId === sourceBedId) {
      res.status(400).json({ error: "Validation error", message: "A valid distinct destination bed ID is required." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Lock both beds in deterministic numeric order to prevent deadlocks
      const firstId = Math.min(sourceBedId, numTargetBedId);
      const secondId = Math.max(sourceBedId, numTargetBedId);
      const firstBedRes = await client.query<{ id: number; bed_number: string; status: string; is_isolation: boolean; current_patient_ref: string | null }>(
        "SELECT id, bed_number, status, is_isolation, current_patient_ref FROM beds WHERE id = $1 FOR UPDATE",
        [firstId]
      );
      const secondBedRes = await client.query<{ id: number; bed_number: string; status: string; is_isolation: boolean; current_patient_ref: string | null }>(
        "SELECT id, bed_number, status, is_isolation, current_patient_ref FROM beds WHERE id = $1 FOR UPDATE",
        [secondId]
      );

      const bedMap: Record<number, any> = {};
      if (firstBedRes.rows[0]) bedMap[firstId] = firstBedRes.rows[0];
      if (secondBedRes.rows[0]) bedMap[secondId] = secondBedRes.rows[0];

      const sourceBed = bedMap[sourceBedId];
      const destBed = bedMap[numTargetBedId];

      if (!sourceBed) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Source bed not found." });
        return;
      }
      if (!destBed) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Destination bed not found." });
        return;
      }

      if (sourceBed.status !== "OCCUPIED") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Invalid state", message: `Source bed '${sourceBed.bed_number}' is not OCCUPIED.` });
        return;
      }

      // Find active admission on source bed
      const admRes = await client.query<{ id: number; patient_ref: string; admitting_doctor_id: number; notes: string }>(
        "SELECT id, patient_ref, admitting_doctor_id, notes FROM admissions WHERE bed_id = $1 AND status = 'ADMITTED' FOR UPDATE",
        [sourceBedId]
      );
      const activeAdm = admRes.rows[0];
      const patientRef = activeAdm?.patient_ref || sourceBed.current_patient_ref || "PATIENT";

      // Doctor isolation: Doctors can only transfer patients assigned to them
      if (req.user!.role === "DOCTOR") {
        if (!activeAdm || activeAdm.admitting_doctor_id !== req.user!.id) {
          await client.query("ROLLBACK");
          res.status(403).json({
            error: "Forbidden",
            message: "Doctors may only perform patient-related actions on patients assigned to them.",
          });
          return;
        }
      }

      if (destBed.status !== "AVAILABLE" && destBed.status !== "RESERVED") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Invalid state", message: `Destination bed '${destBed.bed_number}' is ${destBed.status}. Must be AVAILABLE or RESERVED.` });
        return;
      }

      // 1. Move admission record to destination bed
      const effTransferTime = transferTime ? new Date(transferTime).toISOString() : new Date().toISOString();
      if (activeAdm) {
        const transferNote = `[Transferred from ${sourceBed.bed_number} to ${destBed.bed_number} at ${effTransferTime}: ${reason || "Clinical transfer"}]`;
        const updatedNotes = activeAdm.notes ? `${activeAdm.notes} | ${transferNote}` : transferNote;
        await client.query(
          "UPDATE admissions SET bed_id = $1, notes = $2, updated_at = NOW() WHERE id = $3",
          [numTargetBedId, updatedNotes, activeAdm.id]
        );
      } else {
        await client.query(
          `INSERT INTO admissions (patient_ref, bed_id, admission_time, status, admitting_doctor_id, notes, created_at, updated_at)
           VALUES ($1, $2, NOW(), 'ADMITTED', $3, $4, NOW(), NOW())`,
          [patientRef, numTargetBedId, req.user!.id, `Transferred from ${sourceBed.bed_number}. Reason: ${reason || "Clinical transfer"}`]
        );
      }

      // 2. Set destination bed to OCCUPIED
      await client.query(
        "UPDATE beds SET status = 'OCCUPIED', current_patient_ref = $1, updated_at = NOW() WHERE id = $2",
        [patientRef, numTargetBedId]
      );

      // 3. Set source bed to CLEANING and create pending cleaning task
      await client.query(
        "UPDATE beds SET status = 'CLEANING', current_patient_ref = NULL, updated_at = NOW() WHERE id = $1",
        [sourceBedId]
      );

      const taskType = sourceBed.is_isolation ? "DEEP" : "STANDARD";
      const cleanTaskRes = await client.query<{ id: number }>(
        `INSERT INTO cleaning_tasks (bed_id, task_type, status, notes, created_at, updated_at)
         VALUES ($1, $2, 'PENDING', $3, NOW(), NOW()) RETURNING id`,
        [sourceBedId, taskType, `Post-transfer turnover sanitization (Patient transferred to ${destBed.bed_number})`]
      );

      // 4. Audit log
      await recordAudit(client, req.user!, "BED_TRANSFER", "BED", sourceBedId, {
        from_bed_id: sourceBedId,
        from_bed_number: sourceBed.bed_number,
        to_bed_id: numTargetBedId,
        to_bed_number: destBed.bed_number,
        patient_ref: patientRef,
        reason: reason || "Clinical transfer",
        transfer_time: effTransferTime,
        cleaning_task_id: cleanTaskRes.rows[0]?.id,
      });

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        message: `Patient '${patientRef}' transferred successfully from ${sourceBed.bed_number} to ${destBed.bed_number}. Source bed queued for turnover cleaning.`,
        fromBed: sourceBed.bed_number,
        toBed: destBed.bed_number,
        patientRef,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Transfer bed error:", err);
      res.status(500).json({ error: "Failed to transfer patient" });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/icu/beds/:id/reserve
 * Reserve an available bed
 * Permissions: ADMIN, NURSE (Doctors restricted from reservation operations)
 */
router.post(
  "/beds/:id/reserve",
  requireRole("ADMIN", "NURSE"),
  async (req: Request, res: Response): Promise<void> => {
    const bedId = Number(req.params.id);
    const { patientRef, reservationRef, plannedAdmissionTime, doctorId, notes } = req.body;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const bedResult = await client.query<{ id: number; bed_number: string; status: string }>(
        "SELECT id, bed_number, status FROM beds WHERE id = $1 FOR UPDATE",
        [bedId]
      );

      const bed = bedResult.rows[0];
      if (!bed) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Bed not found" });
        return;
      }

      if (bed.status !== "AVAILABLE") {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "Invalid bed state",
          message: `Bed '${bed.bed_number}' is ${bed.status}. Only AVAILABLE beds can be reserved.`,
        });
        return;
      }

      const assignedRef = (reservationRef || patientRef || "PT-RESERVED").trim().toUpperCase();

      await client.query(
        `UPDATE beds
         SET status = 'RESERVED', current_patient_ref = $1, updated_at = NOW()
         WHERE id = $2`,
        [assignedRef, bedId]
      );

      await recordAudit(client, req.user!, "RESERVE_BED", "BED", bedId, {
        bed_number: bed.bed_number,
        reserved_for: assignedRef,
        planned_admission_time: plannedAdmissionTime || null,
        doctor_id: doctorId || null,
        notes,
      });

      await client.query("COMMIT");
      res.status(200).json({
        success: true,
        message: `Bed '${bed.bed_number}' reserved successfully for ${assignedRef}.`,
        status: "RESERVED",
        patientRef: assignedRef,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Reserve bed error:", err);
      res.status(500).json({ error: "Failed to reserve bed" });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/icu/beds/:id/release-reservation
 * Release a reserved bed back to AVAILABLE
 * Permissions: ADMIN, NURSE (Doctors restricted from reservation operations)
 */
router.post(
  "/beds/:id/release-reservation",
  requireRole("ADMIN", "NURSE"),
  async (req: Request, res: Response): Promise<void> => {
    const bedId = Number(req.params.id);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const bedResult = await client.query<{ id: number; bed_number: string; status: string }>(
        "SELECT id, bed_number, status FROM beds WHERE id = $1 FOR UPDATE",
        [bedId]
      );

      const bed = bedResult.rows[0];
      if (!bed) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Bed not found" });
        return;
      }

      if (bed.status !== "RESERVED") {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "Invalid bed state",
          message: `Bed '${bed.bed_number}' is not currently RESERVED.`,
        });
        return;
      }

      await client.query(
        `UPDATE beds
         SET status = 'AVAILABLE', current_patient_ref = NULL, updated_at = NOW()
         WHERE id = $1`,
        [bedId]
      );

      await recordAudit(client, req.user!, "RELEASE_RESERVATION", "BED", bedId, {
        bed_number: bed.bed_number,
      });

      await client.query("COMMIT");
      res.status(200).json({
        success: true,
        message: `Reservation for Bed '${bed.bed_number}' released. Bed is now AVAILABLE.`,
        status: "AVAILABLE",
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Release reservation error:", err);
      res.status(500).json({ error: "Failed to release reservation" });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/icu/beds/:id/maintenance
 * Mark bed for maintenance
 * Permissions: ADMIN, NURSE
 */
router.post(
  "/beds/:id/maintenance",
  requireRole("ADMIN", "NURSE"),
  async (req: Request, res: Response): Promise<void> => {
    const bedId = Number(req.params.id);
    const { reason, staffMember, startTime, notes } = req.body;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const bedResult = await client.query<{ id: number; bed_number: string; status: string }>(
        "SELECT id, bed_number, status FROM beds WHERE id = $1 FOR UPDATE",
        [bedId]
      );

      const bed = bedResult.rows[0];
      if (!bed) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Bed not found" });
        return;
      }

      if (bed.status === "OCCUPIED") {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "Bed occupied",
          message: `Cannot place Bed '${bed.bed_number}' in maintenance while a patient is admitted. Discharge the patient first.`,
        });
        return;
      }

      await client.query(
        `UPDATE beds
         SET status = 'MAINTENANCE', current_patient_ref = NULL, updated_at = NOW()
         WHERE id = $1`,
        [bedId]
      );

      await recordAudit(client, req.user!, "MAINTENANCE_START", "BED", bedId, {
        bed_number: bed.bed_number,
        reason: reason || "Scheduled biomedical inspection / repair",
        staff_member: staffMember || null,
        start_time: startTime || new Date().toISOString(),
        notes: notes || null,
      });

      await client.query("COMMIT");
      res.status(200).json({
        success: true,
        message: `Bed '${bed.bed_number}' placed in MAINTENANCE.`,
        status: "MAINTENANCE",
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Maintenance error:", err);
      res.status(500).json({ error: "Failed to place bed in maintenance" });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/icu/beds/:id/complete-maintenance
 * Return bed from maintenance
 * Permissions: ADMIN, NURSE
 */
router.post(
  "/beds/:id/complete-maintenance",
  requireRole("ADMIN", "NURSE"),
  async (req: Request, res: Response): Promise<void> => {
    const bedId = Number(req.params.id);
    const { requiresCleaning } = req.body;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const bedResult = await client.query<{ id: number; bed_number: string; status: string; is_isolation: boolean }>(
        "SELECT id, bed_number, status, is_isolation FROM beds WHERE id = $1 FOR UPDATE",
        [bedId]
      );

      const bed = bedResult.rows[0];
      if (!bed) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Bed not found" });
        return;
      }

      if (bed.status !== "MAINTENANCE") {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "Invalid bed state",
          message: `Bed '${bed.bed_number}' is not in MAINTENANCE.`,
        });
        return;
      }

      // If cleaning is required (recommended after biomedical maintenance)
      let cleaningTaskId: number | null = null;
      if (requiresCleaning) {
        await client.query(
          `UPDATE beds SET status = 'CLEANING', updated_at = NOW() WHERE id = $1`,
          [bedId]
        );
        const ctResult = await client.query<{ id: number }>(
          `INSERT INTO cleaning_tasks (bed_id, task_type, status, notes, created_at, updated_at)
           VALUES ($1, 'STANDARD', 'PENDING', 'Post-maintenance turnover cleaning', NOW(), NOW())
           RETURNING id`,
          [bedId]
        );
        cleaningTaskId = ctResult.rows[0]?.id || null;
      } else {
        await client.query(
          `UPDATE beds SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1`,
          [bedId]
        );
      }

      await recordAudit(client, req.user!, "MAINTENANCE_COMPLETE", "BED", bedId, {
        bed_number: bed.bed_number,
        requires_cleaning: Boolean(requiresCleaning),
        cleaning_task_id: cleaningTaskId,
      });

      await client.query("COMMIT");
      res.status(200).json({
        success: true,
        message: `Maintenance completed for Bed '${bed.bed_number}'.`,
        status: requiresCleaning ? "CLEANING" : "AVAILABLE",
        cleaningTaskId,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Complete maintenance error:", err);
      res.status(500).json({ error: "Failed to complete maintenance" });
    } finally {
      client.release();
    }
  }
);

// ==============================================================================
// 5. CLEANING TASKS & TURNOVER BOARD
// ==============================================================================

/**
 * GET /api/icu/cleaning-tasks
 * View cleaning tasks with overdue indicator and filters
 * Permissions: ADMIN, DOCTOR, NURSE, HOUSEKEEPING
 */
router.get("/cleaning-tasks", async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, unitId } = req.query;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    if (status && typeof status === "string") {
      conditions.push(`ct.status = $${pIdx++}`);
      params.push(status.toUpperCase());
    }

    if (unitId && !isNaN(Number(unitId))) {
      conditions.push(`b.unit_id = $${pIdx++}`);
      params.push(Number(unitId));
    }

    // Role-specific scoping: Housekeeping can view cleaning tasks assigned to them OR unassigned pending tasks
    if (req.user?.role === "HOUSEKEEPING") {
      conditions.push(`(ct.assigned_user_id = $${pIdx++} OR (ct.assigned_user_id IS NULL AND ct.status = 'PENDING'))`);
      params.push(req.user.id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT
        ct.id,
        ct.bed_id,
        b.bed_number,
        b.is_isolation,
        u.name AS unit_name,
        ct.task_type,
        ct.status,
        ct.assigned_user_id,
        usr.email AS assigned_user_email,
        usr.username AS assigned_user_name,
        ct.start_time,
        ct.completion_time,
        ct.notes,
        ct.created_at,
        ct.updated_at,
        -- Calculated overdue flag
        CASE
          WHEN ct.status = 'PENDING' AND ct.created_at < NOW() - INTERVAL '45 minutes' THEN TRUE
          WHEN ct.status = 'IN_PROGRESS' AND ct.task_type = 'STANDARD' AND ct.start_time < NOW() - INTERVAL '60 minutes' THEN TRUE
          WHEN ct.status = 'IN_PROGRESS' AND ct.task_type = 'DEEP' AND ct.start_time < NOW() - INTERVAL '90 minutes' THEN TRUE
          ELSE FALSE
        END AS is_overdue,
        -- Elapsed minutes
        ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(ct.start_time, ct.created_at))) / 60) AS elapsed_minutes
       FROM cleaning_tasks ct
       JOIN beds b ON b.id = ct.bed_id
       JOIN icu_units u ON u.id = b.unit_id
       LEFT JOIN users usr ON usr.id = ct.assigned_user_id
       ${whereClause}
       ORDER BY
         CASE ct.status
           WHEN 'PENDING' THEN 1
           WHEN 'IN_PROGRESS' THEN 2
           WHEN 'COMPLETED' THEN 3
         END,
         ct.created_at DESC`,
      params
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("List cleaning tasks error:", err);
    res.status(500).json({ error: "Failed to list cleaning tasks" });
  }
});

/**
 * POST /api/icu/cleaning-tasks/:id/assign
 * Assign a housekeeper or staff member to a cleaning task
 * Permissions: ADMIN, NURSE, HOUSEKEEPING
 */
router.post(
  "/cleaning-tasks/:id/assign",
  requireRole("ADMIN", "NURSE", "HOUSEKEEPING"),
  async (req: Request, res: Response): Promise<void> => {
    const taskId = Number(req.params.id);
    const { cleanerId, assignedUserId, notes } = req.body;
    const targetUserId = Number(cleanerId || assignedUserId);

    if (!targetUserId || isNaN(targetUserId)) {
      res.status(400).json({ error: "Validation error", message: "A valid staff/cleaner ID is required." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const taskRes = await client.query<{ id: number; bed_id: number; status: string }>(
        "SELECT id, bed_id, status FROM cleaning_tasks WHERE id = $1 FOR UPDATE",
        [taskId]
      );
      const task = taskRes.rows[0];
      if (!task) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Cleaning task not found" });
        return;
      }

      const userRes = await client.query<{ id: number; email: string; username: string; role: string }>(
        "SELECT id, email, username, role FROM users WHERE id = $1 AND active = TRUE",
        [targetUserId]
      );
      const staffUser = userRes.rows[0];
      if (!staffUser) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Assigned user not found" });
        return;
      }
      if (staffUser.role !== "HOUSEKEEPING") {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Validation error",
          message: "Cleaning is performed exclusively by Housekeeping staff. Assigned cleaner must have the HOUSEKEEPING role.",
        });
        return;
      }

      await client.query(
        "UPDATE cleaning_tasks SET assigned_user_id = $1, notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $3",
        [targetUserId, notes || null, taskId]
      );

      await recordAudit(client, req.user!, "CLEANER_ASSIGNED", "CLEANING_TASK", taskId, {
        bed_id: task.bed_id,
        cleaner_id: staffUser.id,
        cleaner_email: staffUser.email,
        cleaner_username: staffUser.username,
        notes,
      });

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        message: `Assigned '${staffUser.username || staffUser.email}' to cleaning task #${taskId}.`,
        taskId,
        cleaner: {
          id: staffUser.id,
          email: staffUser.email,
          username: staffUser.username,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Assign cleaner to task error:", err);
      res.status(500).json({ error: "Failed to assign cleaner" });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/icu/beds/:id/assign-cleaner
 * Assign a housekeeper to a bed's active cleaning task
 * Permissions: ADMIN, NURSE, HOUSEKEEPING
 */
router.post(
  "/beds/:id/assign-cleaner",
  requireRole("ADMIN", "NURSE", "HOUSEKEEPING"),
  async (req: Request, res: Response): Promise<void> => {
    const bedId = Number(req.params.id);
    const { cleanerId, assignedUserId, notes } = req.body;
    const targetUserId = Number(cleanerId || assignedUserId);

    if (!targetUserId || isNaN(targetUserId)) {
      res.status(400).json({ error: "Validation error", message: "A valid staff/cleaner ID is required." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const userRes = await client.query<{ id: number; email: string; username: string; role: string }>(
        "SELECT id, email, username, role FROM users WHERE id = $1 AND active = TRUE",
        [targetUserId]
      );
      const staffUser = userRes.rows[0];
      if (!staffUser) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Assigned cleaner/staff not found" });
        return;
      }
      if (staffUser.role !== "HOUSEKEEPING") {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Validation error",
          message: "Cleaning is performed exclusively by Housekeeping staff. Assigned cleaner must have the HOUSEKEEPING role.",
        });
        return;
      }

      // Check for active cleaning task for this bed
      const taskRes = await client.query<{ id: number; status: string }>(
        "SELECT id, status FROM cleaning_tasks WHERE bed_id = $1 AND status != 'COMPLETED' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [bedId]
      );
      let taskId = taskRes.rows[0]?.id;

      if (!taskId) {
        // If bed is in CLEANING state without a task, create one
        const bedRes = await client.query<{ id: number; bed_number: string; status: string; is_isolation: boolean }>(
          "SELECT id, bed_number, status, is_isolation FROM beds WHERE id = $1 FOR UPDATE",
          [bedId]
        );
        const bed = bedRes.rows[0];
        if (!bed || bed.status !== "CLEANING") {
          await client.query("ROLLBACK");
          res.status(409).json({ error: "Invalid state", message: "Bed is not in CLEANING state." });
          return;
        }

        const taskType = bed.is_isolation ? "DEEP" : "STANDARD";
        const insertTask = await client.query<{ id: number }>(
          `INSERT INTO cleaning_tasks (bed_id, task_type, status, assigned_user_id, notes, created_at, updated_at)
           VALUES ($1, $2, 'PENDING', $3, $4, NOW(), NOW()) RETURNING id`,
          [bedId, taskType, targetUserId, notes || "Turnover decontamination"]
        );
        taskId = insertTask.rows[0]!.id;
      } else {
        await client.query(
          "UPDATE cleaning_tasks SET assigned_user_id = $1, notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $3",
          [targetUserId, notes || null, taskId]
        );
      }

      await recordAudit(client, req.user!, "CLEANER_ASSIGNED", "CLEANING_TASK", taskId, {
        bed_id: bedId,
        cleaner_id: staffUser.id,
        cleaner_email: staffUser.email,
        cleaner_username: staffUser.username,
        notes,
      });

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        message: `Cleaner '${staffUser.username || staffUser.email}' assigned to bed cleaning.`,
        taskId,
        cleaner: {
          id: staffUser.id,
          email: staffUser.email,
          username: staffUser.username,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Assign cleaner to bed error:", err);
      res.status(500).json({ error: "Failed to assign cleaner" });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/icu/cleaning-tasks/:id/start
 * Start a cleaning task
 * Permissions: HOUSEKEEPING only (Cleaning performed exclusively by Housekeeping staff)
 */
router.post(
  "/cleaning-tasks/:id/start",
  requireRole("HOUSEKEEPING"),
  async (req: Request, res: Response): Promise<void> => {
    const taskId = Number(req.params.id);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const taskResult = await client.query<{
        id: number;
        bed_id: number;
        status: string;
        task_type: string;
        assigned_user_id: number | null;
      }>("SELECT id, bed_id, status, task_type, assigned_user_id FROM cleaning_tasks WHERE id = $1 FOR UPDATE", [taskId]);

      const task = taskResult.rows[0];
      if (!task) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Cleaning task not found" });
        return;
      }

      // Housekeeper privacy and isolation enforcement: cannot start tasks assigned to other housekeepers
      if (task.assigned_user_id !== null && task.assigned_user_id !== req.user!.id) {
        await client.query("ROLLBACK");
        res.status(403).json({
          error: "Forbidden",
          message: "You can only start cleaning tasks assigned to you.",
        });
        return;
      }

      if (task.status !== "PENDING") {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "Invalid task state",
          message: `Task is already ${task.status}.`,
        });
        return;
      }

      await client.query(
        `UPDATE cleaning_tasks
         SET status = 'IN_PROGRESS', start_time = NOW(), assigned_user_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [req.user!.id, taskId]
      );

      // Ensure bed status is CLEANING
      await client.query(
        `UPDATE beds SET status = 'CLEANING', updated_at = NOW() WHERE id = $1`,
        [task.bed_id]
      );

      await recordAudit(client, req.user!, "CLEANING_STARTED", "CLEANING_TASK", taskId, {
        bed_id: task.bed_id,
        task_type: task.task_type,
      });

      await client.query("COMMIT");
      res.status(200).json({
        success: true,
        message: `${task.task_type} cleaning started.`,
        status: "IN_PROGRESS",
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Start cleaning error:", err);
      res.status(500).json({ error: "Failed to start cleaning task" });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/icu/cleaning-tasks/:id/complete
 * Complete cleaning task and return bed to AVAILABLE if no uncompleted tasks remain
 * Permissions: HOUSEKEEPING only (Cleaning performed exclusively by Housekeeping staff)
 */
router.post(
  "/cleaning-tasks/:id/complete",
  requireRole("HOUSEKEEPING"),
  async (req: Request, res: Response): Promise<void> => {
    const taskId = Number(req.params.id);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const taskResult = await client.query<{
        id: number;
        bed_id: number;
        status: string;
        task_type: string;
        assigned_user_id: number | null;
      }>("SELECT id, bed_id, status, task_type, assigned_user_id FROM cleaning_tasks WHERE id = $1 FOR UPDATE", [taskId]);

      const task = taskResult.rows[0];
      if (!task) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Cleaning task not found" });
        return;
      }

      // Housekeeper privacy and isolation enforcement: cannot complete tasks assigned to other housekeepers
      if (task.assigned_user_id !== null && task.assigned_user_id !== req.user!.id) {
        await client.query("ROLLBACK");
        res.status(403).json({
          error: "Forbidden",
          message: "You can only complete cleaning tasks assigned to you.",
        });
        return;
      }

      if (task.status === "COMPLETED") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Invalid task state", message: "Task is already COMPLETED." });
        return;
      }

      if (task.status !== "IN_PROGRESS") {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "Invalid task transition",
          message: `Task is currently ${task.status}. Cleaning task must be in progress before it can be completed.`,
        });
        return;
      }

      // Mark task completed
      await client.query(
        `UPDATE cleaning_tasks
         SET status = 'COMPLETED', completion_time = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [taskId]
      );

      // Check if there are other uncompleted cleaning tasks for this bed
      const pendingCheck = await client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM cleaning_tasks WHERE bed_id = $1 AND status != 'COMPLETED'`,
        [task.bed_id]
      );

      const remainingTasks = parseInt(pendingCheck.rows[0]?.count || "0", 10);
      let bedNowAvailable = false;

      // Bed only transitions to AVAILABLE if all required cleaning tasks are done
      if (remainingTasks === 0) {
        await client.query(
          `UPDATE beds SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1`,
          [task.bed_id]
        );
        bedNowAvailable = true;
      }

      // Retrieve bed number for response
      const bedResult = await client.query<{ bed_number: string }>(
        "SELECT bed_number FROM beds WHERE id = $1",
        [task.bed_id]
      );
      const bedNumber = bedResult.rows[0]?.bed_number || `Bed ${task.bed_id}`;

      await recordAudit(client, req.user!, "CLEANING_COMPLETED", "CLEANING_TASK", taskId, {
        bed_id: task.bed_id,
        bed_number: bedNumber,
        task_type: task.task_type,
        bed_returned_to_available: bedNowAvailable,
      });

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        message: `${task.task_type} cleaning for '${bedNumber}' marked COMPLETED.${bedNowAvailable ? " Bed returned to AVAILABLE state." : ""}`,
        bedId: task.bed_id,
        bedNumber,
        bedStatus: bedNowAvailable ? "AVAILABLE" : "CLEANING",
        taskId,
        status: "COMPLETED",
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Complete cleaning error:", err);
      res.status(500).json({ error: "Failed to complete cleaning task" });
    } finally {
      client.release();
    }
  }
);

// ==============================================================================
// 6. ADMISSIONS & CLINICAL PATIENT ENDPOINTS
// ==============================================================================

/**
 * GET /api/icu/admissions
 * List patient admissions.
 * Permissions: ADMIN, DOCTOR, NURSE (HOUSEKEEPING excluded).
 * Security: When requested by DOCTOR role, strictly isolates results to patients assigned to the authenticated doctor.
 */
router.get(
  "/admissions",
  requireRole("ADMIN", "DOCTOR", "NURSE"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, unitId } = req.query;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let pIdx = 1;

      // DOCTOR role isolation: Doctor can only access their own assigned patients!
      if (req.user?.role === "DOCTOR") {
        conditions.push(`adm.admitting_doctor_id = $${pIdx++}`);
        params.push(req.user.id);
      }

      if (status && typeof status === "string") {
        conditions.push(`adm.status = $${pIdx++}`);
        params.push(status.toUpperCase());
      }

      if (unitId && !isNaN(Number(unitId))) {
        conditions.push(`b.unit_id = $${pIdx++}`);
        params.push(Number(unitId));
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await query(
        `SELECT
          adm.id,
          adm.patient_ref,
          adm.patient_name,
          adm.procedure_type,
          adm.bed_id,
          b.bed_number,
          b.is_isolation,
          u.name AS unit_name,
          adm.admission_time,
          adm.expected_discharge_time,
          adm.actual_discharge_time,
          adm.status,
          adm.condition,
          adm.notes,
          adm.admitting_doctor_id,
          doc.email AS admitting_doctor_email,
          doc.username AS admitting_doctor_name,
          adm.predicted_los_days,
          adm.prediction_status,
          adm.prediction_reason,
          adm.predicted_free_time,
          adm.prediction_updated_at,
          adm.prediction_inputs
         FROM admissions adm
         JOIN beds b ON b.id = adm.bed_id
         JOIN icu_units u ON u.id = b.unit_id
         LEFT JOIN users doc ON doc.id = adm.admitting_doctor_id
         ${whereClause}
         ORDER BY adm.admission_time DESC
         LIMIT 100`,
        params
      );

      res.status(200).json(result.rows);
    } catch (err) {
      console.error("List admissions error:", err);
      res.status(500).json({ error: "Failed to load admissions" });
    }
  }
);

/**
 * GET /api/icu/admissions/:id
 * Retrieve single admission record with patient ownership enforcement
 * Permissions: ADMIN, DOCTOR, NURSE
 */
router.get(
  "/admissions/:id",
  requireRole("ADMIN", "DOCTOR", "NURSE"),
  async (req: Request, res: Response): Promise<void> => {
    const admissionId = Number(req.params.id);
    if (isNaN(admissionId)) {
      res.status(400).json({ error: "Invalid admission ID" });
      return;
    }

    try {
      const result = await query(
        `SELECT
          adm.id,
          adm.patient_ref,
          adm.patient_name,
          adm.procedure_type,
          adm.bed_id,
          b.bed_number,
          b.is_isolation,
          u.name AS unit_name,
          adm.admission_time,
          adm.expected_discharge_time,
          adm.actual_discharge_time,
          adm.status,
          adm.condition,
          adm.notes,
          adm.admitting_doctor_id,
          doc.email AS admitting_doctor_email,
          doc.username AS admitting_doctor_name,
          adm.predicted_los_days,
          adm.prediction_status,
          adm.prediction_reason,
          adm.predicted_free_time,
          adm.prediction_updated_at,
          adm.prediction_inputs
         FROM admissions adm
         JOIN beds b ON b.id = adm.bed_id
         JOIN icu_units u ON u.id = b.unit_id
         LEFT JOIN users doc ON doc.id = adm.admitting_doctor_id
         WHERE adm.id = $1`,
        [admissionId]
      );

      const admission = result.rows[0];
      if (!admission) {
        res.status(404).json({ error: "Admission record not found" });
        return;
      }

      // Enforce doctor ownership: Doctor cannot access another doctor's patient details
      if (req.user?.role === "DOCTOR" && admission.admitting_doctor_id !== req.user.id) {
        res.status(403).json({
          error: "Forbidden",
          message: "You are not authorized to view clinical details for patients assigned to another doctor.",
        });
        return;
      }

      res.status(200).json(admission);
    } catch (err) {
      console.error("Get admission error:", err);
      res.status(500).json({ error: "Failed to load admission details" });
    }
  }
);

/**
 * PATCH /api/icu/admissions/:id/condition
 * Update patient clinical condition with doctor ownership enforcement and audit logging
 * Permissions: DOCTOR, ADMIN
 */
router.patch(
  "/admissions/:id/condition",
  requireRole("DOCTOR", "ADMIN"),
  async (req: Request, res: Response): Promise<void> => {
    const admissionId = Number(req.params.id);
    const { condition, notes } = req.body;

    if (isNaN(admissionId)) {
      res.status(400).json({ error: "Invalid admission ID." });
      return;
    }

    if (!condition || typeof condition !== "string" || !condition.trim()) {
      res.status(400).json({ error: "Validation error", message: "Patient condition cannot be empty." });
      return;
    }

    const trimmedCondition = condition.trim().slice(0, 255);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const admRes = await client.query<{
        id: number;
        patient_ref: string;
        bed_id: number;
        status: string;
        admitting_doctor_id: number;
        condition: string | null;
        notes: string | null;
      }>("SELECT id, patient_ref, bed_id, status, admitting_doctor_id, condition, notes FROM admissions WHERE id = $1 FOR UPDATE", [admissionId]);

      const admission = admRes.rows[0];
      if (!admission) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Admission record not found." });
        return;
      }

      // Enforce patient ownership for DOCTOR role
      if (req.user?.role === "DOCTOR" && admission.admitting_doctor_id !== req.user.id) {
        await client.query("ROLLBACK");
        res.status(403).json({
          error: "Forbidden",
          message: "You are not authorized to update clinical records for patients assigned to another doctor.",
        });
        return;
      }

      const previousCondition = admission.condition || "Unspecified";
      const updatedNotes = notes !== undefined ? notes : admission.notes;

      const updateRes = await client.query(
        `UPDATE admissions
         SET condition = $1, notes = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING id, patient_ref, bed_id, status, admitting_doctor_id, condition, notes, updated_at`,
        [trimmedCondition, updatedNotes, admissionId]
      );

      // Record audit log
      await recordAudit(client, req.user!, "UPDATE_PATIENT_CONDITION", "ADMISSION", admissionId, {
        patient_ref: admission.patient_ref,
        bed_id: admission.bed_id,
        previous_condition: previousCondition,
        new_condition: trimmedCondition,
        updated_by_role: req.user!.role,
        updated_by_doctor_id: req.user!.id,
      });

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        message: `Condition for patient '${admission.patient_ref}' updated successfully to '${trimmedCondition}'.`,
        admission: updateRes.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Update patient condition error:", err);
      res.status(500).json({ error: "Failed to update patient condition." });
    } finally {
      client.release();
    }
  }
);

// Also accept PUT for flexibility
router.put(
  "/admissions/:id/condition",
  requireRole("DOCTOR", "ADMIN"),
  async (req: Request, res: Response): Promise<void> => {
    // Route to PATCH logic
    const admissionId = Number(req.params.id);
    const { condition, notes } = req.body;

    if (isNaN(admissionId)) {
      res.status(400).json({ error: "Invalid admission ID." });
      return;
    }

    if (!condition || typeof condition !== "string" || !condition.trim()) {
      res.status(400).json({ error: "Validation error", message: "Patient condition cannot be empty." });
      return;
    }

    const trimmedCondition = condition.trim().slice(0, 255);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const admRes = await client.query<{
        id: number;
        patient_ref: string;
        bed_id: number;
        status: string;
        admitting_doctor_id: number;
        condition: string | null;
        notes: string | null;
      }>("SELECT id, patient_ref, bed_id, status, admitting_doctor_id, condition, notes FROM admissions WHERE id = $1 FOR UPDATE", [admissionId]);

      const admission = admRes.rows[0];
      if (!admission) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Admission record not found." });
        return;
      }

      if (req.user?.role === "DOCTOR" && admission.admitting_doctor_id !== req.user.id) {
        await client.query("ROLLBACK");
        res.status(403).json({
          error: "Forbidden",
          message: "You are not authorized to update clinical records for patients assigned to another doctor.",
        });
        return;
      }

      const previousCondition = admission.condition || "Unspecified";
      const updatedNotes = notes !== undefined ? notes : admission.notes;

      const updateRes = await client.query(
        `UPDATE admissions
         SET condition = $1, notes = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING id, patient_ref, bed_id, status, admitting_doctor_id, condition, notes, updated_at`,
        [trimmedCondition, updatedNotes, admissionId]
      );

      await recordAudit(client, req.user!, "UPDATE_PATIENT_CONDITION", "ADMISSION", admissionId, {
        patient_ref: admission.patient_ref,
        bed_id: admission.bed_id,
        previous_condition: previousCondition,
        new_condition: trimmedCondition,
        updated_by_role: req.user!.role,
        updated_by_doctor_id: req.user!.id,
      });

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        message: `Condition for patient '${admission.patient_ref}' updated successfully to '${trimmedCondition}'.`,
        admission: updateRes.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Update patient condition error:", err);
      res.status(500).json({ error: "Failed to update patient condition." });
    } finally {
      client.release();
    }
  }
);

// ==============================================================================
// 7. AUDIT LOGS
// ==============================================================================

/**
 * GET /api/icu/audit-logs
 * List recent audit events
 * Permissions: ADMIN, DOCTOR, NURSE
 */
router.get(
  "/audit-logs",
  requireRole("ADMIN", "DOCTOR", "NURSE"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(Number(req.query.limit) || 25, 100);
      const result = await query(
        `SELECT id, user_email, user_role, action, entity_type, entity_id, details, created_at
         FROM audit_logs
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );
      res.status(200).json(result.rows);
    } catch (err) {
      console.error("List audit logs error:", err);
      res.status(500).json({ error: "Failed to load audit logs" });
    }
  }
);

// ==============================================================================
// 8. BED READINESS INTELLIGENCE & FORECASTING
// ==============================================================================

/**
 * GET /api/icu/readiness/settings
 * Retrieve simulation scenarios and capacity threshold configuration
 * Permissions: ADMIN, DOCTOR, NURSE
 */
router.get(
  "/readiness/settings",
  requireRole("ADMIN", "DOCTOR", "NURSE"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await query<{ value: any }>(
        "SELECT value FROM system_settings WHERE key = 'readiness_config'"
      );
      const config = result.rows[0]?.value || {
        scenario: "Normal",
        warningBufferBeds: 2,
        turnoverTargetMinutesStandard: 45,
        turnoverTargetMinutesDeep: 75,
        simulatedSurgeDemand: 0,
      };
      res.status(200).json(config);
    } catch (err) {
      console.error("Get readiness settings error:", err);
      res.status(500).json({ error: "Failed to load readiness configuration" });
    }
  }
);

/**
 * POST /api/icu/readiness/settings
 * Update simulation scenario and threshold buffer (ADMIN ONLY)
 * Permissions: ADMIN
 */
router.post(
  "/readiness/settings",
  requireRole("ADMIN"),
  async (req: Request, res: Response): Promise<void> => {
    const { scenario, warningBufferBeds } = req.body;

    const validScenarios = ["Normal", "Busy", "Surge"];
    if (scenario && !validScenarios.includes(scenario)) {
      res.status(400).json({
        error: "Validation error",
        message: `Invalid scenario '${scenario}'. Must be one of: ${validScenarios.join(", ")}.`,
      });
      return;
    }

    const numBuffer = Number(warningBufferBeds);
    if (warningBufferBeds !== undefined && (isNaN(numBuffer) || numBuffer < 0 || numBuffer > 20)) {
      res.status(400).json({
        error: "Validation error",
        message: "Warning buffer beds must be an integer between 0 and 20.",
      });
      return;
    }

    try {
      const currentRes = await query<{ value: any }>(
        "SELECT value FROM system_settings WHERE key = 'readiness_config'"
      );
      const currentConfig = currentRes.rows[0]?.value || {
        scenario: "Normal",
        warningBufferBeds: 2,
        turnoverTargetMinutesStandard: 45,
        turnoverTargetMinutesDeep: 75,
        simulatedSurgeDemand: 0,
      };

      const updatedScenario = scenario || currentConfig.scenario;
      const updatedDemand = updatedScenario === "Surge" ? 5 : updatedScenario === "Busy" ? 2 : 0;
      const updatedBuffer = warningBufferBeds !== undefined ? numBuffer : currentConfig.warningBufferBeds;

      const newConfig = {
        ...currentConfig,
        scenario: updatedScenario,
        warningBufferBeds: updatedBuffer,
        simulatedSurgeDemand: updatedDemand,
      };

      await query(
        `INSERT INTO system_settings (key, value, updated_by, updated_at)
         VALUES ('readiness_config', $1, $2, NOW())
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [JSON.stringify(newConfig), req.user!.email]
      );

      await recordAudit(pool, req.user!, "UPDATE_READINESS_SETTINGS", "SYSTEM", null, {
        previous: currentConfig,
        updated: newConfig,
      });

      res.status(200).json({
        success: true,
        message: `Simulation scenario updated to '${newConfig.scenario}' (Warning buffer: ${newConfig.warningBufferBeds} beds).`,
        config: newConfig,
      });
    } catch (err) {
      console.error("Update readiness settings error:", err);
      res.status(500).json({ error: "Failed to update readiness configuration" });
    }
  }
);

/**
 * GET /api/icu/readiness
 * Operational Bed Readiness Intelligence & Dynamic Horizons
 * Permissions: ADMIN, DOCTOR, NURSE (HOUSEKEEPING rejected with 403)
 */
router.get(
  "/readiness",
  requireRole("ADMIN", "DOCTOR", "NURSE"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      // 1. Fetch current readiness config & scenario settings
      const settingsRes = await query<{ value: any }>(
        "SELECT value FROM system_settings WHERE key = 'readiness_config'"
      );
      const config = settingsRes.rows[0]?.value || {
        scenario: "Normal",
        warningBufferBeds: 2,
        turnoverTargetMinutesStandard: 45,
        turnoverTargetMinutesDeep: 75,
        simulatedSurgeDemand: 0,
      };

      const scenarioName: "Normal" | "Busy" | "Surge" = config.scenario || "Normal";
      const warningBuffer = Number(config.warningBufferBeds) || 2;
      const simulatedDemand = scenarioName === "Surge" ? 5 : scenarioName === "Busy" ? 2 : 0;

      // 2. Query all beds with unit info, active admissions, active cleaning tasks
      const bedsResult = await query<{
        id: number;
        bed_number: string;
        unit_id: number;
        unit_name: string;
        status: string;
        is_isolation: boolean;
        current_patient_ref: string | null;
        admission_id: number | null;
        admission_time: string | null;
        expected_discharge_time: string | null;
        admission_notes: string | null;
        cleaning_id: number | null;
        cleaning_task_type: "STANDARD" | "DEEP" | null;
        cleaning_status: "PENDING" | "IN_PROGRESS" | null;
        cleaning_start_time: string | null;
        cleaning_created_at: string | null;
        cleaning_assigned_email: string | null;
      }>(`
        SELECT
          b.id,
          b.bed_number,
          b.unit_id,
          u.name AS unit_name,
          b.status,
          b.is_isolation,
          b.current_patient_ref,
          adm.id AS admission_id,
          adm.admission_time,
          adm.expected_discharge_time,
          adm.notes AS admission_notes,
          cln.id AS cleaning_id,
          cln.task_type AS cleaning_task_type,
          cln.status AS cleaning_status,
          cln.start_time AS cleaning_start_time,
          cln.created_at AS cleaning_created_at,
          usr.email AS cleaning_assigned_email
        FROM beds b
        JOIN icu_units u ON u.id = b.unit_id
        LEFT JOIN admissions adm ON adm.bed_id = b.id AND adm.status = 'ADMITTED'
        LEFT JOIN cleaning_tasks cln ON cln.bed_id = b.id AND cln.status != 'COMPLETED'
        LEFT JOIN users usr ON usr.id = cln.assigned_user_id
        ORDER BY b.bed_number ASC
      `);

      const now = Date.now();
      const standardCleanTarget = Number(config.turnoverTargetMinutesStandard) || 45;
      const deepCleanTarget = Number(config.turnoverTargetMinutesDeep) || 75;

      const processedBeds: any[] = [];

      for (const row of bedsResult.rows) {
        if (row.status === "AVAILABLE") {
          processedBeds.push({
            id: row.id,
            bed_number: row.bed_number,
            unit_id: row.unit_id,
            unit_name: row.unit_name,
            status: "AVAILABLE",
            is_isolation: row.is_isolation,
            current_patient_ref: null,
            readyNow: true,
            estimatedReadyTime: null,
            estimatedReadyHours: 0,
            reason: "Bed is vacant, sanitized, and ready for immediate patient intake.",
            confidence: "HIGH",
            confidenceExplanation: "Confirmed sanitized and unassigned in database records.",
            category: "AVAILABLE",
          });
        } else if (row.status === "CLEANING") {
          const isDeep = row.cleaning_task_type === "DEEP" || row.is_isolation;
          const targetDuration = isDeep ? deepCleanTarget : standardCleanTarget;
          const taskType = isDeep ? "DEEP" : "STANDARD";

          if (row.cleaning_status === "IN_PROGRESS" && row.cleaning_start_time) {
            const startTime = new Date(row.cleaning_start_time).getTime();
            const elapsedMins = Math.max(1, Math.round((now - startTime) / 60000));
            const remainingMins = Math.max(5, targetDuration - elapsedMins);
            const readyDate = new Date(now + remainingMins * 60000);
            const readyHours = Math.round((remainingMins / 60) * 10) / 10;

            processedBeds.push({
              id: row.id,
              bed_number: row.bed_number,
              unit_id: row.unit_id,
              unit_name: row.unit_name,
              status: "CLEANING",
              is_isolation: row.is_isolation,
              current_patient_ref: null,
              readyNow: false,
              estimatedReadyTime: readyDate.toISOString(),
              estimatedReadyHours: readyHours,
              reason: `${taskType} decontamination actively in progress (${elapsedMins}m elapsed; assigned to housekeeper).`,
              confidence: "HIGH",
              confidenceExplanation: "Housekeeper actively assigned and physical turnover underway.",
              category: "CLEANING_IN_PROGRESS",
              elapsedMinutes: elapsedMins,
              taskType,
              assignedUserEmail: row.cleaning_assigned_email,
              isOverdue: elapsedMins > targetDuration,
            });
          } else {
            // PENDING cleaning
            const queueTime = row.cleaning_created_at
              ? Math.max(1, Math.round((now - new Date(row.cleaning_created_at).getTime()) / 60000))
              : 10;
            const remainingMins = targetDuration + 15;
            const readyDate = new Date(now + remainingMins * 60000);
            const readyHours = Math.round((remainingMins / 60) * 10) / 10;

            processedBeds.push({
              id: row.id,
              bed_number: row.bed_number,
              unit_id: row.unit_id,
              unit_name: row.unit_name,
              status: "CLEANING",
              is_isolation: row.is_isolation,
              current_patient_ref: null,
              readyNow: false,
              estimatedReadyTime: readyDate.toISOString(),
              estimatedReadyHours: readyHours,
              reason: `Queued for ${taskType} sanitization (${queueTime}m awaiting housekeeping pickup).`,
              confidence: "MEDIUM",
              confidenceExplanation: "Pending turnover queue; ready time depends on housekeeper dispatch time.",
              category: "CLEANING_PENDING",
              elapsedMinutes: queueTime,
              taskType,
              isOverdue: queueTime > 45,
            });
          }
        } else if (row.status === "OCCUPIED") {
          const turnoverBufferMins = row.is_isolation ? 90 : 60;
          if (row.expected_discharge_time) {
            const expDischargeDate = new Date(row.expected_discharge_time);
            const expDischargeMs = expDischargeDate.getTime();
            const projectedReadyMs = expDischargeMs + turnoverBufferMins * 60000;
            const hoursFromNow = (projectedReadyMs - now) / 3600000;

            if (hoursFromNow <= 0) {
              const overdueReadyDate = new Date(now + 90 * 60000);
              processedBeds.push({
                id: row.id,
                bed_number: row.bed_number,
                unit_id: row.unit_id,
                unit_name: row.unit_name,
                status: "OCCUPIED",
                is_isolation: row.is_isolation,
                current_patient_ref: row.current_patient_ref,
                readyNow: false,
                estimatedReadyTime: overdueReadyDate.toISOString(),
                estimatedReadyHours: 1.5,
                reason: `Expected discharge passed; awaiting final clinical discharge order + turnover buffer.`,
                confidence: "LOW",
                confidenceExplanation: "Past scheduled discharge; patient still in bed pending physician clearance.",
                category: "DISCHARGE_PLANNED",
              });
            } else {
              processedBeds.push({
                id: row.id,
                bed_number: row.bed_number,
                unit_id: row.unit_id,
                unit_name: row.unit_name,
                status: "OCCUPIED",
                is_isolation: row.is_isolation,
                current_patient_ref: row.current_patient_ref,
                readyNow: false,
                estimatedReadyTime: new Date(projectedReadyMs).toISOString(),
                estimatedReadyHours: Math.round(hoursFromNow * 10) / 10,
                reason: `Expected discharge at ${expDischargeDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} + ${turnoverBufferMins}m ${row.is_isolation ? "deep" : "standard"} turnover.`,
                confidence: hoursFromNow <= 2 ? "MEDIUM" : "LOW",
                confidenceExplanation:
                  hoursFromNow <= 2
                    ? "Discharge scheduled within 2h window."
                    : "Longer clinical horizon (>2h); actual discharge subject to clinical stabilization.",
                category: hoursFromNow <= 4 ? "DISCHARGE_PLANNED" : "OCCUPIED_LONG_STAY",
              });
            }
          } else {
            // No expected discharge time recorded
            processedBeds.push({
              id: row.id,
              bed_number: row.bed_number,
              unit_id: row.unit_id,
              unit_name: row.unit_name,
              status: "OCCUPIED",
              is_isolation: row.is_isolation,
              current_patient_ref: row.current_patient_ref,
              readyNow: false,
              estimatedReadyTime: new Date(now + 24 * 3600000).toISOString(),
              estimatedReadyHours: 24,
              reason: "Active inpatient stay without recorded expected discharge time.",
              confidence: "LOW",
              confidenceExplanation: "No discharge order or target set; requires clinical review.",
              category: "OCCUPIED_LONG_STAY",
            });
          }
        } else if (row.status === "RESERVED") {
          processedBeds.push({
            id: row.id,
            bed_number: row.bed_number,
            unit_id: row.unit_id,
            unit_name: row.unit_name,
            status: "RESERVED",
            is_isolation: row.is_isolation,
            current_patient_ref: null,
            readyNow: false,
            estimatedReadyTime: new Date(now + 8 * 3600000).toISOString(),
            estimatedReadyHours: 8,
            reason: "Bed held under clinical reservation for upcoming transfer.",
            confidence: "LOW",
            confidenceExplanation: "Committed to incoming patient transfer unless released by staff.",
            category: "RESERVED",
          });
        } else if (row.status === "MAINTENANCE") {
          processedBeds.push({
            id: row.id,
            bed_number: row.bed_number,
            unit_id: row.unit_id,
            unit_name: row.unit_name,
            status: "MAINTENANCE",
            is_isolation: row.is_isolation,
            current_patient_ref: null,
            readyNow: false,
            estimatedReadyTime: new Date(now + 6 * 3600000).toISOString(),
            estimatedReadyHours: 6,
            reason: "Biomedical engineering maintenance and sensor calibration underway.",
            confidence: "LOW",
            confidenceExplanation: "Subject to biomedical clearance and subsequent sanitization.",
            category: "MAINTENANCE",
          });
        }
      }

      // 3. Compile Horizons
      const availableNow = processedBeds.filter((b) => b.readyNow);
      const bedsReady2h = processedBeds.filter((b) => b.readyNow || b.estimatedReadyHours <= 2);
      const bedsReady4h = processedBeds.filter((b) => b.readyNow || b.estimatedReadyHours <= 4);
      const bedsReady8h = processedBeds.filter((b) => b.readyNow || b.estimatedReadyHours <= 8);

      const net2h = Math.max(0, bedsReady2h.length - simulatedDemand);
      const net4h = Math.max(0, bedsReady4h.length - simulatedDemand);
      const net8h = Math.max(0, bedsReady8h.length - simulatedDemand);

      // 4. Capacity Warning Check
      const hasWarning = net2h < warningBuffer;
      let warningLevel: "OK" | "WARNING" | "CRITICAL" = "OK";
      let warningTitle = "Adequate Bed Capacity Projected";
      let warningMessage = `Projected bed readiness (${net2h} beds net) meets or exceeds the clinical safety buffer (${warningBuffer} beds).`;

      if (net2h === 0) {
        warningLevel = "CRITICAL";
        warningTitle = "CRITICAL: Zero Projected Bed Availability (2-Hour Window)";
        warningMessage = `Projected available capacity over the next 2 hours is 0 beds after ${simulatedDemand} simulated demand. Below safety threshold (${warningBuffer} beds).`;
      } else if (hasWarning) {
        warningLevel = "WARNING";
        warningTitle = `Low Bed Capacity Warning (${net2h} Beds Projected)`;
        warningMessage = `Projected available capacity in the next 2 hours (${net2h} beds) is below the configured safety reserve threshold (${warningBuffer} beds).`;
      }

      // 5. Query Historical Completed Cleaning Tasks for Forecast vs Actual Benchmark
      const completedTasksRes = await query<{
        id: number;
        bed_number: string;
        task_type: "STANDARD" | "DEEP";
        duration_minutes: string;
        completion_time: string;
      }>(`
        SELECT
          ct.id,
          b.bed_number,
          ct.task_type,
          ROUND(EXTRACT(EPOCH FROM (ct.completion_time - ct.start_time)) / 60) AS duration_minutes,
          ct.completion_time
        FROM cleaning_tasks ct
        JOIN beds b ON b.id = ct.bed_id
        WHERE ct.status = 'COMPLETED'
          AND ct.start_time IS NOT NULL
          AND ct.completion_time IS NOT NULL
        ORDER BY ct.completion_time DESC
        LIMIT 10
      `);

      const standardTasks = completedTasksRes.rows.filter((t) => t.task_type === "STANDARD");
      const deepTasks = completedTasksRes.rows.filter((t) => t.task_type === "DEEP");

      const avgStandard =
        standardTasks.length > 0
          ? Math.round(
              standardTasks.reduce((acc, t) => acc + Number(t.duration_minutes), 0) /
                standardTasks.length
            )
          : standardCleanTarget;

      const avgDeep =
        deepTasks.length > 0
          ? Math.round(
              deepTasks.reduce((acc, t) => acc + Number(t.duration_minutes), 0) / deepTasks.length
            )
          : deepCleanTarget;

      const benchmarks = [
        {
          taskType: "STANDARD" as const,
          baselineTargetMinutes: standardCleanTarget,
          sampleCount: standardTasks.length,
          averageActualMinutes: avgStandard,
          varianceMinutes: avgStandard - standardCleanTarget,
        },
        {
          taskType: "DEEP" as const,
          baselineTargetMinutes: deepCleanTarget,
          sampleCount: deepTasks.length,
          averageActualMinutes: avgDeep,
          varianceMinutes: avgDeep - deepCleanTarget,
        },
      ];

      const recentCompleted = completedTasksRes.rows.map((row) => {
        const actual = Number(row.duration_minutes);
        const baseline = row.task_type === "DEEP" ? deepCleanTarget : standardCleanTarget;
        return {
          id: row.id,
          bed_number: row.bed_number,
          task_type: row.task_type,
          duration_minutes: actual,
          baseline_minutes: baseline,
          variance_minutes: actual - baseline,
          completion_time: row.completion_time,
        };
      });

      res.status(200).json({
        summary: {
          totalBeds: processedBeds.length,
          availableNowCount: availableNow.length,
          cleaningCount: processedBeds.filter((b) => b.status === "CLEANING").length,
          occupiedCount: processedBeds.filter((b) => b.status === "OCCUPIED").length,
          reservedCount: processedBeds.filter((b) => b.status === "RESERVED").length,
          maintenanceCount: processedBeds.filter((b) => b.status === "MAINTENANCE").length,
        },
        horizons: {
          window2h: {
            horizonHours: 2,
            label: "Next 2 Hours",
            count: bedsReady2h.length,
            netCountAfterSimulatedDemand: net2h,
            isDeficit: net2h < warningBuffer,
            beds: bedsReady2h,
          },
          window4h: {
            horizonHours: 4,
            label: "Next 4 Hours",
            count: bedsReady4h.length,
            netCountAfterSimulatedDemand: net4h,
            isDeficit: net4h < warningBuffer,
            beds: bedsReady4h,
          },
          window8h: {
            horizonHours: 8,
            label: "Next 8 Hours",
            count: bedsReady8h.length,
            netCountAfterSimulatedDemand: net8h,
            isDeficit: net8h < warningBuffer,
            beds: bedsReady8h,
          },
        },
        capacityWarning: {
          hasWarning,
          level: warningLevel,
          title: warningTitle,
          message: warningMessage,
          recommendedAction:
            "Expedite housekeeping turnover on in-progress cleaning beds and review discharge readiness of stable inpatients.",
          thresholdBufferBeds: warningBuffer,
          projectedNet2h: net2h,
        },
        scenario: {
          current: scenarioName,
          simulatedDemand,
          description:
            scenarioName === "Surge"
              ? "Mass casualty / emergency surge protocol (+5 simulated intake requests)."
              : scenarioName === "Busy"
              ? "Elevated operational occupancy demand (+2 simulated intake requests)."
              : "Standard baseline operational turnover flow (0 simulated surge demand).",
          isSimulated: scenarioName !== "Normal",
        },
        benchmarks,
        recentCompletedTurnovers: recentCompleted,
        allBeds: processedBeds,
        meta: {
          generatedAt: new Date().toISOString(),
          disclaimer:
            "DEMO DATA — NOT FOR CLINICAL USE. Estimates are transparent heuristic projections based on recorded discharge times and housekeeping duration baselines, not certified clinical diagnostics.",
          modelType: "Transparent Operational Heuristic Baseline",
        },
      });
    } catch (err) {
      console.error("Readiness error:", err);
      res.status(500).json({ error: "Failed to compute bed readiness intelligence" });
    }
  }
);

// ==============================================================================
// 8b. EXPERIMENTAL MACHINE LEARNING MODEL INFO
// ==============================================================================

/**
 * GET /api/icu/ml/model-info
 * Machine Learning experimental model metadata, evaluation metrics, and held-out test performance
 * Permissions: ADMIN, DOCTOR, NURSE (HOUSEKEEPING blocked with 403)
 */
router.get(
  "/ml/model-info",
  requireRole("ADMIN", "DOCTOR", "NURSE"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const metadataPath = path.resolve(__dirname, "../../models/model_metadata.json");
      if (fs.existsSync(metadataPath)) {
        const data = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
        res.status(200).json(data);
      } else {
        res.status(200).json({
          status: "NOT_TRAINED",
          message: "ML model metadata has not yet been generated. Run train_los_model.py.",
        });
      }
    } catch (err) {
      console.error("ML model-info error:", err);
      res.status(500).json({ error: "Failed to read ML model metadata" });
    }
  }
);

// ==============================================================================
// 9. ADMINISTRATOR STAFF MANAGEMENT (ADMIN ONLY)
// ==============================================================================

/**
 * GET /api/icu/admin/staff
 * Full staff directory with filters and account status
 */
router.get("/admin/staff", requireRole("ADMIN"), async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, search } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    if (role && typeof role === "string" && role !== "ALL") {
      conditions.push(`u.role = $${pIdx++}`);
      params.push(role.toUpperCase());
    }

    if (search && typeof search === "string" && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(`(LOWER(u.email) LIKE $${pIdx} OR LOWER(COALESCE(u.username, '')) LIKE $${pIdx} OR LOWER(COALESCE(u.department, '')) LIKE $${pIdx} OR LOWER(COALESCE(unit.name, '')) LIKE $${pIdx})`);
      params.push(q);
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT u.id, u.email, u.username, u.role, u.active, u.phone, u.department, u.assigned_unit_id,
              unit.name AS assigned_unit_name, u.created_at, u.updated_at
       FROM users u
       LEFT JOIN icu_units unit ON unit.id = u.assigned_unit_id
       ${whereClause}
       ORDER BY u.id ASC`,
      params
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Admin list staff error:", err);
    res.status(500).json({ error: "Failed to load staff directory" });
  }
});

/**
 * POST /api/icu/admin/staff
 * Create individual staff account with bcrypt password
 */
router.post("/admin/staff", requireRole("ADMIN"), async (req: Request, res: Response): Promise<void> => {
  const { email, username, role, password, phone, department, assignedUnitId } = req.body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Validation error", message: "Valid email address is required." });
    return;
  }

  const validRoles = ["ADMIN", "DOCTOR", "NURSE", "HOUSEKEEPING"];
  if (!role || !validRoles.includes(role)) {
    res.status(400).json({ error: "Validation error", message: `Role must be one of: ${validRoles.join(", ")}.` });
    return;
  }

  if (!password || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Validation error", message: "Initial password must be at least 8 characters long." });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = (username && typeof username === "string") ? username.trim() : cleanEmail.split("@")[0];

  try {
    const existing = await query("SELECT id FROM users WHERE LOWER(email) = $1", [cleanEmail]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: "Conflict", message: `Staff account with email '${cleanEmail}' already exists.` });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const unitId = assignedUnitId && !isNaN(Number(assignedUnitId)) ? Number(assignedUnitId) : null;

    const insertResult = await query<{
      id: number;
      email: string;
      username: string;
      role: string;
      active: boolean;
      phone: string | null;
      department: string | null;
      assigned_unit_id: number | null;
      created_at: string;
    }>(
      `INSERT INTO users (email, username, password_hash, role, active, phone, department, assigned_unit_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, $5, $6, $7, NOW(), NOW())
       RETURNING id, email, username, role, active, phone, department, assigned_unit_id, created_at`,
      [cleanEmail, cleanUsername, passwordHash, role, phone?.trim() || null, department?.trim() || null, unitId]
    );

    const newStaff = insertResult.rows[0]!;

    await recordAudit(pool, req.user!, "CREATE_STAFF_ACCOUNT", "USER", newStaff.id, {
      staff_id: newStaff.id,
      email: newStaff.email,
      username: newStaff.username,
      role: newStaff.role,
      department: newStaff.department,
      assigned_unit_id: newStaff.assigned_unit_id,
    });

    res.status(201).json({
      success: true,
      message: `Staff account for '${newStaff.username}' (${newStaff.role}) successfully created.`,
      staff: newStaff,
    });
  } catch (err) {
    console.error("Create staff error:", err);
    res.status(500).json({ error: "Failed to create staff account" });
  }
});

/**
 * PATCH /api/icu/admin/staff/:id
 * Edit permitted staff details
 */
router.patch("/admin/staff/:id", requireRole("ADMIN"), async (req: Request, res: Response): Promise<void> => {
  const staffId = Number(req.params.id);
  const { username, role, phone, department, assignedUnitId } = req.body;

  try {
    const existingRes = await query<{ id: number; role: string; active: boolean }>(
      "SELECT id, role, active FROM users WHERE id = $1",
      [staffId]
    );
    const targetUser = existingRes.rows[0];
    if (!targetUser) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }

    // Role check: prevent demoting the last active administrator
    if (role && role !== targetUser.role && targetUser.role === "ADMIN") {
      const adminCountRes = await query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND active = TRUE AND id != $1",
        [staffId]
      );
      const remainingAdmins = parseInt(adminCountRes.rows[0]?.count || "0", 10);
      if (remainingAdmins === 0) {
        res.status(400).json({
          error: "Permission safety violation",
          message: "Cannot change the role of the last active administrator.",
        });
        return;
      }
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    if (username !== undefined) {
      updates.push(`username = $${pIdx++}`);
      params.push(String(username).trim());
    }

    if (role !== undefined) {
      const validRoles = ["ADMIN", "DOCTOR", "NURSE", "HOUSEKEEPING"];
      if (!validRoles.includes(role)) {
        res.status(400).json({ error: "Validation error", message: `Invalid role: ${role}` });
        return;
      }
      updates.push(`role = $${pIdx++}`);
      params.push(role);
    }

    if (phone !== undefined) {
      updates.push(`phone = $${pIdx++}`);
      params.push(phone ? String(phone).trim() : null);
    }

    if (department !== undefined) {
      updates.push(`department = $${pIdx++}`);
      params.push(department ? String(department).trim() : null);
    }

    if (assignedUnitId !== undefined) {
      updates.push(`assigned_unit_id = $${pIdx++}`);
      params.push(assignedUnitId && !isNaN(Number(assignedUnitId)) ? Number(assignedUnitId) : null);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: "No fields to update provided." });
      return;
    }

    updates.push(`updated_at = NOW()`);
    params.push(staffId);

    const updateRes = await query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${pIdx} RETURNING id, email, username, role, active, phone, department, assigned_unit_id, updated_at`,
      params
    );

    await recordAudit(pool, req.user!, "UPDATE_STAFF_DETAILS", "USER", staffId, req.body);

    res.status(200).json({
      success: true,
      message: "Staff details successfully updated.",
      staff: updateRes.rows[0],
    });
  } catch (err) {
    console.error("Update staff error:", err);
    res.status(500).json({ error: "Failed to update staff details" });
  }
});

/**
 * PATCH /api/icu/admin/staff/:id/status
 * Activate or deactivate staff account
 * Rule: Prevent deactivation of the last active administrator.
 */
router.patch("/admin/staff/:id/status", requireRole("ADMIN"), async (req: Request, res: Response): Promise<void> => {
  const staffId = Number(req.params.id);
  const { active } = req.body;

  if (typeof active !== "boolean") {
    res.status(400).json({ error: "Validation error", message: "Field 'active' must be a boolean." });
    return;
  }

  try {
    const existingRes = await query<{ id: number; role: string; email: string; active: boolean }>(
      "SELECT id, role, email, active FROM users WHERE id = $1",
      [staffId]
    );
    const targetUser = existingRes.rows[0];
    if (!targetUser) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }

    // Critical security constraint: Prevent deactivating the last active administrator
    if (active === false && targetUser.role === "ADMIN") {
      const adminCountRes = await query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND active = TRUE AND id != $1",
        [staffId]
      );
      const remainingAdmins = parseInt(adminCountRes.rows[0]?.count || "0", 10);
      if (remainingAdmins === 0) {
        res.status(400).json({
          error: "Security violation",
          message: "Cannot deactivate the last active administrator account.",
        });
        return;
      }
    }

    await query("UPDATE users SET active = $1, updated_at = NOW() WHERE id = $2", [active, staffId]);

    await recordAudit(pool, req.user!, "STAFF_STATUS_CHANGE", "USER", staffId, {
      staff_email: targetUser.email,
      role: targetUser.role,
      new_status: active ? "ACTIVE" : "INACTIVE",
    });

    res.status(200).json({
      success: true,
      message: `Account '${targetUser.email}' is now ${active ? "ACTIVE" : "INACTIVE"}.`,
      staffId,
      active,
    });
  } catch (err) {
    console.error("Change staff status error:", err);
    res.status(500).json({ error: "Failed to update staff account status" });
  }
});

/**
 * POST /api/icu/admin/staff/:id/reset-password
 * Secure password reset without showing existing password
 */
router.post("/admin/staff/:id/reset-password", requireRole("ADMIN"), async (req: Request, res: Response): Promise<void> => {
  const staffId = Number(req.params.id);
  const { newPassword } = req.body;

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "Validation error", message: "New password must be at least 8 characters long." });
    return;
  }

  try {
    const userRes = await query<{ id: number; email: string; username: string }>(
      "SELECT id, email, username FROM users WHERE id = $1",
      [staffId]
    );
    const staff = userRes.rows[0];
    if (!staff) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [passwordHash, staffId]);

    await recordAudit(pool, req.user!, "STAFF_PASSWORD_RESET", "USER", staffId, {
      staff_email: staff.email,
    });

    res.status(200).json({
      success: true,
      message: `Password successfully reset for '${staff.username || staff.email}'.`,
    });
  } catch (err) {
    console.error("Reset staff password error:", err);
    res.status(500).json({ error: "Failed to reset staff password" });
  }
});

export default router;
