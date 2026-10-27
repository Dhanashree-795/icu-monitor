import { Router, Request, Response } from "express";
import { authenticateToken, requireRole } from "../middleware/auth";
import { query } from "../db/index";
import { config } from "../config/env";

const router = Router();

// Constant clinical warning & experimental disclaimer
export const EXPERIMENTAL_DISCLAIMER =
  "Experimental — trained on synthetic data; not for clinical decisions";

export const REQUIRED_PREDICTION_FIELDS = [
  "procedure_type",
  "condition",
  "admission_type",
  "complications",
  "icu_unit",
  "age_group",
] as const;

export type RequiredPredictionField = (typeof REQUIRED_PREDICTION_FIELDS)[number];

export interface PredictionPayload {
  procedure_type: string;
  condition: string;
  admission_type: string;
  complications: string;
  icu_unit: string;
  age_group: string;
}

export interface PythonPredictionResponse {
  predicted_los_days: number;
  model_status?: string;
  clinical_use?: boolean;
}

/**
 * GET /api/ml/health
 * Checks connectivity and model loading status of the upstream Python ML service.
 * Permissions: ADMIN, DOCTOR
 */
router.get(
  "/health",
  authenticateToken,
  requireRole("ADMIN", "DOCTOR"),
  async (_req: Request, res: Response): Promise<void> => {
    const baseUrl = config.losMlApiUrl.replace(/\/+$/, "");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const mlRes = await fetch(`${baseUrl}/health`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (mlRes.ok) {
        const data = (await mlRes.json()) as {
          status?: string;
          model_loaded?: boolean;
          data_type?: string;
        };
        res.status(200).json({
          status: "ok",
          service: "los-prediction-ml",
          model_status: data.status || "healthy",
          model_loaded: data.model_loaded ?? true,
          data_type: data.data_type || "synthetic",
          disclaimer: EXPERIMENTAL_DISCLAIMER,
          is_experimental: true,
        });
      } else {
        res.status(502).json({
          error: "Bad Gateway",
          message: "ML service health check returned an unexpected status code.",
        });
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        res.status(504).json({
          error: "Gateway Timeout",
          message: "ML prediction service health check timed out.",
        });
        return;
      }
      res.status(503).json({
        error: "Service Unavailable",
        message: "Length of stay prediction service is currently unreachable.",
      });
    }
  }
);

/**
 * POST /api/ml/los-prediction
 * Forward validated prediction request to the experimental Python ML service.
 * Permissions: ADMIN, DOCTOR
 *
 * Patient Access Enforcement:
 * - DOCTOR role: Patient ID/Ref is required and must exist in admissions table with admitting_doctor_id = req.user.id.
 * - ADMIN role: If Patient ID/Ref is provided, it must exist in the admissions table; otherwise general scenario prediction is allowed.
 * - Client-supplied doctor ownership in the body is never trusted; only verified session req.user.id is used.
 */
router.post(
  "/los-prediction",
  authenticateToken,
  requireRole("ADMIN", "DOCTOR"),
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required.",
      });
      return;
    }

    // 1. Validate the six required prediction input fields
    const body = req.body || {};
    const missingOrInvalidFields: string[] = [];

    for (const field of REQUIRED_PREDICTION_FIELDS) {
      const val = body[field];
      if (typeof val !== "string" || val.trim().length === 0) {
        missingOrInvalidFields.push(field);
      }
    }

    if (missingOrInvalidFields.length > 0) {
      res.status(400).json({
        error: "Bad Request",
        message: `Validation failed: missing or empty required field(s): ${missingOrInvalidFields.join(
          ", "
        )}. All six fields are required strings.`,
        missingFields: missingOrInvalidFields,
      });
      return;
    }

    // 2. Validate patient identifier & access rules (Task 4)
    // Patient can be identified via patient_id, patientId, or patient_ref
    const patientIdentifier =
      body.patient_id !== undefined && body.patient_id !== null && String(body.patient_id).trim() !== ""
        ? body.patient_id
        : body.patientId !== undefined && body.patientId !== null && String(body.patientId).trim() !== ""
        ? body.patientId
        : body.patient_ref !== undefined && body.patient_ref !== null && String(body.patient_ref).trim() !== ""
        ? body.patient_ref
        : undefined;

    let admissionRecord: {
      id: number;
      patient_ref: string;
      admitting_doctor_id: number | null;
      admission_time?: string | null;
    } | undefined = undefined;

    if (user.role === "DOCTOR") {
      // Doctor must specify patient to verify clinical assignment
      if (!patientIdentifier) {
        res.status(400).json({
          error: "Bad Request",
          message:
            "Patient ID is required for doctor role to verify patient clinical assignment.",
        });
        return;
      }

      // Query admissions database
      const isNumeric =
        typeof patientIdentifier === "number" ||
        (/^\d+$/.test(String(patientIdentifier).trim()) && !isNaN(Number(patientIdentifier)));

      const admRes = isNumeric
        ? await query<{ id: number; patient_ref: string; admitting_doctor_id: number | null; admission_time: string | null }>(
            "SELECT id, patient_ref, admitting_doctor_id, admission_time FROM admissions WHERE id = $1 OR patient_ref = $2",
            [Number(patientIdentifier), String(patientIdentifier).trim()]
          )
        : await query<{ id: number; patient_ref: string; admitting_doctor_id: number | null; admission_time: string | null }>(
            "SELECT id, patient_ref, admitting_doctor_id, admission_time FROM admissions WHERE patient_ref = $1",
            [String(patientIdentifier).trim()]
          );

      if (admRes.rows.length === 0 || !admRes.rows[0]) {
        res.status(404).json({
          error: "Not Found",
          message: "Patient admission record not found.",
        });
        return;
      }

      admissionRecord = admRes.rows[0];

      // Enforce doctor ownership strictly against verified session user ID, never trusting client body
      if (admissionRecord.admitting_doctor_id !== user.id) {
        res.status(403).json({
          error: "Forbidden",
          message:
            "You are not authorized to request predictions for patients assigned to another doctor.",
        });
        return;
      }
    } else if (user.role === "ADMIN") {
      // Admin may optionally provide a patient identifier; if provided, verify that the patient exists
      if (patientIdentifier) {
        const isNumeric =
          typeof patientIdentifier === "number" ||
          (/^\d+$/.test(String(patientIdentifier).trim()) && !isNaN(Number(patientIdentifier)));

        const admRes = isNumeric
          ? await query<{ id: number; patient_ref: string; admitting_doctor_id: number | null; admission_time: string | null }>(
              "SELECT id, patient_ref, admitting_doctor_id, admission_time FROM admissions WHERE id = $1 OR patient_ref = $2",
              [Number(patientIdentifier), String(patientIdentifier).trim()]
            )
          : await query<{ id: number; patient_ref: string; admitting_doctor_id: number | null; admission_time: string | null }>(
              "SELECT id, patient_ref, admitting_doctor_id, admission_time FROM admissions WHERE patient_ref = $1",
              [String(patientIdentifier).trim()]
            );

        if (admRes.rows.length === 0 || !admRes.rows[0]) {
          res.status(404).json({
            error: "Not Found",
            message: "Patient admission record not found.",
          });
          return;
        }

        admissionRecord = admRes.rows[0];
      }
    }

    // 3. Prepare payload for upstream Python ML service
    const cleanPayload: PredictionPayload = {
      procedure_type: String(body.procedure_type).trim(),
      condition: String(body.condition).trim(),
      admission_type: String(body.admission_type).trim(),
      complications: String(body.complications).trim(),
      icu_unit: String(body.icu_unit).trim(),
      age_group: String(body.age_group).trim(),
    };

    const baseUrl = config.losMlApiUrl.replace(/\/+$/, "");
    const controller = new AbortController();
    const timeoutMs = 5000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const mlResponse = await fetch(`${baseUrl}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(cleanPayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!mlResponse.ok) {
        let errorDetail = "ML service returned error";
        try {
          const errData = await mlResponse.json();
          errorDetail = errData.detail || errData.message || errorDetail;
        } catch {
          // ignore non-json error responses
        }
        res.status(502).json({
          error: "Bad Gateway",
          message: `ML prediction service returned an unexpected error: ${errorDetail}`,
        });
        return;
      }

      const mlData = (await mlResponse.json()) as PythonPredictionResponse;

      let predictedFreeTimeIso: string | undefined = undefined;
      if (admissionRecord) {
        const admDate = admissionRecord.admission_time ? new Date(admissionRecord.admission_time) : new Date();
        const freeTime = new Date(admDate.getTime() + Number(mlData.predicted_los_days) * 86400000);
        const updateRes = await query<{ predicted_free_time: string }>(
          `UPDATE admissions
           SET predicted_los_days = $1,
               prediction_status = 'PREDICTED',
               prediction_reason = 'Prediction generated by experimental model',
               predicted_free_time = $2,
               prediction_updated_at = NOW(),
               prediction_inputs = $3,
               updated_at = NOW()
           WHERE id = $4
           RETURNING predicted_free_time`,
          [Number(Number(mlData.predicted_los_days).toFixed(2)), freeTime, JSON.stringify(cleanPayload), admissionRecord.id]
        );
        if (updateRes.rows[0]?.predicted_free_time) {
          predictedFreeTimeIso = new Date(updateRes.rows[0].predicted_free_time).toISOString();
        }
      }

      // 4. Return formatted response with prominent experimental disclaimer
      res.status(200).json({
        success: true,
        predicted_los_days: mlData.predicted_los_days,
        prediction_status: "PREDICTED",
        predicted_free_time: predictedFreeTimeIso,
        model_status: mlData.model_status || "experimental_synthetic_data",
        clinical_use: false,
        disclaimer: EXPERIMENTAL_DISCLAIMER,
        is_experimental: true,
        warning:
          "Experimental — trained on synthetic data; not for clinical decisions or automatic discharge orders.",
        patient_id: admissionRecord ? admissionRecord.id : undefined,
        patient_ref: admissionRecord ? admissionRecord.patient_ref : undefined,
        inputs: cleanPayload,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (admissionRecord) {
        try {
          await query(
            `UPDATE admissions
             SET prediction_status = 'CANT_PREDICT',
                 prediction_reason = 'Experimental ML prediction service unavailable or timed out',
                 prediction_updated_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [admissionRecord.id]
          );
        } catch {
          // non-blocking
        }
      }

      if (err instanceof Error && err.name === "AbortError") {
        res.status(504).json({
          error: "Gateway Timeout",
          message: "ML prediction service timed out. Please try again later.",
        });
        return;
      }

      // Handle connection refused, DNS lookup failure, or offline service
      res.status(503).json({
        error: "Service Unavailable",
        message:
          "Length of stay prediction service is currently unavailable. Please try again later.",
      });
    }
  }
);

export default router;
