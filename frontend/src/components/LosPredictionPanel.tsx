import React, { useState, useEffect, useId } from "react";
import {
  Sparkles,
  Activity,
  AlertTriangle,
  Clock,
  RotateCcw,
  ShieldAlert,
  ServerOff,
  UserCheck,
  Stethoscope,
  Info,
} from "lucide-react";
import type {
  Bed,
  Admission,
  UserRole,
  AuthUser,
  LosPredictionResponse,
} from "../types";
import { api } from "../api";

// ==============================================================================
// EXACT CATEGORIES FROM MODEL TRAINING SCRIPT & SYNTHETIC DATASET
// (backend/scripts/train_los_model.py & synthetic_patient_los.csv)
// ==============================================================================

export const PROCEDURE_TYPE_OPTIONS = [
  { value: "angiography", label: "Angiography (Elective diagnostic/interventional)" },
  { value: "angioplasty", label: "Angioplasty (Coronary revascularization)" },
  { value: "arrhythmia", label: "Arrhythmia (Cardiac rhythm disturbance/monitoring)" },
  { value: "cardiac_surgery", label: "Cardiac Surgery (Open heart / bypass / valve)" },
  { value: "general_surgery", label: "General Surgery (Major abdominal/thoracic)" },
  { value: "kidney_injury", label: "Kidney Injury (Acute renal failure/dialysis)" },
  { value: "observation", label: "Observation (Overnight telemetry/hemodynamic monitoring)" },
  { value: "pneumonia", label: "Pneumonia (Severe community/hospital acquired)" },
  { value: "respiratory_distress", label: "Respiratory Distress (Acute failure / ARDS)" },
  { value: "sepsis", label: "Sepsis (Severe systemic infection / septic shock)" },
  { value: "stroke", label: "Stroke (Acute ischemic/hemorrhagic cerebrovascular)" },
  { value: "trauma", label: "Trauma (Polytrauma / blunt chest & abdominal)" },
] as const;

export const CONDITION_OPTIONS = [
  { value: "stable", label: "Stable (Vitals within expected target parameters)" },
  { value: "improving", label: "Improving (Positive trend / stepdown consideration)" },
  { value: "moderate", label: "Moderate (Active monitoring / medication titration)" },
  { value: "critical", label: "Critical (Unstable / mechanical support / high acuity)" },
  { value: "uncertain", label: "Uncertain (Guarded prognosis / evolving clinical picture)" },
] as const;

export const ADMISSION_TYPE_OPTIONS = [
  { value: "planned", label: "Planned (Scheduled elective post-procedure)" },
  { value: "urgent", label: "Urgent (Unscheduled required admission < 24h)" },
  { value: "emergency", label: "Emergency (Immediate acute/trauma resuscitative)" },
] as const;

export const COMPLICATIONS_OPTIONS = [
  { value: "none", label: "None (No significant intra- or post-op complications)" },
  { value: "present", label: "Present (Active secondary infection / organ dysfunction)" },
  { value: "unknown", label: "Unknown (Under evaluation / pending diagnostic results)" },
] as const;

export const ICU_UNIT_OPTIONS = [
  { value: "CVICU", label: "Cardiovascular ICU (CVICU)" },
  { value: "MICU", label: "Medical ICU (MICU)" },
  { value: "SICU", label: "Surgical ICU (SICU)" },
  { value: "Pedia ICU", label: "Pediatric ICU (Pedia ICU)" },
] as const;

export const AGE_GROUP_OPTIONS = [
  { value: "adult", label: "Adult (18 – 64 years)" },
  { value: "child", label: "Child (< 18 years)" },
  { value: "older_adult", label: "Older Adult (65+ years)" },
] as const;

export interface LosPredictionPanelProps {
  userRole: UserRole;
  currentUser?: AuthUser | null;
  admissions?: Admission[];
  beds?: Bed[];
  doctorAssignedBeds?: Bed[];
  selectedBedId?: number | null;
  onPatientSelect?: (bed: Bed) => void;
  onPredictionSuccess?: (res: LosPredictionResponse) => void;
}

export const LosPredictionPanel: React.FC<LosPredictionPanelProps> = ({
  userRole,
  currentUser,
  admissions = [],
  beds = [],
  doctorAssignedBeds = [],
  selectedBedId,
  onPredictionSuccess,
}) => {
  const isDoctor = userRole === "DOCTOR";
  const isAdmin = userRole === "ADMIN";

  // Form State
  const [selectedPatientKey, setSelectedPatientKey] = useState<string>("");
  const [procedureType, setProcedureType] = useState<string>("");
  const [condition, setCondition] = useState<string>("");
  const [admissionType, setAdmissionType] = useState<string>("");
  const [complications, setComplications] = useState<string>("");
  const [icuUnit, setIcuUnit] = useState<string>("");
  const [ageGroup, setAgeGroup] = useState<string>("");

  // Status & Output State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string>("");
  const [apiError, setApiError] = useState<string>("");
  const [isServiceUnavailable, setIsServiceUnavailable] = useState<boolean>(false);
  const [predictionResult, setPredictionResult] = useState<LosPredictionResponse | null>(null);
  const [serviceStatus, setServiceStatus] = useState<"checking" | "online" | "offline">("checking");

  // Form input element IDs
  const patientSelectId = useId();
  const procedureSelectId = useId();
  const conditionSelectId = useId();
  const admissionTypeSelectId = useId();
  const complicationsSelectId = useId();
  const icuUnitSelectId = useId();
  const ageGroupSelectId = useId();

  // Check ML Service Health once on mount
  useEffect(() => {
    let isMounted = true;
    api
      .getMlHealth()
      .then((res) => {
        if (isMounted) {
          if (res && res.status === "ok") {
            setServiceStatus("online");
          } else {
            setServiceStatus("offline");
          }
        }
      })
      .catch(() => {
        if (isMounted) setServiceStatus("offline");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Determine selectable beds based on role isolation
  // DOCTOR: ONLY beds assigned to this doctor (patient isolation)
  // ADMIN: All occupied beds OR general scenario
  const availableBeds: Bed[] = React.useMemo(() => {
    if (isDoctor) {
      if (doctorAssignedBeds.length > 0) return doctorAssignedBeds;
      return beds.filter((b) => {
        if (b.status !== "OCCUPIED") return false;
        if (currentUser?.id && b.assigned_doctor_id === currentUser.id) return true;
        if (currentUser?.email && b.assigned_doctor_email?.toLowerCase() === currentUser.email.toLowerCase()) return true;
        return false;
      });
    }
    if (isAdmin) {
      return beds.filter((b) => b.status === "OCCUPIED");
    }
    return [];
  }, [isDoctor, isAdmin, doctorAssignedBeds, beds, currentUser]);

  // Handle external selectedBedId changes or auto-selection
  useEffect(() => {
    if (selectedBedId && availableBeds.some((b) => b.id === selectedBedId)) {
      handlePatientChange(String(selectedBedId));
    } else if (isDoctor && availableBeds.length === 1 && !selectedPatientKey) {
      handlePatientChange(String(availableBeds[0].id));
    }
  }, [selectedBedId, availableBeds, isDoctor]);

  // Handle patient selection and smart attribute pre-filling
  function handlePatientChange(bedKey: string) {
    setSelectedPatientKey(bedKey);
    setValidationError("");
    setApiError("");

    if (!bedKey || bedKey === "GENERAL") {
      return;
    }

    const bed = availableBeds.find((b) => String(b.id) === bedKey);
    if (!bed) return;

    // 1. Auto-match ICU Unit
    const unitName = (bed.unit_name || "").toLowerCase();
    if (unitName.includes("cardio") || unitName.includes("cvicu")) {
      setIcuUnit("CVICU");
    } else if (unitName.includes("surg") || unitName.includes("sicu")) {
      setIcuUnit("SICU");
    } else if (unitName.includes("pedia")) {
      setIcuUnit("Pedia ICU");
    } else if (unitName.includes("med") || unitName.includes("micu")) {
      setIcuUnit("MICU");
    }

    // 2. Auto-match Procedure Type if available
    const matchedAdm = admissions.find(
      (a) => a.bed_id === bed.id && a.status === "ADMITTED"
    );
    const procRaw = (bed.patient_procedure_type || matchedAdm?.procedure_type || "").toLowerCase();

    if (procRaw.includes("angiography")) setProcedureType("angiography");
    else if (procRaw.includes("angioplasty")) setProcedureType("angioplasty");
    else if (procRaw.includes("cardiac surgery") || procRaw.includes("bypass")) setProcedureType("cardiac_surgery");
    else if (procRaw.includes("general surgery") || procRaw.includes("abdominal")) setProcedureType("general_surgery");
    else if (procRaw.includes("pneumonia") || procRaw.includes("respiratory")) setProcedureType("respiratory_distress");
    else if (procRaw.includes("sepsis") || procRaw.includes("infection")) setProcedureType("sepsis");
    else if (procRaw.includes("stroke") || procRaw.includes("neuro")) setProcedureType("stroke");
    else if (procRaw.includes("trauma")) setProcedureType("trauma");
    else if (procRaw.includes("renal") || procRaw.includes("kidney")) setProcedureType("kidney_injury");
    else if (procRaw.includes("arrhythmia")) setProcedureType("arrhythmia");
    else if (procRaw.includes("observation")) setProcedureType("observation");

    // 3. Auto-match Condition
    const condRaw = (bed.patient_condition || matchedAdm?.condition || "").toLowerCase();
    if (condRaw.includes("critical") || condRaw.includes("ventilated") || condRaw.includes("shock")) {
      setCondition("critical");
    } else if (condRaw.includes("improving") || condRaw.includes("recovering") || condRaw.includes("stepdown")) {
      setCondition("improving");
    } else if (condRaw.includes("moderate") || condRaw.includes("guard")) {
      setCondition("moderate");
    } else if (condRaw.includes("stable")) {
      setCondition("stable");
    } else if (condRaw.includes("uncertain") || condRaw.includes("evaluation")) {
      setCondition("uncertain");
    }

    // 4. If stored prediction exists for this bed/admission, pre-load it to ensure consistent display
    const storedLos = bed.predicted_los_days ?? matchedAdm?.predicted_los_days;
    if (storedLos !== undefined && storedLos !== null) {
      const storedInputs = (bed.prediction_inputs || matchedAdm?.prediction_inputs) as Record<string, string> | undefined;
      setPredictionResult({
        success: true,
        predicted_los_days: Number(storedLos),
        model_status: "stored_admission_prediction",
        clinical_use: false,
        is_experimental: true,
        disclaimer: "Experimental — trained on synthetic data; not for clinical decisions",
        patient_ref: bed.current_patient_ref || matchedAdm?.patient_ref,
        patient_id: bed.active_admission_id || matchedAdm?.id,
        predicted_free_time: bed.predicted_free_time || matchedAdm?.predicted_free_time || undefined,
        inputs: storedInputs,
      });

      if (storedInputs) {
        if (storedInputs.icu_unit) setIcuUnit(storedInputs.icu_unit);
        if (storedInputs.procedure_type) setProcedureType(storedInputs.procedure_type);
        if (storedInputs.condition) setCondition(storedInputs.condition);
        if (storedInputs.admission_type) setAdmissionType(storedInputs.admission_type);
        if (storedInputs.complications) setComplications(storedInputs.complications);
        if (storedInputs.age_group) setAgeGroup(storedInputs.age_group);
      }
    } else {
      setPredictionResult(null);
    }

    // 5. Default sensible options if unset
    if (!admissionType) setAdmissionType("planned");
    if (!complications) setComplications("none");
    if (!ageGroup) setAgeGroup("adult");
  }

  // Submit LOS Prediction Request
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError("");
    setApiError("");
    setIsServiceUnavailable(false);

    // Validation checks
    const missing: string[] = [];
    if (!procedureType) missing.push("Procedure Type");
    if (!condition) missing.push("Condition Category");
    if (!admissionType) missing.push("Admission Type");
    if (!complications) missing.push("Complications");
    if (!icuUnit) missing.push("ICU Unit");
    if (!ageGroup) missing.push("Age Group");

    if (missing.length > 0) {
      setValidationError(`Please complete all required fields: ${missing.join(", ")}.`);
      return;
    }

    // Doctor role must supply a valid patient ID assigned to them
    let targetPatientId: number | undefined = undefined;
    let targetPatientRef: string | undefined = undefined;

    if (isDoctor) {
      if (!selectedPatientKey || selectedPatientKey === "GENERAL") {
        setValidationError("Please select an inpatient assigned to you. Doctors may only run predictions for their assigned patients.");
        return;
      }

      const bed = availableBeds.find((b) => String(b.id) === selectedPatientKey);
      if (!bed) {
        setValidationError("Selected patient bed not found in your assigned roster.");
        return;
      }

      const matchedAdm = admissions.find((a) => a.bed_id === bed.id && a.status === "ADMITTED");
      targetPatientId = bed.active_admission_id || matchedAdm?.id || bed.id;
      targetPatientRef = bed.current_patient_ref || undefined;
    } else if (isAdmin) {
      if (selectedPatientKey && selectedPatientKey !== "GENERAL") {
        const bed = availableBeds.find((b) => String(b.id) === selectedPatientKey);
        if (bed) {
          const matchedAdm = admissions.find((a) => a.bed_id === bed.id && a.status === "ADMITTED");
          targetPatientId = bed.active_admission_id || matchedAdm?.id || bed.id;
          targetPatientRef = bed.current_patient_ref || undefined;
        }
      }
    }

    setIsLoading(true);

    try {
      const response = await api.predictLos({
        patient_id: targetPatientId,
        patient_ref: targetPatientRef,
        procedure_type: procedureType,
        condition: condition,
        admission_type: admissionType,
        complications: complications,
        icu_unit: icuUnit,
        age_group: ageGroup,
      });

      setPredictionResult(response);
      setServiceStatus("online");
      onPredictionSuccess?.(response);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to obtain length of stay prediction";
      setApiError(msg);

      if (
        msg.toLowerCase().includes("unavailable") ||
        msg.toLowerCase().includes("timeout") ||
        msg.toLowerCase().includes("gateway") ||
        msg.toLowerCase().includes("503") ||
        msg.toLowerCase().includes("504")
      ) {
        setIsServiceUnavailable(true);
        setServiceStatus("offline");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setProcedureType("");
    setCondition("");
    setAdmissionType("");
    setComplications("");
    setIcuUnit("");
    setAgeGroup("");
    setSelectedPatientKey("");
    setPredictionResult(null);
    setValidationError("");
    setApiError("");
    setIsServiceUnavailable(false);
  }

  return (
    <div className="section-card los-prediction-card" id="los-prediction-panel">
      {/* Panel Header */}
      <div className="section-card-header" style={{ marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #0d9488 0%, #115e59 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                boxShadow: "0 2px 6px rgba(13, 148, 136, 0.3)",
              }}
            >
              <Activity size={18} />
            </div>
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "var(--navy-900)" }}>
              Length of Stay (LOS) Prediction
            </h3>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: "12px",
                backgroundColor: "#fef3c7",
                color: "#b45309",
                border: "1px solid #fde68a",
                letterSpacing: "0.3px",
              }}
            >
              <Sparkles size={12} /> EXPERIMENTAL MODEL
            </span>
            {serviceStatus === "online" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: "10px",
                  backgroundColor: "#dcfce7",
                  color: "#166534",
                  border: "1px solid #bbf7d0",
                }}
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#22c55e" }} />
                ML Engine Connected
              </span>
            )}
            {serviceStatus === "offline" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: "10px",
                  backgroundColor: "#fee2e2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                }}
              >
                <ServerOff size={11} />
                ML Engine Offline
              </span>
            )}
          </div>
          <p className="section-subtitle" style={{ marginTop: "6px" }}>
            Random Forest regression model trained on synthetic development data to estimate ICU length of stay.
            Strictly experimental development tool; not clinically validated.
          </p>
        </div>
      </div>

      {/* Validation Error Banner */}
      {validationError && (
        <div className="error-banner" role="alert" style={{ marginBottom: "16px" }}>
          <AlertTriangle size={16} />
          <span>{validationError}</span>
          <button type="button" className="close-banner-btn" onClick={() => setValidationError("")}>
            ×
          </button>
        </div>
      )}

      {/* API / Unavailable Error Banner */}
      {apiError && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: isServiceUnavailable ? "#fff1f2" : "#fee2e2",
            border: `1px solid ${isServiceUnavailable ? "#fda4af" : "#fecaca"}`,
            borderRadius: "8px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            color: "#9f1239",
            fontSize: "13px",
          }}
          role="alert"
        >
          {isServiceUnavailable ? <ServerOff size={18} style={{ flexShrink: 0, marginTop: "1px" }} /> : <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "1px" }} />}
          <div style={{ flex: 1 }}>
            <strong>{isServiceUnavailable ? "ML Prediction Service Unavailable" : "Prediction Request Failed"}:</strong>
            <div style={{ marginTop: "3px" }}>{apiError}</div>
            {isServiceUnavailable && (
              <div style={{ fontSize: "11px", color: "#881337", marginTop: "6px" }}>
                The background Python FastAPI service (port 8000) may be restarting or temporarily offline. The system handled this cleanly with safe error status codes.
              </div>
            )}
          </div>
          <button
            type="button"
            className="close-banner-btn"
            onClick={() => {
              setApiError("");
              setIsServiceUnavailable(false);
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Prediction Result Display */}
      {predictionResult && (
        <div
          style={{
            marginBottom: "20px",
            padding: "18px 20px",
            borderRadius: "12px",
            background: "linear-gradient(145deg, #f0fdfa 0%, #e6fffa 100%)",
            border: "1.5px solid #2dd4bf",
            boxShadow: "0 4px 14px rgba(13, 148, 136, 0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", color: "#0f766e", textTransform: "uppercase" }}>
                Estimated Length of Stay
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "4px" }}>
                <span style={{ fontSize: "32px", fontWeight: 900, color: "#0f766e", letterSpacing: "-0.5px" }}>
                  {predictionResult.predicted_los_days}
                </span>
                <span style={{ fontSize: "18px", fontWeight: 700, color: "#115e59" }}>Days</span>
                <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 500 }}>
                  (~{Math.round(predictionResult.predicted_los_days * 24)} hours in ICU)
                </span>
              </div>
              {predictionResult.predicted_free_time && (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#0f766e", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Clock size={13} style={{ color: "#0d9488" }} />
                  <span>
                    <strong>Estimated Bed Free:</strong>{" "}
                    {new Date(predictionResult.predicted_free_time).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "12px",
                  backgroundColor: "#fef3c7",
                  color: "#92400e",
                  border: "1px solid #fde68a",
                }}
              >
                STATUS: {predictionResult.model_status || "experimental_synthetic_data"}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#dc2626",
                  backgroundColor: "#fee2e2",
                  padding: "2px 8px",
                  borderRadius: "8px",
                }}
              >
                CLINICAL USE: FORBIDDEN
              </span>
            </div>
          </div>

          {/* Prominent Required Experimental Disclaimer */}
          <div
            style={{
              marginTop: "14px",
              padding: "12px 14px",
              backgroundColor: "#ffffff",
              border: "1.5px solid #f59e0b",
              borderRadius: "8px",
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
            }}
          >
            <ShieldAlert size={20} style={{ color: "#d97706", flexShrink: 0, marginTop: "2px" }} />
            <div style={{ fontSize: "12px", lineHeight: 1.5, color: "#78350f" }}>
              <strong style={{ fontSize: "13px", color: "#b45309", display: "block", marginBottom: "3px" }}>
                {predictionResult.disclaimer || "Experimental — trained on synthetic data; not for clinical decisions"}
              </strong>
              This output is purely an algorithmic exercise on synthetic educational data. It does NOT represent a medically reliable estimate, has zero clinical validation, and must not guide treatment, triage, discharge, or bed-allocation decisions.
            </div>
          </div>

          {/* Inputs Summary Chips */}
          {predictionResult.inputs && (
            <div style={{ marginTop: "14px", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#0f766e", marginRight: "4px" }}>
                Evaluated Parameters:
              </span>
              <span className="summary-pill">Unit: {predictionResult.inputs.icu_unit}</span>
              <span className="summary-pill">Proc: {predictionResult.inputs.procedure_type}</span>
              <span className="summary-pill">Cond: {predictionResult.inputs.condition}</span>
              <span className="summary-pill">Type: {predictionResult.inputs.admission_type}</span>
              <span className="summary-pill">Comp: {predictionResult.inputs.complications}</span>
              <span className="summary-pill">Age: {predictionResult.inputs.age_group}</span>
              {predictionResult.patient_ref && (
                <span className="summary-pill" style={{ borderColor: "#0d9488", color: "#0f766e" }}>
                  Patient: {predictionResult.patient_ref}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Interactive Form */}
      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Field 0: Patient Selection & Context */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label
              htmlFor={patientSelectId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontWeight: 700,
                fontSize: "13px",
                color: "var(--navy-900)",
                marginBottom: "6px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {isDoctor ? <Stethoscope size={15} style={{ color: "#0d9488" }} /> : <UserCheck size={15} style={{ color: "#3b82f6" }} />}
                <span>
                  {isDoctor ? "Assigned Inpatient Selection (Strict Physician Isolation)" : "Patient Context / Scenario Target"}
                </span>
              </div>
              <span style={{ fontSize: "11px", color: "var(--slate-500)", fontWeight: 500 }}>
                {isDoctor ? "Required for Doctor Role" : "Optional for Administrator"}
              </span>
            </label>

            {isDoctor && availableBeds.length === 0 ? (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  backgroundColor: "#f8fafc",
                  border: "1px dashed #cbd5e1",
                  fontSize: "12px",
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Info size={16} style={{ color: "#94a3b8" }} />
                <span>
                  You currently have no active inpatients assigned to your care. In accordance with patient privacy rules, doctors may only request predictions for their assigned patients.
                </span>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <select
                  id={patientSelectId}
                  className="form-input"
                  value={selectedPatientKey}
                  onChange={(e) => handlePatientChange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--slate-300)",
                    backgroundColor: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                  required={isDoctor}
                >
                  {isAdmin && (
                    <option value="GENERAL">
                      -- General Scenario Simulation (No Patient Record) --
                    </option>
                  )}
                  {isDoctor && (
                    <option value="">
                      -- Select One of Your Assigned Inpatients ({availableBeds.length} Available) --
                    </option>
                  )}
                  {availableBeds.map((bed) => (
                    <option key={bed.id} value={String(bed.id)}>
                      Bed {bed.bed_number} — {bed.patient_name || bed.current_patient_ref || "Active Inpatient"} ({bed.unit_name})
                      {isAdmin && bed.assigned_doctor_name ? ` · Attending: Dr. ${bed.assigned_doctor_name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#64748b" }}>
              {isDoctor
                ? "Selecting an assigned patient validates your physician assignment against the PostgreSQL database and pre-fills known clinical features."
                : "Select an active patient to validate against database records, or select 'General Scenario' for hypothetical capacity modeling."}
            </p>
          </div>

          {/* Field 1: Procedure Type */}
          <div>
            <label htmlFor={procedureSelectId} style={{ display: "block", fontWeight: 700, fontSize: "12px", color: "var(--navy-900)", marginBottom: "4px" }}>
              1. Procedure Type <span style={{ color: "#e11d48" }}>*</span>
            </label>
            <select
              id={procedureSelectId}
              className="form-input"
              value={procedureType}
              onChange={(e) => setProcedureType(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", fontSize: "12px" }}
              required
            >
              <option value="">-- Select Procedure Type --</option>
              {PROCEDURE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Field 2: Condition */}
          <div>
            <label htmlFor={conditionSelectId} style={{ display: "block", fontWeight: 700, fontSize: "12px", color: "var(--navy-900)", marginBottom: "4px" }}>
              2. Patient Condition <span style={{ color: "#e11d48" }}>*</span>
            </label>
            <select
              id={conditionSelectId}
              className="form-input"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", fontSize: "12px" }}
              required
            >
              <option value="">-- Select Condition --</option>
              {CONDITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Field 3: Admission Type */}
          <div>
            <label htmlFor={admissionTypeSelectId} style={{ display: "block", fontWeight: 700, fontSize: "12px", color: "var(--navy-900)", marginBottom: "4px" }}>
              3. Admission Type <span style={{ color: "#e11d48" }}>*</span>
            </label>
            <select
              id={admissionTypeSelectId}
              className="form-input"
              value={admissionType}
              onChange={(e) => setAdmissionType(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", fontSize: "12px" }}
              required
            >
              <option value="">-- Select Admission Type --</option>
              {ADMISSION_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Field 4: Complications */}
          <div>
            <label htmlFor={complicationsSelectId} style={{ display: "block", fontWeight: 700, fontSize: "12px", color: "var(--navy-900)", marginBottom: "4px" }}>
              4. Complications <span style={{ color: "#e11d48" }}>*</span>
            </label>
            <select
              id={complicationsSelectId}
              className="form-input"
              value={complications}
              onChange={(e) => setComplications(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", fontSize: "12px" }}
              required
            >
              <option value="">-- Select Complications --</option>
              {COMPLICATIONS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Field 5: ICU Unit */}
          <div>
            <label htmlFor={icuUnitSelectId} style={{ display: "block", fontWeight: 700, fontSize: "12px", color: "var(--navy-900)", marginBottom: "4px" }}>
              5. ICU Unit <span style={{ color: "#e11d48" }}>*</span>
            </label>
            <select
              id={icuUnitSelectId}
              className="form-input"
              value={icuUnit}
              onChange={(e) => setIcuUnit(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", fontSize: "12px" }}
              required
            >
              <option value="">-- Select ICU Unit --</option>
              {ICU_UNIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Field 6: Age Group */}
          <div>
            <label htmlFor={ageGroupSelectId} style={{ display: "block", fontWeight: 700, fontSize: "12px", color: "var(--navy-900)", marginBottom: "4px" }}>
              6. Patient Age Group <span style={{ color: "#e11d48" }}>*</span>
            </label>
            <select
              id={ageGroupSelectId}
              className="form-input"
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", fontSize: "12px" }}
              required
            >
              <option value="">-- Select Age Group --</option>
              {AGE_GROUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Controls */}
        <div
          style={{
            marginTop: "20px",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "12px",
            borderTop: "1px solid var(--slate-200)",
            paddingTop: "16px",
          }}
        >
          {(procedureType || condition || predictionResult) && (
            <button
              type="button"
              className="action-link-btn"
              onClick={handleReset}
              disabled={isLoading}
              style={{ fontSize: "12px" }}
            >
              <RotateCcw size={14} /> Clear Form
            </button>
          )}

          <button
            type="submit"
            className="action-link-btn primary"
            disabled={isLoading || (isDoctor && availableBeds.length === 0)}
            style={{
              padding: "9px 18px",
              fontSize: "13px",
              fontWeight: 700,
              backgroundColor: isDoctor ? "#0d9488" : "#2563eb",
            }}
          >
            {isLoading ? (
              <>
                <Clock size={15} className="spin-icon" />
                <span>Running Prediction Engine...</span>
              </>
            ) : (
              <>
                <Sparkles size={15} />
                <span>Generate LOS Prediction</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default LosPredictionPanel;
