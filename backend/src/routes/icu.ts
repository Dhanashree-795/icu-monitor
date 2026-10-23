import { Router, Request, Response } from "express";
import { PoolClient } from "pg";
import { pool, query } from "../db/index";
import { authenticateToken, requireRole, AuthUser } from "../middleware/auth";

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
    }>(`
      SELECT
        u.id,
        u.name,
        u.capacity,
        COUNT(b.id) AS total_beds,
        COUNT(b.id) FILTER (WHERE b.status = 'OCCUPIED') AS occupied_beds,
        COUNT(b.id) FILTER (WHERE b.status = 'AVAILABLE') AS available_beds
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
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: "Failed to retrieve dashboard metrics" });
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
        adm.admission_time,
        adm.expected_discharge_time,
        adm.notes AS admission_notes,
        cln.id AS active_cleaning_task_id,
        cln.task_type AS cleaning_task_type,
        cln.status AS cleaning_task_status,
        cln.start_time AS cleaning_start_time
      FROM beds b
      JOIN icu_units u ON u.id = b.unit_id
      LEFT JOIN admissions adm ON adm.bed_id = b.id AND adm.status = 'ADMITTED'
      LEFT JOIN cleaning_tasks cln ON cln.bed_id = b.id AND cln.status != 'COMPLETED'
      ${whereClause}
      ORDER BY b.bed_number ASC
    `;

    const result = await query(queryStr, params);

    // Enforce role isolation: Housekeeping staff have no clinical access to patient IDs or notes
    let rows = result.rows;
    if (req.user?.role === "HOUSEKEEPING") {
      rows = rows.map((r: any) => ({
        ...r,
        current_patient_ref: null,
        active_admission_id: null,
        admission_time: null,
        expected_discharge_time: null,
        admission_notes: null,
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
        adm.admission_time,
        adm.expected_discharge_time,
        adm.notes AS admission_notes,
        cln.id AS active_cleaning_task_id,
        cln.task_type AS cleaning_task_type,
        cln.status AS cleaning_task_status,
        cln.start_time AS cleaning_start_time
       FROM beds b
       JOIN icu_units u ON u.id = b.unit_id
       LEFT JOIN admissions adm ON adm.bed_id = b.id AND adm.status = 'ADMITTED'
       LEFT JOIN cleaning_tasks cln ON cln.bed_id = b.id AND cln.status != 'COMPLETED'
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

    let sanitizedBed = bed;
    let sanitizedHistory = historyResult.rows;

    if (req.user?.role === "HOUSEKEEPING") {
      sanitizedBed = {
        ...bed,
        current_patient_ref: null,
        active_admission_id: null,
        admission_time: null,
        expected_discharge_time: null,
        admission_notes: null,
      };
      sanitizedHistory = historyResult.rows.map((h: any) => {
        const copyDetails = { ...(h.details || {}) };
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
    const { patientRef, expectedDischargeTime, notes } = req.body;

    // Generate synthetic patient reference if not provided (e.g., PT-8472)
    const syntheticRef = (
      patientRef && typeof patientRef === "string" && patientRef.trim()
        ? patientRef.trim().toUpperCase()
        : `PT-${Math.floor(1000 + Math.random() * 9000)}`
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Lock bed row to prevent race conditions
      const bedResult = await client.query<{
        id: number;
        bed_number: string;
        status: string;
        is_isolation: boolean;
      }>("SELECT id, bed_number, status, is_isolation FROM beds WHERE id = $1 FOR UPDATE", [bedId]);

      const bed = bedResult.rows[0];
      if (!bed) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Bed not found" });
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

      // Update bed to OCCUPIED
      await client.query(
        `UPDATE beds
         SET status = 'OCCUPIED', current_patient_ref = $1, updated_at = NOW()
         WHERE id = $2`,
        [syntheticRef, bedId]
      );

      // Parse expected discharge time or default to +2 days
      const expDischarge = expectedDischargeTime ? new Date(expectedDischargeTime) : new Date(Date.now() + 48 * 3600 * 1000);

      // Create admission record
      const admissionResult = await client.query<{ id: number }>(
        `INSERT INTO admissions (patient_ref, bed_id, admission_time, expected_discharge_time, status, admitting_doctor_id, notes, created_at, updated_at)
         VALUES ($1, $2, NOW(), $3, 'ADMITTED', $4, $5, NOW(), NOW())
         RETURNING id`,
        [syntheticRef, bedId, expDischarge, req.user!.id, notes || "ICU synthetic observation"]
      );

      const admissionId = admissionResult.rows[0]!.id;

      // Write audit log
      await recordAudit(client, req.user!, "ADMIT_PATIENT", "BED", bedId, {
        bed_number: bed.bed_number,
        patient_ref: syntheticRef,
        admission_id: admissionId,
        is_isolation: bed.is_isolation,
      });

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        message: `Synthetic patient '${syntheticRef}' successfully admitted to Bed '${bed.bed_number}'.`,
        admissionId,
        patientRef: syntheticRef,
        bedNumber: bed.bed_number,
        status: "OCCUPIED",
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
 * POST /api/icu/beds/:id/reserve
 * Reserve an available bed
 * Permissions: ADMIN, DOCTOR, NURSE
 */
router.post(
  "/beds/:id/reserve",
  requireRole("ADMIN", "DOCTOR", "NURSE"),
  async (req: Request, res: Response): Promise<void> => {
    const bedId = Number(req.params.id);
    const { patientRef, notes } = req.body;

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

      const assignedRef = (patientRef || "PT-RESERVED").trim().toUpperCase();

      await client.query(
        `UPDATE beds
         SET status = 'RESERVED', current_patient_ref = $1, updated_at = NOW()
         WHERE id = $2`,
        [assignedRef, bedId]
      );

      await recordAudit(client, req.user!, "RESERVE_BED", "BED", bedId, {
        bed_number: bed.bed_number,
        reserved_for: assignedRef,
        notes,
      });

      await client.query("COMMIT");
      res.status(200).json({
        success: true,
        message: `Bed '${bed.bed_number}' reserved successfully.`,
        status: "RESERVED",
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
 * Permissions: ADMIN, DOCTOR, NURSE
 */
router.post(
  "/beds/:id/release-reservation",
  requireRole("ADMIN", "DOCTOR", "NURSE"),
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
    const { reason } = req.body;

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
 * POST /api/icu/cleaning-tasks/:id/start
 * Start a cleaning task
 * Permissions: HOUSEKEEPING, ADMIN, NURSE
 */
router.post(
  "/cleaning-tasks/:id/start",
  requireRole("HOUSEKEEPING", "ADMIN", "NURSE"),
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
      }>("SELECT id, bed_id, status, task_type FROM cleaning_tasks WHERE id = $1 FOR UPDATE", [taskId]);

      const task = taskResult.rows[0];
      if (!task) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Cleaning task not found" });
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
 * Permissions: HOUSEKEEPING, ADMIN, NURSE
 */
router.post(
  "/cleaning-tasks/:id/complete",
  requireRole("HOUSEKEEPING", "ADMIN", "NURSE"),
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
      }>("SELECT id, bed_id, status, task_type FROM cleaning_tasks WHERE id = $1 FOR UPDATE", [taskId]);

      const task = taskResult.rows[0];
      if (!task) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Cleaning task not found" });
        return;
      }

      if (task.status === "COMPLETED") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Task is already COMPLETED." });
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
// 6. ADMISSIONS LISTING
// ==============================================================================

/**
 * GET /api/icu/admissions
 * List synthetic patient admissions
 * Permissions: ADMIN, DOCTOR, NURSE (HOUSEKEEPING excluded)
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
          adm.bed_id,
          b.bed_number,
          b.is_isolation,
          u.name AS unit_name,
          adm.admission_time,
          adm.expected_discharge_time,
          adm.actual_discharge_time,
          adm.status,
          adm.notes,
          doc.email AS admitting_doctor_email
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

export default router;
