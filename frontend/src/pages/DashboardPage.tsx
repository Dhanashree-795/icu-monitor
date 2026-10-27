import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BedDouble,
  CheckCircle2,
  Clock,
  Sparkles,
  Wrench,
  AlertTriangle,
  Activity,
  TrendingUp,
  ShieldAlert,
  UserCheck,
  UserPlus,
  UserMinus,
  Settings,
  Play,
  X,
  Check,
  ArrowRightLeft,
  Brush,
  Search,
  Stethoscope,
  Users,
  Key,
  Shield,
  HeartPulse,
  Edit3,
  UserX,
  Lock,
} from "lucide-react";
import type {
  DashboardStats,
  Bed,
  IcuUnit,
  CleaningTask,
  Admission,
  ReadinessConfig,
  UserRole,
  AuthUser,
  StaffUser,
  BedReadinessItem,
  ReadinessResponse,
  AdmissionResponse,
} from "../types";
import { api } from "../api";
import { LosPredictionPanel } from "../components/LosPredictionPanel";

interface DashboardPageProps {
  userRole: UserRole;
  currentUser?: AuthUser | null;
  refreshTrigger?: number;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ userRole, currentUser, refreshTrigger }) => {
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [units, setUnits] = useState<IcuUnit[]>([]);
  const [cleaningTasks, setCleaningTasks] = useState<CleaningTask[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [readinessConfig, setReadinessConfig] = useState<ReadinessConfig | null>(null);
  const [readinessData, setReadinessData] = useState<ReadinessResponse | null>(null);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Patient Details Drawer State (Doctor Workspace)
  const [selectedPatientBed, setSelectedPatientBed] = useState<Bed | null>(null);
  const [selectedPatientAdmission, setSelectedPatientAdmission] = useState<Admission | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingCondition, setEditingCondition] = useState<string>("");
  const [isSavingCondition, setIsSavingCondition] = useState<boolean>(false);
  const [conditionSaveSuccess, setConditionSaveSuccess] = useState<string>("");
  const [conditionSaveError, setConditionSaveError] = useState<string>("");

  // Action Modals State
  const [activeModal, setActiveModal] = useState<
    "ADMIT" | "DISCHARGE" | "RESERVE" | "MAINTENANCE" | "COMPLETE_MAINTENANCE" | "TRANSFER" | "ASSIGN_CLEANER" | null
  >(null);
  const [targetBed, setTargetBed] = useState<Bed | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string>("");

  // Form Fields
  const [patientRefInput, setPatientRefInput] = useState<string>("");
  const [patientNameInput, setPatientNameInput] = useState<string>("");
  const [procedureTypeInput, setProcedureTypeInput] = useState<string>("");
  const [admissionTypeInput, setAdmissionTypeInput] = useState<string>("planned");
  const [complicationsInput, setComplicationsInput] = useState<string>("none");
  const [ageGroupInput, setAgeGroupInput] = useState<string>("adult");
  const [conditionInput, setConditionInput] = useState<string>("");
  const [admissionReasonInput, setAdmissionReasonInput] = useState<string>("");
  const [doctorIdInput, setDoctorIdInput] = useState<number | "">("");
  const [cleanerIdInput, setCleanerIdInput] = useState<number | "">("");
  const [admissionTimeInput, setAdmissionTimeInput] = useState<string>("");
  const [plannedAdmissionTimeInput, setPlannedAdmissionTimeInput] = useState<string>("");
  const [transferTimeInput, setTransferTimeInput] = useState<string>("");
  const [destinationBedIdInput, setDestinationBedIdInput] = useState<number | "">("");
  const [staffMemberInput, setStaffMemberInput] = useState<string>("");
  const [maintenanceReasonInput, setMaintenanceReasonInput] = useState<string>("");
  const [expectedDischargeHoursInput, setExpectedDischargeHoursInput] = useState<number>(24);
  const [notesInput, setNotesInput] = useState<string>("");
  const [cleaningTypeInput, setCleaningTypeInput] = useState<"STANDARD" | "DEEP">("STANDARD");
  const [requiresCleaningInput, setRequiresCleaningInput] = useState<boolean>(true);

  // Administrator Admit Patient State
  const [admitUnitIdInput, setAdmitUnitIdInput] = useState<number | "">("");
  const [admitBedIdInput, setAdmitBedIdInput] = useState<number | "">("");
  const [diagnosisInput, setDiagnosisInput] = useState<string>("");
  const [confirmedAdmission, setConfirmedAdmission] = useState<AdmissionResponse | null>(null);

  // Visual beds unit tab
  const [visualUnitTab, setVisualUnitTab] = useState<string>("ALL");

  // Bed management table search & filters
  const [tableSearchQuery, setTableSearchQuery] = useState<string>("");
  const [tableUnitFilter, setTableUnitFilter] = useState<string>("ALL");
  const [tableStatusFilter, setTableStatusFilter] = useState<string>("ALL");

  // Housekeeping task action state
  const [processingTaskId, setProcessingTaskId] = useState<number | null>(null);

  // Admin scenario controls
  const [isUpdatingScenario, setIsUpdatingScenario] = useState<boolean>(false);

  // Staff Management State (Administrator Workspace)
  const [staffSearchQuery, setStaffSearchQuery] = useState<string>("");
  const [staffRoleFilter, setStaffRoleFilter] = useState<string>("ALL");
  const [staffModalMode, setStaffModalMode] = useState<"CREATE" | "EDIT" | "RESET_PASSWORD" | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [isSubmittingStaff, setIsSubmittingStaff] = useState<boolean>(false);
  const [staffActionError, setStaffActionError] = useState<string>("");
  const [staffActionSuccess, setStaffActionSuccess] = useState<string>("");

  // Staff Form Fields
  const [staffEmailInput, setStaffEmailInput] = useState<string>("");
  const [staffUsernameInput, setStaffUsernameInput] = useState<string>("");
  const [staffRoleInput, setStaffRoleInput] = useState<UserRole>("NURSE");
  const [staffPasswordInput, setStaffPasswordInput] = useState<string>("");
  const [staffPhoneInput, setStaffPhoneInput] = useState<string>("");
  const [staffDepartmentInput, setStaffDepartmentInput] = useState<string>("");
  const [staffUnitIdInput, setStaffUnitIdInput] = useState<number | "">("");
  const [staffResetPasswordInput, setStaffResetPasswordInput] = useState<string>("");

  async function loadRoleDashboardData() {
    setIsLoading(true);
    setError("");
    try {
      if (userRole === "HOUSEKEEPING") {
        // Housekeeping: load tasks and stats only, strictly no clinical admissions or logs
        const [statsData, tasksData, unitsData] = await Promise.all([
          api.getDashboardStats(),
          api.getCleaningTasks(),
          api.getUnits(),
        ]);
        setStats(statsData);
        setCleaningTasks(tasksData);
        setUnits(unitsData);
      } else if (userRole === "DOCTOR") {
        // Doctor: beds, active admissions, cleaning tasks, stats, readiness, staff
        const [statsData, bedsData, unitsData, admissionsData, tasksData, readinessDataRes, staffDataRes] = await Promise.all([
          api.getDashboardStats(),
          api.getBeds(),
          api.getUnits(),
          api.getAdmissions({ status: "ADMITTED" }),
          api.getCleaningTasks(),
          api.getReadiness().catch(() => null),
          api.getStaff().catch(() => []),
        ]);
        setStats(statsData);
        setBeds(bedsData);
        setUnits(unitsData);
        setAdmissions(admissionsData);
        setCleaningTasks(tasksData);
        setReadinessData(readinessDataRes);
        setStaffList(staffDataRes);
      } else if (userRole === "NURSE") {
        // Nurse: beds, cleaning tasks, active admissions, stats, audit logs
        const [statsData, bedsData, unitsData, tasksData, admissionsData] = await Promise.all([
          api.getDashboardStats(),
          api.getBeds(),
          api.getUnits(),
          api.getCleaningTasks(),
          api.getAdmissions({ status: "ADMITTED" }),
        ]);
        setStats(statsData);
        setBeds(bedsData);
        setUnits(unitsData);
        setCleaningTasks(tasksData);
        setAdmissions(admissionsData);
      } else {
        // ADMIN: all data + readiness config, heuristic readiness intelligence, and full admin staff directory
        const [statsData, bedsData, unitsData, tasksData, admissionsData, configData, readinessDataRes, staffDataRes] =
          await Promise.all([
            api.getDashboardStats(),
            api.getBeds(),
            api.getUnits(),
            api.getCleaningTasks(),
            api.getAdmissions(),
            api.getReadinessSettings().catch(() => null),
            api.getReadiness().catch(() => null),
            api.getAdminStaff().catch(() => []),
          ]);
        setStats(statsData);
        setBeds(bedsData);
        setUnits(unitsData);
        setCleaningTasks(tasksData);
        setAdmissions(admissionsData);
        setReadinessConfig(configData);
        setReadinessData(readinessDataRes);
        setStaffList(staffDataRes);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load dashboard data";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRoleDashboardData();
  }, [userRole, refreshTrigger]);

  const readinessMap = useMemo(() => {
    const map = new Map<number, BedReadinessItem>();
    if (readinessData?.allBeds) {
      for (const item of readinessData.allBeds) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [readinessData]);

  // Unit-wise bed summary table metrics (loaded dynamically from actual units & beds)
  const unitSummaries = useMemo(() => {
    return units.map((u) => {
      const unitBeds = beds.filter((b) => b.unit_id === u.id);
      const avail = unitBeds.filter((b) => b.status === "AVAILABLE").length;
      const occ = unitBeds.filter((b) => b.status === "OCCUPIED").length;
      const clean = unitBeds.filter((b) => b.status === "CLEANING").length;
      const maint = unitBeds.filter((b) => b.status === "MAINTENANCE").length;
      const total = unitBeds.length;
      const occRate = total > 0 ? Math.round((occ / total) * 100) : 0;
      return {
        id: u.id,
        name: u.name,
        available: avail,
        occupied: occ,
        cleaning: clean,
        maintenance: maint,
        total,
        occRate,
      };
    });
  }, [units, beds]);

  const totalSummary = useMemo(() => {
    const avail = beds.filter((b) => b.status === "AVAILABLE").length;
    const occ = beds.filter((b) => b.status === "OCCUPIED").length;
    const clean = beds.filter((b) => b.status === "CLEANING").length;
    const maint = beds.filter((b) => b.status === "MAINTENANCE").length;
    const total = beds.length;
    const occRate = total > 0 ? Math.round((occ / total) * 100) : 0;
    return { available: avail, occupied: occ, cleaning: clean, maintenance: maint, total, occRate };
  }, [beds]);

  // Visual beds filtered by unit tabs
  const visualBeds = useMemo(() => {
    if (visualUnitTab === "ALL") return beds;
    return beds.filter(
      (b) => String(b.unit_id) === visualUnitTab || b.unit_name.toLowerCase() === visualUnitTab.toLowerCase()
    );
  }, [beds, visualUnitTab]);

  // Bed management table search & filter results
  const tableFilteredBeds = useMemo(() => {
    return beds.filter((b) => {
      if (tableUnitFilter !== "ALL" && String(b.unit_id) !== tableUnitFilter) return false;
      if (tableStatusFilter !== "ALL" && b.status !== tableStatusFilter) return false;
      if (tableSearchQuery.trim()) {
        const q = tableSearchQuery.trim().toLowerCase();
        const bedNumMatch = b.bed_number.toLowerCase().includes(q);
        const patientMatch = (b.current_patient_ref || "").toLowerCase().includes(q);
        const docMatch = (b.assigned_doctor_name || b.assigned_doctor_email || "").toLowerCase().includes(q);
        const cleanerMatch = (b.assigned_cleaner_name || b.assigned_cleaner_email || "").toLowerCase().includes(q);
        const unitMatch = b.unit_name.toLowerCase().includes(q);
        if (!bedNumMatch && !patientMatch && !docMatch && !cleanerMatch && !unitMatch) return false;
      }
      return true;
    });
  }, [beds, tableUnitFilter, tableStatusFilter, tableSearchQuery]);

  // Doctors list for admission dropdowns - strictly active DOCTOR accounts
  const activeDoctors = useMemo(() => {
    return staffList.filter((s) => s.role === "DOCTOR" && s.active !== false);
  }, [staffList]);

  // Available beds for admission filtered dynamically by selected ICU unit
  const availableBedsForUnit = useMemo(() => {
    return beds.filter((b) => {
      if (b.status !== "AVAILABLE") return false;
      if (typeof admitUnitIdInput === "number") {
        return b.unit_id === admitUnitIdInput;
      }
      return true;
    });
  }, [beds, admitUnitIdInput]);

  const availableDoctors = useMemo(() => {
    return staffList.filter((s) => (s.role === "DOCTOR" || s.role === "ADMIN") && s.active !== false);
  }, [staffList]);

  // Housekeeping staff list for cleaner assignment
  const availableCleaners = useMemo(() => {
    return staffList.filter((s) => s.role === "HOUSEKEEPING");
  }, [staffList]);

  // Filtered staff list for Administrator staff management directory
  const filteredStaff = useMemo(() => {
    return staffList.filter((s) => {
      if (staffRoleFilter !== "ALL" && s.role !== staffRoleFilter) return false;
      if (staffSearchQuery.trim()) {
        const q = staffSearchQuery.trim().toLowerCase();
        const emailMatch = s.email.toLowerCase().includes(q);
        const nameMatch = (s.username || "").toLowerCase().includes(q);
        const deptMatch = (s.department || "").toLowerCase().includes(q);
        const unitMatch = (s.assigned_unit_name || "").toLowerCase().includes(q);
        if (!emailMatch && !nameMatch && !deptMatch && !unitMatch) return false;
      }
      return true;
    });
  }, [staffList, staffRoleFilter, staffSearchQuery]);

  // Beds occupied by patients assigned to the currently authenticated doctor
  const doctorAssignedBeds = useMemo(() => {
    return beds.filter((b) => {
      if (b.status !== "OCCUPIED") return false;
      if (currentUser?.id && b.assigned_doctor_id === currentUser.id) return true;
      if (currentUser?.email && b.assigned_doctor_email?.toLowerCase() === currentUser.email.toLowerCase()) return true;
      if (admissions.some((a) => a.bed_id === b.id && a.status === "ADMITTED")) return true;
      return false;
    });
  }, [beds, currentUser, admissions]);

  // Open Patient Details Drawer
  async function openPatientDetailsDrawer(bed: Bed) {
    setSelectedPatientBed(bed);
    setConditionSaveSuccess("");
    setConditionSaveError("");
    setIsDrawerOpen(true);

    const matched = admissions.find((a) => a.bed_id === bed.id && a.status === "ADMITTED");
    if (matched) {
      setSelectedPatientAdmission(matched);
      setEditingCondition(matched.condition || bed.patient_condition || "Stable under observation");
    } else {
      try {
        const adms = await api.getAdmissions({ bedId: bed.id, status: "ADMITTED" });
        if (adms && adms.length > 0) {
          setSelectedPatientAdmission(adms[0]);
          setEditingCondition(adms[0].condition || bed.patient_condition || "Stable under observation");
        } else {
          setSelectedPatientAdmission(null);
          setEditingCondition(bed.patient_condition || "Stable under observation");
        }
      } catch {
        setSelectedPatientAdmission(null);
        setEditingCondition(bed.patient_condition || "Stable under observation");
      }
    }
  }

  function closePatientDetailsDrawer() {
    setIsDrawerOpen(false);
    setSelectedPatientBed(null);
    setSelectedPatientAdmission(null);
    setConditionSaveSuccess("");
    setConditionSaveError("");
  }

  async function handleSaveCondition(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCondition.trim()) {
      setConditionSaveError("Patient clinical condition cannot be empty.");
      return;
    }
    if (!selectedPatientAdmission?.id) {
      setConditionSaveError("No active inpatient admission record found to update.");
      return;
    }

    setIsSavingCondition(true);
    setConditionSaveError("");
    setConditionSaveSuccess("");

    try {
      const res = await api.updatePatientCondition(selectedPatientAdmission.id, {
        condition: editingCondition.trim(),
      });
      setConditionSaveSuccess(res.message || "Patient condition updated successfully.");

      // Update local state immediately
      setSelectedPatientAdmission((prev) =>
        prev ? { ...prev, condition: editingCondition.trim() } : null
      );
      setBeds((prev) =>
        prev.map((b) =>
          b.id === selectedPatientBed?.id
            ? { ...b, patient_condition: editingCondition.trim() }
            : b
        )
      );
      setAdmissions((prev) =>
        prev.map((a) =>
          a.id === selectedPatientAdmission.id
            ? { ...a, condition: editingCondition.trim() }
            : a
        )
      );

      // Refresh in background
      loadRoleDashboardData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update patient condition";
      setConditionSaveError(msg);
    } finally {
      setIsSavingCondition(false);
    }
  }

  function renderPatientDrawer() {
    if (!isDrawerOpen || !selectedPatientBed) return null;

    const patientName =
      selectedPatientAdmission?.patient_name ||
      selectedPatientBed.patient_name ||
      (selectedPatientBed.current_patient_ref ? "Name unavailable" : "Assigned Patient");
    const patientRef =
      selectedPatientAdmission?.patient_ref || selectedPatientBed.current_patient_ref || "PT-INP";
    const attendingDoc =
      selectedPatientAdmission?.admitting_doctor_name ||
      selectedPatientBed.assigned_doctor_name ||
      (currentUser?.role === "DOCTOR" ? (currentUser?.username || "Dr. Attending") : "Unassigned");
    const admissionTime = selectedPatientAdmission?.admission_time
      ? new Date(selectedPatientAdmission.admission_time).toLocaleString([], {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "Active Inpatient";
    const expDischarge = selectedPatientAdmission?.expected_discharge_time
      ? new Date(selectedPatientAdmission.expected_discharge_time).toLocaleString([], {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "Open-ended / Clinical evaluation";
    const admissionReason =
      selectedPatientAdmission?.admission_reason ||
      selectedPatientAdmission?.notes ||
      "Intensive inpatient clinical monitoring and recovery";

    return (
      <div className="patient-drawer-overlay" onClick={closePatientDetailsDrawer}>
        <div
          className="patient-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Patient Clinical Chart Drawer"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drawer Header */}
          <div className="patient-drawer-header">
            <div>
              <h3>
                <Stethoscope size={20} style={{ color: "#0d9488" }} />
                <span>Patient Clinical Chart</span>
              </h3>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                {selectedPatientBed.unit_name} — {selectedPatientBed.bed_number}
              </span>
            </div>
            <button
              type="button"
              className="btn-drawer-close"
              onClick={closePatientDetailsDrawer}
              title="Close patient chart"
              aria-label="Close patient details drawer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="patient-drawer-body">
            {/* Feedback Notifications */}
            {conditionSaveSuccess && (
              <div className="success-banner" role="status" style={{ margin: 0 }}>
                <CheckCircle2 size={16} />
                <span>{conditionSaveSuccess}</span>
                <button
                  type="button"
                  className="close-banner-btn"
                  onClick={() => setConditionSaveSuccess("")}
                >
                  ×
                </button>
              </div>
            )}
            {conditionSaveError && (
              <div className="error-banner" role="alert" style={{ margin: 0 }}>
                <AlertTriangle size={16} />
                <span>{conditionSaveError}</span>
                <button
                  type="button"
                  className="close-banner-btn"
                  onClick={() => setConditionSaveError("")}
                >
                  ×
                </button>
              </div>
            )}

            {/* Inpatient Summary Card */}
            <div className="drawer-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <UserCheck size={18} style={{ color: "#0d9488" }} />
                    <h4 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>{patientName}</h4>
                  </div>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>ID: {patientRef}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                  <span className="status-badge status-occupied">OCCUPIED</span>
                  {selectedPatientBed.is_isolation && (
                    <span className="isolation-pill">Airborne Isolation</span>
                  )}
                </div>
              </div>
            </div>

            {/* Clinical Overview Grid */}
            <div className="drawer-card">
              <span className="drawer-card-title">Admission & Bed Details</span>
              <div className="drawer-info-grid">
                <div className="drawer-info-item">
                  <span className="drawer-info-label">Assigned Bed</span>
                  <span className="drawer-info-value">{selectedPatientBed.bed_number}</span>
                </div>
                <div className="drawer-info-item">
                  <span className="drawer-info-label">ICU Unit</span>
                  <span className="drawer-info-value">{selectedPatientBed.unit_name}</span>
                </div>
                <div className="drawer-info-item">
                  <span className="drawer-info-label">Attending Physician</span>
                  <span className="drawer-info-value">{attendingDoc}</span>
                </div>
                <div className="drawer-info-item">
                  <span className="drawer-info-label">Admission Time</span>
                  <span className="drawer-info-value">{admissionTime}</span>
                </div>
                <div className="drawer-info-item" style={{ gridColumn: "span 2" }}>
                  <span className="drawer-info-label">Expected Discharge / Stepdown</span>
                  <span className="drawer-info-value">{expDischarge}</span>
                </div>
                {(selectedPatientBed.patient_procedure_type || selectedPatientAdmission?.procedure_type) && (
                  <div className="drawer-info-item" style={{ gridColumn: "span 2" }}>
                    <span className="drawer-info-label">Procedure / Admission Type</span>
                    <span
                      className="drawer-info-value"
                      style={{ fontWeight: 600, color: "#0d9488" }}
                    >
                      {selectedPatientBed.patient_procedure_type || selectedPatientAdmission?.procedure_type}
                    </span>
                  </div>
                )}
                <div className="drawer-info-item" style={{ gridColumn: "span 2" }}>
                  <span className="drawer-info-label">Triage Diagnosis & Notes</span>
                  <span
                    className="drawer-info-value"
                    style={{ fontWeight: 400, color: "#334155", fontSize: "12px", lineHeight: 1.5 }}
                  >
                    {admissionReason}
                  </span>
                </div>
              </div>
            </div>

            {/* Experimental Length of Stay Prediction Details */}
            <div className="drawer-card" style={{ borderLeft: "4px solid #0d9488" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span className="drawer-card-title" style={{ margin: 0 }}>
                  Experimental LOS & Bed-Free Time
                </span>
                <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", backgroundColor: "#fef3c7", color: "#92400e", fontWeight: 700 }}>
                  EXPERIMENTAL MODEL
                </span>
              </div>
              <div className="drawer-info-grid">
                <div className="drawer-info-item">
                  <span className="drawer-info-label">Prediction Status</span>
                  <span className="drawer-info-value" style={{ fontWeight: 600 }}>
                    {selectedPatientAdmission?.prediction_status || selectedPatientBed.prediction_status || "Not calculated"}
                  </span>
                </div>
                <div className="drawer-info-item">
                  <span className="drawer-info-label">Predicted LOS</span>
                  <span className="drawer-info-value" style={{ fontWeight: 700, color: "#0d9488" }}>
                    {(selectedPatientAdmission?.predicted_los_days ?? selectedPatientBed.predicted_los_days) != null
                      ? `${selectedPatientAdmission?.predicted_los_days ?? selectedPatientBed.predicted_los_days} days`
                      : "Can't predict"}
                  </span>
                </div>
                <div className="drawer-info-item" style={{ gridColumn: "span 2" }}>
                  <span className="drawer-info-label">Estimated Bed-Free Time</span>
                  <span className="drawer-info-value" style={{ fontWeight: 600, color: "#1e293b" }}>
                    {(selectedPatientAdmission?.predicted_free_time || selectedPatientBed.predicted_free_time)
                      ? `Est. ${new Date(selectedPatientAdmission?.predicted_free_time || selectedPatientBed.predicted_free_time!).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
                      : "Can't predict"}
                  </span>
                </div>
                {(selectedPatientAdmission?.prediction_reason || selectedPatientBed.prediction_reason) && (
                  <div className="drawer-info-item" style={{ gridColumn: "span 2" }}>
                    <span className="drawer-info-label">Status Details</span>
                    <span className="drawer-info-value" style={{ fontSize: "11px", color: "#64748b" }}>
                      {selectedPatientAdmission?.prediction_reason || selectedPatientBed.prediction_reason}
                    </span>
                  </div>
                )}
                {(selectedPatientAdmission?.prediction_updated_at || selectedPatientBed.prediction_updated_at) && (
                  <div className="drawer-info-item" style={{ gridColumn: "span 2" }}>
                    <span className="drawer-info-label">Last Prediction Timestamp</span>
                    <span className="drawer-info-value" style={{ fontSize: "11px", color: "#64748b" }}>
                      {new Date(selectedPatientAdmission?.prediction_updated_at || selectedPatientBed.prediction_updated_at!).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
              <p style={{ margin: "8px 0 0 0", fontSize: "10px", color: "#94a3b8", fontStyle: "italic" }}>
                Experimental — trained on synthetic data; not for clinical decisions.
              </p>
            </div>

            {/* Editable Condition Section */}
            <form onSubmit={handleSaveCondition} className="drawer-condition-box">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <label htmlFor="drawerConditionInput" style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>
                  Patient Condition & Acuity
                </label>
                <span style={{ fontSize: "11px", color: "#64748b" }}>Validated endpoint</span>
              </div>

              <textarea
                id="drawerConditionInput"
                className="drawer-textarea"
                value={editingCondition}
                onChange={(e) => setEditingCondition(e.target.value)}
                placeholder="Enter clinical condition, telemetry findings, acuity assessment..."
                rows={3}
                required
              />

              <div>
                <span className="condition-presets-label">Clinical Scenario Presets (Click to select):</span>
                <div className="condition-presets-row" style={{ marginTop: "6px" }}>
                  {[
                    "Stable, planned observation",
                    "Stable after procedure",
                    "Postoperative monitoring",
                    "Acute chest pain under evaluation",
                    "Pneumonia requiring monitoring",
                    "Severe respiratory distress",
                    "Suspected sepsis",
                    "Stroke observation",
                    "Post-trauma monitoring",
                    "Postoperative recovery",
                    "Acute kidney injury",
                    "Arrhythmia monitoring",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="condition-preset-chip"
                      onClick={() => setEditingCondition(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
                <button
                  type="submit"
                  className="btn-drawer-save"
                  disabled={isSavingCondition || !editingCondition.trim()}
                >
                  {isSavingCondition ? (
                    <>
                      <Activity size={14} className="spin-icon" />
                      <span>Saving Condition...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Save Patient Condition</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Authorized Clinical Bed Actions */}
            <div className="drawer-card" style={{ background: "#ffffff" }}>
              <span className="drawer-card-title">Authorized Clinical Actions</span>
              <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#64748b" }}>
                Execute clinical transfers or discharge to trigger turnover decontamination:
              </p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-table-action btn-transfer"
                  style={{ flex: 1, padding: "8px 12px", justifyContent: "center" }}
                  onClick={() => {
                    closePatientDetailsDrawer();
                    openTransferModal(selectedPatientBed);
                  }}
                >
                  <ArrowRightLeft size={14} />
                  <span>Transfer Bed</span>
                </button>
                <button
                  type="button"
                  className="btn-table-action btn-discharge"
                  style={{ flex: 1, padding: "8px 12px", justifyContent: "center" }}
                  onClick={() => {
                    closePatientDetailsDrawer();
                    openDischargeModal(selectedPatientBed);
                  }}
                >
                  <UserMinus size={14} />
                  <span>Discharge Patient</span>
                </button>
                <button
                  type="button"
                  className="btn-table-action"
                  style={{
                    width: "100%",
                    marginTop: "8px",
                    padding: "8px 12px",
                    justifyContent: "center",
                    backgroundColor: "#f0fdfa",
                    color: "#0f766e",
                    borderColor: "#99f6e4",
                    fontWeight: 700,
                  }}
                  onClick={() => {
                    closePatientDetailsDrawer();
                    const el = document.getElementById("los-prediction-panel");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <Activity size={14} />
                  <span>Predict Length of Stay (Experimental ML)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="patient-drawer-footer">
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Logged under physician ID #{currentUser?.id || "Session"}
            </span>
            <button type="button" className="action-link-btn" onClick={closePatientDetailsDrawer}>
              Close Chart
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderDoctorBedActions(bed: Bed) {
    const isAssignedToMe = currentUser?.id ? bed.assigned_doctor_id === currentUser.id : false;

    if (bed.status === "AVAILABLE") {
      return (
        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn-table-action btn-admit"
            onClick={() => openAdmitModal(bed)}
            title="Admit patient to vacant bed"
          >
            <UserPlus size={13} />
            <span>Admit</span>
          </button>
        </div>
      );
    }

    if (bed.status === "RESERVED") {
      return (
        <span className="text-muted" style={{ fontSize: "12px", fontStyle: "italic" }}>
          Scheduled Hold
        </span>
      );
    }

    if (bed.status === "OCCUPIED") {
      if (isAssignedToMe) {
        return (
          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn-table-action"
              onClick={() => openPatientDetailsDrawer(bed)}
              title="Open patient details and condition editor"
              style={{ backgroundColor: "#0d948815", color: "#0d9488", border: "1px solid #0d948840" }}
            >
              <Stethoscope size={13} />
              <span>Details</span>
            </button>
            <button
              type="button"
              className="btn-table-action btn-transfer"
              onClick={() => openTransferModal(bed)}
              title="Transfer patient to another bed"
            >
              <ArrowRightLeft size={13} />
              <span>Transfer</span>
            </button>
            <button
              type="button"
              className="btn-table-action btn-discharge"
              onClick={() => openDischargeModal(bed)}
              title="Discharge patient and trigger turnover decontamination"
            >
              <UserMinus size={13} />
              <span>Discharge</span>
            </button>
          </div>
        );
      } else {
        return (
          <span className="text-muted" style={{ fontSize: "12px", fontStyle: "italic" }}>
            Attending physician only
          </span>
        );
      }
    }

    if (bed.status === "CLEANING") {
      return (
        <span className="text-muted" style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <Sparkles size={12} style={{ color: "#8b60b5" }} />
          <span>Turnover in progress</span>
        </span>
      );
    }

    if (bed.status === "MAINTENANCE") {
      return (
        <span className="text-muted" style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <Wrench size={12} style={{ color: "#d97706" }} />
          <span>Biomedical service</span>
        </span>
      );
    }

    return null;
  }

  function renderPredictedFreeTime(bed: Bed) {
    if (bed.status === "AVAILABLE") {
      return (
        <span style={{ color: "#10b981", fontWeight: 600, fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <CheckCircle2 size={13} />
          <span>Available Now</span>
        </span>
      );
    }

    if (bed.status === "CLEANING") {
      const readiness = readinessMap.get(bed.id);
      const minutesRemaining = readiness?.predictedTurnoverMinutesRemaining ?? 20;
      return (
        <div>
          <span style={{ fontWeight: 600, color: "#8b60b5", fontSize: "13px" }}>
            ~{minutesRemaining} mins
          </span>
          <div style={{ fontSize: "10px", color: "#64748b" }}>
            {readiness?.cleaningPredictedCompletion
              ? `Est. ${new Date(readiness.cleaningPredictedCompletion).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Turnover sanitization"}
          </div>
        </div>
      );
    }

    if (bed.status === "OCCUPIED") {
      const matchedAdm = admissions.find((a) => a.bed_id === bed.id && a.status === "ADMITTED");
      const storedLos = bed.predicted_los_days ?? matchedAdm?.predicted_los_days;
      const admTimeRaw = bed.admission_time ?? matchedAdm?.admission_time;
      const storedFreeTime = bed.predicted_free_time ?? matchedAdm?.predicted_free_time;

      if (storedLos !== undefined && storedLos !== null && admTimeRaw) {
        const admDate = new Date(admTimeRaw);
        if (!isNaN(admDate.getTime())) {
          const freeDate = storedFreeTime ? new Date(storedFreeTime) : new Date(admDate.getTime() + Number(storedLos) * 86400000);
          if (!isNaN(freeDate.getTime())) {
            return (
              <div className="predicted-free-time-box">
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <Clock size={13} style={{ color: "#0d9488" }} />
                  <span style={{ fontWeight: 600, color: "var(--navy-900, #0f172a)", fontSize: "12px" }}>
                    {freeDate.toLocaleDateString([], { month: "short", day: "numeric" })},{" "}
                    {freeDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                  <span
                    className="estimated-badge"
                    style={{
                      fontSize: "10px",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      backgroundColor: "#ecfdf5",
                      color: "#065f46",
                      border: "1px solid #a7f3d0",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                    }}
                  >
                    Estimated
                  </span>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    ~{Number(storedLos).toFixed(1)}d LOS
                  </span>
                </div>
              </div>
            );
          }
        }
      }

      // Occupied bed without valid prediction or missing admission timestamp
      const reason = bed.prediction_reason || matchedAdm?.prediction_reason || (!admTimeRaw ? "Missing admission timestamp" : "Inputs insufficient");

      return (
        <div className="cant-predict-box">
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#64748b",
              backgroundColor: "#f1f5f9",
              padding: "2px 8px",
              borderRadius: "4px",
              border: "1px solid #e2e8f0",
              display: "inline-block",
            }}
          >
            Can't predict
          </span>
          <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>
            {reason}
          </div>
        </div>
      );
    }

    if (bed.status === "RESERVED") {
      return (
        <span style={{ color: "#d97706", fontSize: "12px", fontWeight: 500 }}>
          Scheduled intake hold
        </span>
      );
    }

    if (bed.status === "MAINTENANCE") {
      return (
        <span style={{ color: "#64748b", fontSize: "12px", fontStyle: "italic" }}>
          Pending biomedical release
        </span>
      );
    }

    return <span className="text-muted">—</span>;
  }

  function renderBedPatientName(bed: Bed) {
    if (currentUser?.role === "HOUSEKEEPING") {
      return <span className="text-muted">—</span>;
    }

    const isDoctorRole = currentUser?.role === "DOCTOR";
    const isMyPatient = currentUser?.id ? bed.assigned_doctor_id === currentUser.id : false;
    const isAssignedToMe = isMyPatient || admissions.some((a) => a.bed_id === bed.id && a.status === "ADMITTED");

    if (bed.status === "OCCUPIED") {
      // Doctor isolation: If authenticated as doctor and patient is not assigned to them, hide patient details
      if (isDoctorRole && !isAssignedToMe) {
        return (
          <div>
            <span style={{ color: "#475569", fontWeight: 500 }}>
              Protected Inpatient (Other Physician)
            </span>
            <div style={{ fontSize: "10px", color: "#94a3b8" }}>Clinical Details Restricted</div>
          </div>
        );
      }

      // Authorized view (Assigned Doctor, Nurse, Admin)
      const displayName = bed.patient_name || "Name unavailable";

      return (
        <div>
          <button
            type="button"
            onClick={() => openPatientDetailsDrawer(bed)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "#0d9488",
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
              textDecoration: "underline",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
            title="Click to view and edit patient details"
          >
            <UserCheck size={14} />
            <span>{displayName}</span>
          </button>
          {bed.current_patient_ref && (
            <div>
              <span className="code-pill" style={{ fontSize: "10px", marginTop: "2px", display: "inline-block" }}>
                {bed.current_patient_ref}
              </span>
            </div>
          )}
          {bed.patient_condition && (
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "1px" }}>
              {bed.patient_condition}
            </div>
          )}
        </div>
      );
    }

    if (bed.status === "RESERVED") {
      const displayName = bed.patient_name || "Reserved Hold";
      return (
        <div>
          <span style={{ color: "#d97706", fontSize: "12px", fontWeight: 600 }}>
            {displayName}
          </span>
          {bed.current_patient_ref && (
            <div>
              <span className="code-pill" style={{ fontSize: "10px", marginTop: "2px", display: "inline-block" }}>
                {bed.current_patient_ref}
              </span>
            </div>
          )}
        </div>
      );
    }

    return <span className="text-muted">—</span>;
  }

  function renderBedDoctorAssigned(bed: Bed) {
    if (!bed.assigned_doctor_name && !bed.assigned_doctor_email) {
      return <span className="text-muted" style={{ fontStyle: "italic" }}>Unassigned</span>;
    }
    const isCurrentDoc =
      (currentUser?.id && bed.assigned_doctor_id === currentUser.id) ||
      (currentUser?.email && bed.assigned_doctor_email?.toLowerCase() === currentUser.email.toLowerCase());

    const docName = bed.assigned_doctor_name || "Unassigned";

    return (
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontWeight: isCurrentDoc ? 600 : 400, color: isCurrentDoc ? "#0f766e" : "#334155" }}>
          {docName}
        </span>
        {isCurrentDoc && (
          <span
            style={{
              fontSize: "10px",
              backgroundColor: "#ccfbf1",
              color: "#0f766e",
              padding: "1px 5px",
              borderRadius: "4px",
              fontWeight: 600,
            }}
          >
            YOU
          </span>
        )}
      </div>
    );
  }

  function renderBedCleanerName(bed: Bed) {
    if (bed.assigned_cleaner_name) {
      return (
        <span style={{ fontWeight: 600, color: "#1e293b" }}>
          {bed.assigned_cleaner_name}
        </span>
      );
    }
    if (bed.status === "CLEANING") {
      return <span style={{ color: "#8b60b5", fontSize: "12px", fontStyle: "italic" }}>Unassigned</span>;
    }
    return <span className="text-muted">—</span>;
  }


  // Housekeeping Task Start / Complete
  async function handleStartCleaning(taskId: number) {
    setProcessingTaskId(taskId);
    try {
      const res = await api.startCleaningTask(taskId);
      setSuccessMessage(res.message);
      await loadRoleDashboardData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start cleaning task";
      setError(msg);
    } finally {
      setProcessingTaskId(null);
    }
  }

  async function handleCompleteCleaning(taskId: number) {
    setProcessingTaskId(taskId);
    try {
      const res = await api.completeCleaningTask(taskId);
      setSuccessMessage(res.message);
      await loadRoleDashboardData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to complete cleaning task";
      setError(msg);
    } finally {
      setProcessingTaskId(null);
    }
  }

  // Admin Scenario Switcher
  async function handleSwitchScenario(scenario: "Normal" | "Busy" | "Surge") {
    if (userRole !== "ADMIN") return;
    setIsUpdatingScenario(true);
    try {
      const res = await api.updateReadinessSettings({ scenario });
      setSuccessMessage(res.message);
      setReadinessConfig(res.config);
      await loadRoleDashboardData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to switch simulation scenario";
      setError(msg);
    } finally {
      setIsUpdatingScenario(false);
    }
  }

  // Modal Open Handlers
  function openAdmitModal(bed?: Bed) {
    if (bed) {
      setTargetBed(bed);
      setAdmitUnitIdInput(bed.unit_id);
      setAdmitBedIdInput(bed.id);
      setPatientRefInput(bed.current_patient_ref || `PT-${Math.floor(1000 + Math.random() * 9000)}`);
    } else {
      setTargetBed(null);
      const firstUnit = units.length > 0 ? units[0].id : "";
      setAdmitUnitIdInput(firstUnit);
      const avail = beds.find(b => b.status === "AVAILABLE" && (!firstUnit || b.unit_id === firstUnit));
      setAdmitBedIdInput(avail ? avail.id : "");
      setPatientRefInput(`PT-${Math.floor(1000 + Math.random() * 9000)}`);
    }
    setPatientNameInput("");
    setProcedureTypeInput("");
    setAdmissionTypeInput("planned");
    setComplicationsInput("none");
    setAgeGroupInput("adult");
    setConditionInput("stable");
    setDiagnosisInput("");
    setAdmissionReasonInput("");
    if (userRole === "DOCTOR" && currentUser?.id) {
      setDoctorIdInput(currentUser.id);
    } else {
      setDoctorIdInput(activeDoctors.length > 0 ? activeDoctors[0].id : "");
    }
    setAdmissionTimeInput(new Date().toISOString().slice(0, 16));
    setExpectedDischargeHoursInput(48);
    setNotesInput("");
    setActionError("");
    setActiveModal("ADMIT");
  }

  function openDischargeModal(bed: Bed) {
    setTargetBed(bed);
    setCleaningTypeInput(bed.is_isolation ? "DEEP" : "STANDARD");
    setNotesInput("");
    setActionError("");
    setActiveModal("DISCHARGE");
  }

  function openReserveModal(bed: Bed) {
    setTargetBed(bed);
    setPatientRefInput(`PT-RES-${Math.floor(100 + Math.random() * 900)}`);
    setPlannedAdmissionTimeInput(new Date().toISOString().slice(0, 16));
    setDoctorIdInput("");
    setNotesInput("");
    setActionError("");
    setActiveModal("RESERVE");
  }

  function openMaintenanceModal(bed: Bed) {
    setTargetBed(bed);
    setMaintenanceReasonInput("");
    setStaffMemberInput("");
    setAdmissionTimeInput(new Date().toISOString().slice(0, 16));
    setNotesInput("");
    setActionError("");
    setActiveModal("MAINTENANCE");
  }

  function openCompleteMaintenanceModal(bed: Bed) {
    setTargetBed(bed);
    setRequiresCleaningInput(true);
    setActionError("");
    setActiveModal("COMPLETE_MAINTENANCE");
  }

  function openTransferModal(bed: Bed) {
    setTargetBed(bed);
    setDestinationBedIdInput("");
    setTransferTimeInput(new Date().toISOString().slice(0, 16));
    setNotesInput("");
    setActionError("");
    setActiveModal("TRANSFER");
  }

  function openAssignCleanerModal(bed: Bed) {
    setTargetBed(bed);
    setCleanerIdInput(bed.assigned_cleaner_id || "");
    setNotesInput("");
    setActionError("");
    setActiveModal("ASSIGN_CLEANER");
  }

  // Submit Modal Actions
  async function handleModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingAction(true);
    setActionError("");

    try {
      if (activeModal === "ADMIT") {
        if (!patientNameInput.trim()) {
          setActionError("Patient full name is required.");
          setIsSubmittingAction(false);
          return;
        }

        const effectiveBedId = targetBed ? targetBed.id : (admitBedIdInput ? Number(admitBedIdInput) : null);
        if (!effectiveBedId) {
          setActionError("Please select an available ICU bed for admission.");
          setIsSubmittingAction(false);
          return;
        }

        const effectiveDoctorId = userRole === "DOCTOR" && currentUser?.id ? currentUser.id : Number(doctorIdInput);
        if (!effectiveDoctorId) {
          setActionError("Please assign an active attending physician.");
          setIsSubmittingAction(false);
          return;
        }

        const targetBedObj = beds.find(b => b.id === effectiveBedId) || targetBed;
        const selectedUnit = units.find(u => u.id === (targetBedObj?.unit_id || Number(admitUnitIdInput)));

        const res = await api.createAdmission({
          patientName: patientNameInput.trim(),
          patientRef: patientRefInput.trim().toUpperCase() || undefined,
          bedId: effectiveBedId,
          doctorId: effectiveDoctorId,
          icuUnit: selectedUnit?.name || targetBedObj?.unit_name,
          procedureType: procedureTypeInput.trim() || undefined,
          condition: conditionInput.trim() || undefined,
          diagnosis: diagnosisInput.trim() || admissionReasonInput.trim() || undefined,
          admissionType: admissionTypeInput || undefined,
          complications: complicationsInput || undefined,
          ageGroup: ageGroupInput || undefined,
          notes: notesInput.trim() || undefined,
          expectedDischargeHours: expectedDischargeHoursInput || 48,
        });

        // Close form modal and present full confirmation
        setActiveModal(null);
        setTargetBed(null);
        setConfirmedAdmission(res);
        setSuccessMessage(res.message);

        // Immediate data refresh so new patient & occupied bed appear instantly
        await loadRoleDashboardData();
        return;
      }

      // For all other clinical bed operations, targetBed is strictly required
      if (!targetBed) return;

      if (activeModal === "DISCHARGE") {
        const res = await api.dischargePatient(
          targetBed.id,
          cleaningTypeInput,
          notesInput.trim() || undefined
        );
        setSuccessMessage(res.message);
      } else if (activeModal === "RESERVE") {
        const res = await api.reserveBed(targetBed.id, {
          reservationRef: patientRefInput.trim().toUpperCase() || undefined,
          patientRef: patientRefInput.trim().toUpperCase() || undefined,
          plannedAdmissionTime: plannedAdmissionTimeInput ? new Date(plannedAdmissionTimeInput).toISOString() : undefined,
          doctorId: doctorIdInput ? Number(doctorIdInput) : undefined,
          notes: notesInput.trim() || undefined,
        });
        setSuccessMessage(res.message);
      } else if (activeModal === "MAINTENANCE") {
        const res = await api.markMaintenance(targetBed.id, {
          reason: maintenanceReasonInput.trim() || notesInput.trim() || "Biomedical maintenance / inspection",
          staffMember: staffMemberInput.trim() || undefined,
          startTime: admissionTimeInput ? new Date(admissionTimeInput).toISOString() : undefined,
          notes: notesInput.trim() || undefined,
        });
        setSuccessMessage(res.message);
      } else if (activeModal === "COMPLETE_MAINTENANCE") {
        const res = await api.completeMaintenance(
          targetBed.id,
          requiresCleaningInput
        );
        setSuccessMessage(res.message);
      } else if (activeModal === "TRANSFER") {
        if (!destinationBedIdInput) {
          setActionError("Please select a destination bed.");
          setIsSubmittingAction(false);
          return;
        }
        const res = await api.transferPatient(targetBed.id, {
          destinationBedId: Number(destinationBedIdInput),
          reason: notesInput.trim() || "Clinical transfer",
          transferTime: transferTimeInput ? new Date(transferTimeInput).toISOString() : undefined,
        });
        setSuccessMessage(res.message);
      } else if (activeModal === "ASSIGN_CLEANER") {
        if (!cleanerIdInput) {
          setActionError("Please select a cleaner or housekeeper.");
          setIsSubmittingAction(false);
          return;
        }
        const res = await api.assignCleanerToBed(targetBed.id, {
          cleanerId: Number(cleanerIdInput),
          notes: notesInput.trim() || undefined,
        });
        setSuccessMessage(res.message);
      }

      setActiveModal(null);
      setTargetBed(null);
      await loadRoleDashboardData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to execute bed operation";
      setActionError(msg);
    } finally {
      setIsSubmittingAction(false);
    }
  }

  async function handleReleaseReservation(bedId: number) {
    try {
      const res = await api.releaseReservation(bedId);
      setSuccessMessage(res.message);
      await loadRoleDashboardData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to release reservation";
      setError(msg);
    }
  }

  // Administrator Staff Management Handlers
  function openCreateStaffModal() {
    setSelectedStaff(null);
    setStaffEmailInput("");
    setStaffUsernameInput("");
    setStaffRoleInput("NURSE");
    setStaffPasswordInput("");
    setStaffPhoneInput("");
    setStaffDepartmentInput("");
    setStaffUnitIdInput("");
    setStaffActionError("");
    setStaffActionSuccess("");
    setStaffModalMode("CREATE");
  }

  function openEditStaffModal(staff: StaffUser) {
    setSelectedStaff(staff);
    setStaffEmailInput(staff.email);
    setStaffUsernameInput(staff.username || "");
    setStaffRoleInput(staff.role);
    setStaffPasswordInput("");
    setStaffPhoneInput(staff.phone || "");
    setStaffDepartmentInput(staff.department || "");
    setStaffUnitIdInput(staff.assigned_unit_id || "");
    setStaffActionError("");
    setStaffActionSuccess("");
    setStaffModalMode("EDIT");
  }

  function openResetPasswordModal(staff: StaffUser) {
    setSelectedStaff(staff);
    setStaffResetPasswordInput("");
    setStaffActionError("");
    setStaffActionSuccess("");
    setStaffModalMode("RESET_PASSWORD");
  }

  async function handleToggleStaffStatus(staff: StaffUser) {
    const newStatus = !staff.active;
    setStaffActionError("");
    setStaffActionSuccess("");
    try {
      const res = await api.setStaffStatus(staff.id, newStatus);
      setStaffActionSuccess(res.message);
      setStaffList((prev) =>
        prev.map((s) => (s.id === staff.id ? { ...s, active: newStatus } : s))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change staff status";
      setStaffActionError(msg);
    }
  }

  async function handleSubmitStaffForm(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingStaff(true);
    setStaffActionError("");
    setStaffActionSuccess("");

    try {
      if (staffModalMode === "CREATE") {
        if (!staffEmailInput.trim() || !staffUsernameInput.trim() || !staffPasswordInput.trim()) {
          setStaffActionError("Email, username, and initial password are required.");
          setIsSubmittingStaff(false);
          return;
        }
        if (staffPasswordInput.length < 8) {
          setStaffActionError("Password must be at least 8 characters long.");
          setIsSubmittingStaff(false);
          return;
        }
        const res = await api.createStaff({
          email: staffEmailInput.trim(),
          username: staffUsernameInput.trim(),
          role: staffRoleInput,
          password: staffPasswordInput,
          phone: staffPhoneInput.trim() || undefined,
          department: staffDepartmentInput.trim() || undefined,
          assignedUnitId: staffUnitIdInput !== "" ? Number(staffUnitIdInput) : null,
        });
        setStaffList((prev) => [res.staff, ...prev]);
        setStaffActionSuccess(res.message);
        setStaffModalMode(null);
      } else if (staffModalMode === "EDIT" && selectedStaff) {
        const res = await api.updateStaff(selectedStaff.id, {
          username: staffUsernameInput.trim(),
          role: staffRoleInput,
          phone: staffPhoneInput.trim() || undefined,
          department: staffDepartmentInput.trim() || undefined,
          assignedUnitId: staffUnitIdInput !== "" ? Number(staffUnitIdInput) : null,
        });
        setStaffList((prev) =>
          prev.map((s) => (s.id === selectedStaff.id ? { ...s, ...res.staff } : s))
        );
        setStaffActionSuccess(res.message);
        setStaffModalMode(null);
      } else if (staffModalMode === "RESET_PASSWORD" && selectedStaff) {
        if (!staffResetPasswordInput || staffResetPasswordInput.length < 8) {
          setStaffActionError("New password must be at least 8 characters long.");
          setIsSubmittingStaff(false);
          return;
        }
        const res = await api.resetStaffPassword(selectedStaff.id, staffResetPasswordInput);
        setStaffActionSuccess(res.message);
        setStaffModalMode(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Staff management operation failed";
      setStaffActionError(msg);
    } finally {
      setIsSubmittingStaff(false);
    }
  }

  if (isLoading && !stats) {
    return (
      <div className="placeholder">
        <Activity size={32} className="spin-icon" style={{ color: "#3b5bcc" }} />
        <p>Loading {userRole.toLowerCase()} command dashboard...</p>
      </div>
    );
  }

  // ==============================================================================
  // VIEW 1: HOUSEKEEPING COMMAND CENTER
  // ==============================================================================
  if (userRole === "HOUSEKEEPING") {
    const pendingTasks = cleaningTasks.filter((t) => t.status === "PENDING");
    const inProgressTasks = cleaningTasks.filter((t) => t.status === "IN_PROGRESS");
    const completedTasks = cleaningTasks.filter((t) => t.status === "COMPLETED");
    const overdueCount = cleaningTasks.filter((t) => t.is_overdue && t.status !== "COMPLETED").length;

    return (
      <div className="dashboard-container">
        {/* Header bar */}
        <div className="page-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h2>ICU Environmental Services & Turnover Command</h2>
              <span className="demo-badge" style={{ backgroundColor: "#8b60b520", color: "#8b60b5" }}>
                HOUSEKEEPING WORKSPACE
              </span>
            </div>
            <p className="page-subtitle">
              Terminal decontaminations, bed turnover queues, and operational sanitization clearance
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {overdueCount > 0 && (
              <div className="header-warning-badge">
                <ShieldAlert size={16} />
                <span>{overdueCount} Overdue Turnover(s)</span>
              </div>
            )}
            <button
              type="button"
              className="action-link-btn primary"
              onClick={() => navigate("/app/turnover")}
            >
              <Sparkles size={16} />
              <span>Full Turnover Board</span>
            </button>
          </div>
        </div>

        {/* Feedback Banners */}
        {successMessage && (
          <div className="success-banner" role="status">
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
            <button type="button" className="close-banner-btn" onClick={() => setSuccessMessage("")}>
              ×
            </button>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button type="button" className="close-banner-btn" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}

        {/* Housekeeping Specific KPI Cards */}
        <div className="kpi-grid">
          <div className="kpi-card card-cleaning">
            <div className="kpi-header">
              <span className="kpi-title">PENDING TURNOVER</span>
              <Clock size={18} style={{ color: "#d97706" }} />
            </div>
            <div className="kpi-value">{pendingTasks.length}</div>
            <div className="kpi-footer">Beds waiting for housekeeping pickup</div>
          </div>

          <div className="kpi-card card-occupied">
            <div className="kpi-header">
              <span className="kpi-title">IN PROGRESS CLEANING</span>
              <Sparkles size={18} style={{ color: "#3b5bcc" }} />
            </div>
            <div className="kpi-value">{inProgressTasks.length}</div>
            <div className="kpi-footer">Active sanitizations underway</div>
          </div>

          <div className="kpi-card card-available">
            <div className="kpi-header">
              <span className="kpi-title">COMPLETED TURNOVERS</span>
              <CheckCircle2 size={18} style={{ color: "#10b981" }} />
            </div>
            <div className="kpi-value">{completedTasks.length}</div>
            <div className="kpi-footer">Beds sanitized & returned to available</div>
          </div>

          <div className={`kpi-card ${overdueCount > 0 ? "card-maintenance" : ""}`}>
            <div className="kpi-header">
              <span className="kpi-title">OVERDUE TURNOVER ALERTS</span>
              <ShieldAlert size={18} style={{ color: overdueCount > 0 ? "#e11d48" : "#64748b" }} />
            </div>
            <div className="kpi-value" style={{ color: overdueCount > 0 ? "#e11d48" : "inherit" }}>
              {overdueCount}
            </div>
            <div className="kpi-footer">Exceeding standard turnaround SLA</div>
          </div>
        </div>

        {/* Embedded Interactive Cleaning Kanban Board */}
        <div className="section-card" style={{ marginTop: "24px" }}>
          <div className="section-card-header">
            <div>
              <h3>Active Turnover Queues & Fast Action Controls</h3>
              <p className="section-subtitle">
                Housekeeping workflow: Pick up pending tasks, track active sanitizations, and complete clearance
              </p>
            </div>
          </div>

          <div className="kanban-grid">
            {/* Column 1: Pending */}
            <div className="kanban-column column-pending">
              <div className="column-header">
                <div className="column-title">
                  <span className="dot dot-pending" />
                  <h4>Pending Sanitization</h4>
                </div>
                <span className="task-count-pill">{pendingTasks.length}</span>
              </div>
              <div className="task-list">
                {pendingTasks.length === 0 ? (
                  <div className="kanban-empty">No beds waiting in queue.</div>
                ) : (
                  pendingTasks.map((task) => (
                    <div key={task.id} className={`task-card ${task.is_overdue ? "task-overdue" : ""}`}>
                      <div className="task-card-header">
                        <strong>{task.bed_number}</strong>
                        <span className={`task-type-badge type-${task.task_type.toLowerCase()}`}>
                          {task.task_type}
                        </span>
                      </div>
                      <div className="task-unit-name">{task.unit_name}</div>
                      {task.is_isolation && (
                        <div className="task-isolation-alert">
                          <AlertTriangle size={12} /> Airborne Isolation Protocol Required
                        </div>
                      )}
                      <div className="task-meta-row">
                        <span className="task-time-label">
                          <Clock size={13} /> Queued: {task.elapsed_minutes}m ago
                        </span>
                        {task.is_overdue && <span className="overdue-tag">OVERDUE</span>}
                      </div>
                      <button
                        type="button"
                        className="btn-start-task"
                        onClick={() => handleStartCleaning(task.id)}
                        disabled={processingTaskId === task.id}
                      >
                        <Play size={14} />
                        <span>{processingTaskId === task.id ? "Starting..." : "Start Cleaning"}</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Column 2: In Progress */}
            <div className="kanban-column column-inprogress">
              <div className="column-header">
                <div className="column-title">
                  <span className="dot dot-inprogress" />
                  <h4>In Progress Cleaning</h4>
                </div>
                <span className="task-count-pill">{inProgressTasks.length}</span>
              </div>
              <div className="task-list">
                {inProgressTasks.length === 0 ? (
                  <div className="kanban-empty">No active sanitizations currently running.</div>
                ) : (
                  inProgressTasks.map((task) => (
                    <div key={task.id} className={`task-card ${task.is_overdue ? "task-overdue" : ""}`}>
                      <div className="task-card-header">
                        <strong>{task.bed_number}</strong>
                        <span className={`task-type-badge type-${task.task_type.toLowerCase()}`}>
                          {task.task_type}
                        </span>
                      </div>
                      <div className="task-unit-name">{task.unit_name}</div>
                      {(task.assigned_user_name || task.assigned_user_email) && (
                        <div className="task-assigned">Housekeeper: <strong>{task.assigned_user_name || "Assigned Housekeeper"}</strong></div>
                      )}
                      <div className="task-meta-row">
                        <span className="task-time-label">
                          <Clock size={13} /> Active for: {task.elapsed_minutes}m
                        </span>
                        {task.is_overdue && <span className="overdue-tag">OVERDUE</span>}
                      </div>
                      <button
                        type="button"
                        className="btn-complete-task"
                        onClick={() => handleCompleteCleaning(task.id)}
                        disabled={processingTaskId === task.id}
                      >
                        <CheckCircle2 size={14} />
                        <span>{processingTaskId === task.id ? "Completing..." : "Complete & Mark Available"}</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Column 3: Completed */}
            <div className="kanban-column column-completed">
              <div className="column-header">
                <div className="column-title">
                  <span className="dot dot-completed" />
                  <h4>Completed Clearance</h4>
                </div>
                <span className="task-count-pill">{completedTasks.length}</span>
              </div>
              <div className="task-list">
                {completedTasks.length === 0 ? (
                  <div className="kanban-empty">No completed tasks yet.</div>
                ) : (
                  completedTasks.slice(0, 10).map((task) => (
                    <div key={task.id} className="task-card task-card-completed">
                      <div className="task-card-header">
                        <strong>{task.bed_number}</strong>
                        <span className="status-badge status-available">AVAILABLE</span>
                      </div>
                      <div className="task-unit-name">{task.unit_name}</div>
                      <div className="task-meta-row">
                        <span className="task-time-label">{task.task_type} Clean Completed</span>
                        {task.completion_time && (
                          <span className="text-muted" style={{ fontSize: "11px" }}>
                            {new Date(task.completion_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==============================================================================
  // VIEW 2: DOCTOR CLINICAL DASHBOARD
  // ==============================================================================
  if (userRole === "DOCTOR") {
    return (
      <div className="dashboard-container">
        {/* Header bar */}
        <div className="page-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h2>Physician Clinical Dashboard</h2>
              <span className="demo-badge" style={{ backgroundColor: "#0d948820", color: "#0d9488" }}>
                ATTENDING PHYSICIAN
              </span>
            </div>
            <p className="page-subtitle">
              Monitor ICU unit capacity, manage assigned inpatients, and execute authorized clinical admissions and discharges
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              className="action-link-btn primary"
              onClick={() => navigate("/app/readiness")}
            >
              <TrendingUp size={16} />
              <span>Readiness Intelligence</span>
            </button>
          </div>
        </div>

        {/* Feedback Banners */}
        {successMessage && (
          <div className="success-banner" role="status">
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
            <button type="button" className="close-banner-btn" onClick={() => setSuccessMessage("")}>
              ×
            </button>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button type="button" className="close-banner-btn" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}

        {/* Section 1: Unit-Level Bed Summary Table */}
        <div className="section-card" style={{ marginTop: "16px" }}>
          <div className="section-card-header">
            <div>
              <h3>Unit-Level Bed Summary</h3>
              <p className="section-subtitle">
                Real-time database census across all configured intensive care units
              </p>
            </div>
            <span className="text-muted" style={{ fontSize: "12px", fontWeight: 500 }}>
              {units.length} Configured Units
            </span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ICU Unit</th>
                  <th style={{ textAlign: "center" }}>Occupied</th>
                  <th style={{ textAlign: "center" }}>Available</th>
                  <th style={{ textAlign: "center" }}>Maintenance</th>
                  <th style={{ textAlign: "center" }}>Total Beds</th>
                  <th style={{ textAlign: "right" }}>Occupancy Rate</th>
                </tr>
              </thead>
              <tbody>
                {unitSummaries.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: u.available > 0 ? "#10b981" : "#e11d48",
                          }}
                        />
                        <strong>{u.name}</strong>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="summary-count-badge badge-occupied">
                        {u.occupied}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="summary-count-badge badge-available">
                        {u.available}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="summary-count-badge badge-maintenance">
                        {u.maintenance}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <strong>{u.total}</strong>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <div
                          style={{
                            width: "50px",
                            height: "6px",
                            backgroundColor: "#e2e8f0",
                            borderRadius: "3px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(u.occRate, 100)}%`,
                              height: "100%",
                              backgroundColor:
                                u.occRate > 85 ? "#e11d48" : u.occRate > 60 ? "#d97706" : "#3b5bcc",
                            }}
                          />
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#475569" }}>
                          {u.occRate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: "#f8fafc", fontWeight: 600 }}>
                  <td>Overall ICU Census</td>
                  <td style={{ textAlign: "center" }}>
                    <span className="summary-count-badge badge-occupied">
                      {totalSummary.occupied}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span className="summary-count-badge badge-available">
                      {totalSummary.available}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span className="summary-count-badge badge-maintenance">
                      {totalSummary.maintenance}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <strong>{totalSummary.total}</strong>
                  </td>
                  <td style={{ textAlign: "right", color: "#1e293b" }}>
                    {totalSummary.occRate}% Occupied
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Section 2: Doctor-Specific Visual Beds (My Patients) */}
        <div className="section-card" id="my-patients" style={{ marginTop: "24px" }}>
          <div className="section-card-header">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Stethoscope size={20} style={{ color: "#0d9488" }} />
                <h3>My Patients (Assigned Inpatient Beds)</h3>
              </div>
              <p className="section-subtitle">
                Visual clinical beds containing patients assigned to your attending care. Click any bed to view and update clinical condition.
              </p>
            </div>
            <span className="text-muted" style={{ fontSize: "12px", fontWeight: 600 }}>
              {doctorAssignedBeds.length} Active {doctorAssignedBeds.length === 1 ? "Patient" : "Patients"}
            </span>
          </div>

          {doctorAssignedBeds.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px 20px" }}>
              <UserCheck size={36} style={{ color: "#94a3b8", marginBottom: "10px" }} />
              <h4 style={{ margin: "0 0 6px 0", color: "#334155" }}>No Active Patients Assigned</h4>
              <p style={{ margin: 0, color: "#64748b", fontSize: "13px", maxWidth: "480px" }}>
                You do not currently have any active inpatient admissions assigned to your physician account. Use the Bed Management table below to admit a patient to an available bed.
              </p>
            </div>
          ) : (
            <div
              className="doctor-beds-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "16px",
                marginTop: "8px",
              }}
            >
              {doctorAssignedBeds.map((bed) => {
                const adm = admissions.find((a) => a.bed_id === bed.id && a.status === "ADMITTED");
                const currentCondition = adm?.condition || bed.patient_condition || "Stable under observation";
                const patientName = adm?.patient_name || bed.current_patient_ref || "Patient";
                const patientRef = adm?.patient_ref || bed.current_patient_ref || "PT-INP";

                return (
                  <div
                    key={bed.id}
                    className="doctor-patient-card"
                    onClick={() => openPatientDetailsDrawer(bed)}
                    role="button"
                    tabIndex={0}
                    style={{
                      border: "1px solid #cbd5e1",
                      borderRadius: "10px",
                      padding: "16px",
                      backgroundColor: "#ffffff",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openPatientDetailsDrawer(bed);
                      }
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <BedDouble size={18} style={{ color: "#0d9488" }} />
                          <strong style={{ fontSize: "16px", color: "#0f172a" }}>{bed.bed_number}</strong>
                        </div>
                        <span style={{ fontSize: "12px", color: "#64748b" }}>{bed.unit_name}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                        <span className="status-badge status-occupied">
                          OCCUPIED
                        </span>
                        {bed.is_isolation && (
                          <span className="isolation-pill" style={{ fontSize: "10px", padding: "2px 6px" }}>
                            Airborne Isolation
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                        <UserCheck size={14} style={{ color: "#3b5bcc" }} />
                        <span style={{ fontWeight: 600, color: "#1e293b", fontSize: "14px" }}>
                          {patientName}
                        </span>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>({patientRef})</span>
                      </div>

                      <div style={{ marginTop: "6px" }}>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#64748b",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            marginBottom: "2px",
                          }}
                        >
                          Condition:
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: 500,
                            color: currentCondition.toLowerCase().includes("critical")
                              ? "#b91c1c"
                              : currentCondition.toLowerCase().includes("guarded")
                              ? "#b45309"
                              : currentCondition.toLowerCase().includes("improving")
                              ? "#047857"
                              : "#0369a1",
                            backgroundColor: currentCondition.toLowerCase().includes("critical")
                              ? "#fef2f2"
                              : currentCondition.toLowerCase().includes("guarded")
                              ? "#fffbeb"
                              : currentCondition.toLowerCase().includes("improving")
                              ? "#ecfdf5"
                              : "#f0f9ff",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            display: "inline-block",
                            border: "1px solid currentColor",
                            opacity: 0.95,
                          }}
                        >
                          {currentCondition}
                        </div>
                      </div>

                      {adm?.admission_time && (
                        <div
                          style={{
                            marginTop: "8px",
                            fontSize: "11px",
                            color: "#64748b",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Clock size={12} />
                          <span>
                            Admitted:{" "}
                            {new Date(adm.admission_time).toLocaleString([], {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: "auto",
                        paddingTop: "8px",
                        borderTop: "1px dashed #e2e8f0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: "11px", color: "#0d9488", fontWeight: 600 }}>
                        Click to view & edit chart →
                      </span>
                      <button
                        type="button"
                        className="btn-table-action"
                        style={{
                          padding: "4px 8px",
                          fontSize: "11px",
                          border: "1px solid #cbd5e1",
                          background: "#f8fafc",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openPatientDetailsDrawer(bed);
                        }}
                      >
                        Patient Chart
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 2.5: Experimental Length of Stay (LOS) ML Prediction Panel */}
        <LosPredictionPanel
          userRole={userRole}
          currentUser={currentUser}
          beds={beds}
          admissions={admissions}
          doctorAssignedBeds={doctorAssignedBeds}
          selectedBedId={selectedPatientBed?.id}
          onPredictionSuccess={() => {
            loadRoleDashboardData();
          }}
        />

        {/* Section 3: Bed Management Table */}
        <div className="section-card" id="bed-management" style={{ marginTop: "24px" }}>
          <div className="section-card-header">
            <div>
              <h3>Bed Management</h3>
              <p className="section-subtitle">
                Unit inventory, heuristic readiness predictions, and authorized physician clinical workflows
              </p>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="controls-card" style={{ marginBottom: "16px", padding: "12px 16px" }}>
            <div className="search-box" style={{ flex: 1, minWidth: "260px" }}>
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search by Bed Number, Patient, Doctor, Cleaner, or Unit..."
                value={tableSearchQuery}
                onChange={(e) => setTableSearchQuery(e.target.value)}
                className="search-input"
              />
              {tableSearchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setTableSearchQuery("")}
                  aria-label="Clear search query"
                >
                  ×
                </button>
              )}
            </div>

            <div className="filters-row" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <select
                value={tableUnitFilter}
                onChange={(e) => setTableUnitFilter(e.target.value)}
                className="filter-select"
              >
                <option value="ALL">All Units</option>
                {units.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.name}
                  </option>
                ))}
              </select>

              <select
                value={tableStatusFilter}
                onChange={(e) => setTableStatusFilter(e.target.value)}
                className="filter-select"
              >
                <option value="ALL">All Statuses</option>
                <option value="AVAILABLE">Available</option>
                <option value="OCCUPIED">Occupied</option>
                <option value="CLEANING">Cleaning</option>
                <option value="RESERVED">Reserved</option>
                <option value="MAINTENANCE">Maintenance</option>
              </select>

              {(tableSearchQuery || tableUnitFilter !== "ALL" || tableStatusFilter !== "ALL") && (
                <button
                  type="button"
                  className="btn-table-action-sm"
                  onClick={() => {
                    setTableSearchQuery("");
                    setTableUnitFilter("ALL");
                    setTableStatusFilter("ALL");
                  }}
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>

          {/* 7-Column Bed Management Table */}
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bed Number</th>
                  <th>Status</th>
                  <th>Patient Name</th>
                  <th>Doctor Assigned</th>
                  <th>Cleaner Name</th>
                  <th>Predicted Free Time</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableFilteredBeds.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                      No beds match the selected filters or search query.
                    </td>
                  </tr>
                ) : (
                  tableFilteredBeds.map((bed) => (
                    <tr key={bed.id}>
                      {/* 1. Bed Number */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <BedDouble size={14} style={{ color: "#475569" }} />
                          <strong>{bed.bed_number}</strong>
                        </div>
                        <div style={{ display: "flex", gap: "4px", marginTop: "2px", alignItems: "center" }}>
                          <span className="text-muted" style={{ fontSize: "11px" }}>{bed.unit_name}</span>
                          {bed.is_isolation && (
                            <span className="isolation-pill" style={{ fontSize: "10px", padding: "1px 5px" }}>
                              Isolation
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Status */}
                      <td>
                        <span className={`status-badge status-${bed.status.toLowerCase()}`}>
                          {bed.status}
                        </span>
                      </td>

                      {/* 3. Patient Name */}
                      <td>
                        {renderBedPatientName(bed)}
                      </td>

                      {/* 4. Doctor Assigned */}
                      <td>
                        {renderBedDoctorAssigned(bed)}
                      </td>

                      {/* 5. Cleaner Name */}
                      <td>
                        {renderBedCleanerName(bed)}
                      </td>

                      {/* 6. Predicted Free Time */}
                      <td>
                        {renderPredictedFreeTime(bed)}
                      </td>

                      {/* 7. Actions */}
                      <td style={{ textAlign: "right" }}>
                        {renderDoctorBedActions(bed)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Patient Details Drawer */}
        {renderPatientDrawer()}

        {/* Modal Action Forms */}
        {renderActionModals()}

        {/* Admission Confirmation Modal */}
        {renderConfirmationModal()}
      </div>
    );
  }

  // ==============================================================================
  // VIEW 3: NURSE OPERATIONAL DASHBOARD
  // ==============================================================================
  if (userRole === "NURSE") {
    const bedsAwaitingCleaning = cleaningTasks.filter((t) => t.status === "PENDING");
    const bedsInCleaning = cleaningTasks.filter((t) => t.status === "IN_PROGRESS");
    const reservedBeds = beds.filter((b) => b.status === "RESERVED");
    const maintenanceBeds = beds.filter((b) => b.status === "MAINTENANCE");

    return (
      <div className="dashboard-container">
        {/* Header bar */}
        <div className="page-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <h2>Nursing Station & Bed Readiness Operations</h2>
              <span className="demo-badge" style={{ backgroundColor: "#d17a3720", color: "#d17a37" }}>
                NURSE WORKSPACE
              </span>
              {currentUser?.assigned_unit_name && (
                <span className="demo-badge" style={{ backgroundColor: "#0284c720", color: "#0284c7", fontWeight: 700 }}>
                  Assigned Unit: {currentUser.assigned_unit_name}
                </span>
              )}
            </div>
            <p className="page-subtitle">
              Bed status monitoring, hold reservations, maintenance workflows, and readiness turnaround
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              className="action-link-btn"
              onClick={() => navigate("/app/readiness")}
            >
              <TrendingUp size={16} />
              <span>Bed Readiness</span>
            </button>
            <button
              type="button"
              className="action-link-btn primary"
              onClick={() => navigate("/app/beds")}
            >
              <BedDouble size={16} />
              <span>Manage All Beds</span>
            </button>
          </div>
        </div>

        {/* Feedback Banners */}
        {successMessage && (
          <div className="success-banner" role="status">
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
            <button type="button" className="close-banner-btn" onClick={() => setSuccessMessage("")}>
              ×
            </button>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button type="button" className="close-banner-btn" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}

        {/* Nurse Specific KPI Cards */}
        <div className="kpi-grid">
          <div className="kpi-card card-available">
            <div className="kpi-header">
              <span className="kpi-title">AVAILABLE BEDS</span>
              <CheckCircle2 size={18} style={{ color: "#10b981" }} />
            </div>
            <div className="kpi-value">{stats?.availableBeds ?? 0}</div>
            <div className="kpi-footer">Vacant for intake</div>
          </div>

          <div className="kpi-card card-reserved">
            <div className="kpi-header">
              <span className="kpi-title">RESERVED HOLDS</span>
              <Clock size={18} style={{ color: "#d97706" }} />
            </div>
            <div className="kpi-value">{reservedBeds.length}</div>
            <div className="kpi-footer">Held for incoming transfers</div>
          </div>

          <div className="kpi-card card-cleaning">
            <div className="kpi-header">
              <span className="kpi-title">AWAITING CLEANING</span>
              <Sparkles size={18} style={{ color: "#8b60b5" }} />
            </div>
            <div className="kpi-value">{bedsAwaitingCleaning.length}</div>
            <div className="kpi-footer">Discharged; queued for turnover</div>
          </div>

          <div className="kpi-card card-occupied">
            <div className="kpi-header">
              <span className="kpi-title">NEARING READINESS</span>
              <CheckCircle2 size={18} style={{ color: "#3b5bcc" }} />
            </div>
            <div className="kpi-value">{bedsInCleaning.length}</div>
            <div className="kpi-footer">Active sanitization underway</div>
          </div>

          <div className="kpi-card card-maintenance">
            <div className="kpi-header">
              <span className="kpi-title">MAINTENANCE</span>
              <Wrench size={18} style={{ color: "#e11d48" }} />
            </div>
            <div className="kpi-value">{maintenanceBeds.length}</div>
            <div className="kpi-footer">Biomedical repair / calibration</div>
          </div>
        </div>

        {/* Section: Monitored Patient Beds (Occupied Inpatient Census) */}
        <div className="section-card" id="patient-beds" style={{ marginTop: "24px" }}>
          <div className="section-card-header">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <HeartPulse size={20} style={{ color: "#ea580c" }} />
                <h3>Monitored Patient Beds (Inpatient Census)</h3>
              </div>
              <p className="section-subtitle">
                Active clinical inpatients under nursing surveillance. Execute authorized discharges, transfers, and cleaner assignments.
              </p>
            </div>
            <span className="text-muted" style={{ fontSize: "12px", fontWeight: 600 }}>
              {beds.filter((b) => b.status === "OCCUPIED").length} Occupied Beds
            </span>
          </div>

          {beds.filter((b) => b.status === "OCCUPIED").length === 0 ? (
            <div className="empty-state" style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
              <BedDouble size={36} style={{ color: "#94a3b8", marginBottom: "8px" }} />
              <h4 style={{ margin: "0 0 4px 0", color: "#334155" }}>No Occupied Beds</h4>
              <p style={{ margin: 0, fontSize: "13px" }}>All beds are currently available, reserved, cleaning, or in maintenance.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bed Number</th>
                    <th>ICU Unit</th>
                    <th>Patient Name</th>
                    <th>Condition & Notes</th>
                    <th>Attending Physician</th>
                    <th>Admission Time</th>
                    <th style={{ textAlign: "right" }}>Nursing Operations</th>
                  </tr>
                </thead>
                <tbody>
                  {beds
                    .filter((b) => b.status === "OCCUPIED")
                    .map((bed) => {
                      const adm = admissions.find((a) => a.bed_id === bed.id && a.status === "ADMITTED");
                      return (
                        <tr key={bed.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <BedDouble size={15} style={{ color: "#ea580c" }} />
                              <strong>{bed.bed_number}</strong>
                              {bed.is_isolation && <span className="isolation-pill">ISO</span>}
                            </div>
                          </td>
                          <td>{bed.unit_name}</td>
                          <td>
                            <div style={{ fontWeight: 600, color: "#0f172a" }}>
                              {bed.patient_name || adm?.patient_name || "Name unavailable"}
                            </div>
                            {(bed.current_patient_ref || adm?.patient_ref) && (
                              <span className="code-pill" style={{ fontSize: "11px", marginTop: "2px", display: "inline-block" }}>
                                {bed.current_patient_ref || adm?.patient_ref}
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>
                              {bed.patient_condition || adm?.condition || "Stable observation"}
                            </div>
                            {(bed.admission_notes || adm?.notes) && (
                              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                                {bed.admission_notes || adm?.notes}
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "#0f766e" }}>
                              {bed.assigned_doctor_name || adm?.admitting_doctor_name || "Unassigned"}
                            </div>
                          </td>
                          <td style={{ fontSize: "12px", color: "#475569" }}>
                            {adm?.admission_time
                              ? new Date(adm.admission_time).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                              : bed.admission_time
                              ? new Date(bed.admission_time).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                              : "Active stay"}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                className="btn-table-action-sm"
                                style={{ borderColor: "#7c3aed", color: "#7c3aed" }}
                                onClick={() => openDischargeModal(bed)}
                                title="Discharge patient and queue turnover decontamination"
                              >
                                <UserMinus size={13} /> Discharge
                              </button>
                              <button
                                type="button"
                                className="btn-table-action-sm"
                                style={{ borderColor: "#0284c7", color: "#0284c7" }}
                                onClick={() => openTransferModal(bed)}
                                title="Transfer patient to another bed"
                              >
                                <ArrowRightLeft size={13} /> Transfer
                              </button>
                              <button
                                type="button"
                                className="btn-table-action-sm"
                                style={{ borderColor: "#9333ea", color: "#9333ea" }}
                                onClick={() => openAssignCleanerModal(bed)}
                                title="Assign cleaner for post-discharge turnover"
                              >
                                <Brush size={13} /> Cleaner
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 1: Beds Awaiting Turnover & Nearing Readiness */}
        <div className="dashboard-two-col-grid" style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {/* Queued Turnovers */}
          <div className="section-card">
            <div className="section-card-header">
              <div>
                <h3>Beds Awaiting Turnover</h3>
                <p className="section-subtitle">Queued for housekeeping dispatch</p>
              </div>
              <span className="task-count-pill">{bedsAwaitingCleaning.length}</span>
            </div>
            {bedsAwaitingCleaning.length === 0 ? (
              <div className="kanban-empty">No beds waiting for cleaning.</div>
            ) : (
              <div className="table-responsive">
                <table className="data-table" style={{ fontSize: "12px" }}>
                  <thead>
                    <tr>
                      <th>Bed</th>
                      <th>Protocol</th>
                      <th>Queue Wait</th>
                      <th>Isolation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bedsAwaitingCleaning.map((t) => (
                      <tr key={t.id}>
                        <td><strong>{t.bed_number}</strong></td>
                        <td>
                          <span className={`task-type-badge type-${t.task_type.toLowerCase()}`}>
                            {t.task_type}
                          </span>
                        </td>
                        <td>{t.elapsed_minutes}m</td>
                        <td>{t.is_isolation ? <span className="isolation-pill">ISO</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Active Cleanings Nearing Readiness */}
          <div className="section-card">
            <div className="section-card-header">
              <div>
                <h3>Beds Nearing Readiness</h3>
                <p className="section-subtitle">Active cleaning in progress</p>
              </div>
              <span className="task-count-pill">{bedsInCleaning.length}</span>
            </div>
            {bedsInCleaning.length === 0 ? (
              <div className="kanban-empty">No beds actively in progress.</div>
            ) : (
              <div className="table-responsive">
                <table className="data-table" style={{ fontSize: "12px" }}>
                  <thead>
                    <tr>
                      <th>Bed</th>
                      <th>Protocol</th>
                      <th>Active Time</th>
                      <th>Housekeeper</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bedsInCleaning.map((t) => (
                      <tr key={t.id}>
                        <td><strong>{t.bed_number}</strong></td>
                        <td>
                          <span className={`task-type-badge type-${t.task_type.toLowerCase()}`}>
                            {t.task_type}
                          </span>
                        </td>
                        <td>{t.elapsed_minutes}m</td>
                        <td className="text-muted">{t.assigned_user_email?.split("@")[0] || "Active"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Section: Unit-wise Bed Summary Table */}
        <div className="section-card" style={{ marginTop: "24px" }}>
          <div className="section-card-header">
            <div>
              <h3>Unit-wise Bed Summary</h3>
              <p className="section-subtitle">Real-time bed counts across all configured ICU units</p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit Name</th>
                  <th style={{ textAlign: "center" }}>Available</th>
                  <th style={{ textAlign: "center" }}>Occupied</th>
                  <th style={{ textAlign: "center" }}>Cleaning</th>
                  <th style={{ textAlign: "center" }}>Total</th>
                  <th>Occupancy Rate</th>
                </tr>
              </thead>
              <tbody>
                {unitSummaries.map((unit) => (
                  <tr key={unit.id}>
                    <td><strong>{unit.name}</strong></td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ color: "#16a34a", fontWeight: 700 }}>{unit.available}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ color: "#2563eb", fontWeight: 700 }}>{unit.occupied}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ color: "#9333ea", fontWeight: 700 }}>{unit.cleaning}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <strong>{unit.total}</strong>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div className="occupancy-bar-container" style={{ width: "90px", height: "6px" }}>
                          <div className="occupancy-bar-fill" style={{ width: `${unit.occRate}%` }} />
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: 600 }}>{unit.occRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {/* Summary Total Row */}
                <tr className="summary-total-row">
                  <td><strong>Total All Units</strong></td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ color: "#16a34a", fontWeight: 800 }}>{totalSummary.available}</span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ color: "#2563eb", fontWeight: 800 }}>{totalSummary.occupied}</span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ color: "#9333ea", fontWeight: 800 }}>{totalSummary.cleaning}</span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ fontWeight: 800 }}>{totalSummary.total}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="occupancy-bar-container" style={{ width: "90px", height: "8px" }}>
                        <div className="occupancy-bar-fill" style={{ width: `${totalSummary.occRate}%` }} />
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: 800 }}>{totalSummary.occRate}%</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Action Forms */}
        {renderActionModals()}
      </div>
    );
  }

  // ==============================================================================
  // VIEW 4: ADMINISTRATOR HOSPITAL-WIDE COMMAND DASHBOARD
  // ==============================================================================

  // Prediction cell renderer: Uses consistent stored admission prediction & estimated free time
  function renderPredictionCell(bed: Bed) {
    return renderPredictedFreeTime(bed);
  }

  // State-appropriate table action buttons
  function renderBedTableActions(b: Bed) {
    if (b.status === "AVAILABLE") {
      return (
        <div className="table-action-group">
          <button
            type="button"
            className="btn-table-action-sm"
            style={{ borderColor: "#2563eb", color: "#2563eb" }}
            onClick={() => openAdmitModal(b)}
            title="Admit patient to bed"
          >
            <UserPlus size={13} /> Admit
          </button>
          <button
            type="button"
            className="btn-table-action-sm"
            style={{ borderColor: "#d97706", color: "#d97706" }}
            onClick={() => openReserveModal(b)}
            title="Reserve bed for transfer"
          >
            Reserve
          </button>
          <button
            type="button"
            className="btn-table-action-sm"
            style={{ borderColor: "#e11d48", color: "#e11d48" }}
            onClick={() => openMaintenanceModal(b)}
            title="Place in maintenance"
          >
            <Wrench size={13} /> Maintenance
          </button>
        </div>
      );
    }

    if (b.status === "OCCUPIED") {
      return (
        <div className="table-action-group">
          <button
            type="button"
            className="btn-table-action-sm"
            style={{ borderColor: "#7c3aed", color: "#7c3aed" }}
            onClick={() => openDischargeModal(b)}
            title="Discharge patient and queue turnover"
          >
            <UserMinus size={13} /> Discharge
          </button>
          <button
            type="button"
            className="btn-table-action-sm"
            style={{ borderColor: "#0284c7", color: "#0284c7" }}
            onClick={() => openTransferModal(b)}
            title="Transfer patient to another bed"
          >
            <ArrowRightLeft size={13} /> Transfer
          </button>
        </div>
      );
    }

    if (b.status === "CLEANING") {
      return (
        <div className="table-action-group">
          <button
            type="button"
            className="btn-table-action-sm"
            style={{ borderColor: "#9333ea", color: "#9333ea" }}
            onClick={() => openAssignCleanerModal(b)}
            title="Assign housekeeper to turnover task"
          >
            <Brush size={13} /> Assign Cleaner
          </button>
        </div>
      );
    }

    if (b.status === "RESERVED") {
      return (
        <div className="table-action-group">
          <button
            type="button"
            className="btn-table-action-sm"
            style={{ borderColor: "#2563eb", color: "#2563eb" }}
            onClick={() => openAdmitModal(b)}
            title="Admit patient into reserved bed"
          >
            <UserPlus size={13} /> Admit Patient
          </button>
          <button
            type="button"
            className="btn-table-action-sm"
            style={{ borderColor: "#d97706", color: "#d97706" }}
            onClick={() => handleReleaseReservation(b.id)}
            title="Release reservation hold"
          >
            Release Hold
          </button>
        </div>
      );
    }

    if (b.status === "MAINTENANCE") {
      return (
        <div className="table-action-group">
          <button
            type="button"
            className="btn-table-action-sm"
            style={{ borderColor: "#16a34a", color: "#16a34a" }}
            onClick={() => openCompleteMaintenanceModal(b)}
            title="Complete maintenance and return to service"
          >
            <Check size={13} /> Complete
          </button>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="dashboard-container">
      {/* Header bar */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2>ICU Executive Command & Resource Administration</h2>
            <span className="demo-badge" style={{ backgroundColor: "#3b5bcc20", color: "#3b5bcc" }}>
              ADMINISTRATOR
            </span>
          </div>
          <p className="page-subtitle">
            Hospital-wide resource distribution, occupancy analytics, unit provisioning, and scenario configuration
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          {/* Quick Scenario Switcher */}
          {readinessConfig && (
            <div className="scenario-pill" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="scenario-dot" />
              <span>Scenario: <strong>{readinessConfig.scenario}</strong></span>
              <select
                value={readinessConfig.scenario}
                onChange={(e) => handleSwitchScenario(e.target.value as any)}
                disabled={isUpdatingScenario}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <option value="Normal">Normal</option>
                <option value="Busy">Busy (+2 Demand)</option>
                <option value="Surge">Surge (+5 Demand)</option>
              </select>
            </div>
          )}

          <button
            type="button"
            className="action-link-btn"
            style={{ backgroundColor: "#0d9488", color: "#ffffff", borderColor: "#0d9488", fontWeight: 700 }}
            onClick={() => openAdmitModal()}
            id="quick-admit-btn"
          >
            <UserPlus size={16} />
            <span>Admit Patient</span>
          </button>

          <button
            type="button"
            className="action-link-btn primary"
            onClick={() => navigate("/app/admin")}
          >
            <Settings size={16} />
            <span>Unit & Bed Setup</span>
          </button>
        </div>
      </div>

      {/* Feedback Banners */}
      {successMessage && (
        <div className="success-banner" role="status">
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
          <button type="button" className="close-banner-btn" onClick={() => setSuccessMessage("")}>
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button type="button" className="close-banner-btn" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}

      {/* Section 0: Administrator Patient Admission Command */}
      <div className="section-card" id="admin-patient-intake" style={{ marginBottom: "24px" }}>
        <div className="section-card-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <UserPlus size={20} style={{ color: "#0d9488" }} />
              <h3>Inpatient Clinical Admission & Bed Allocation</h3>
            </div>
            <p className="section-subtitle">
              Intake new emergency or scheduled admissions, assign attending physicians, and compute real-time LOS estimates
            </p>
          </div>
          <button
            type="button"
            className="action-link-btn"
            style={{ backgroundColor: "#0d9488", color: "#ffffff", borderColor: "#0d9488", fontWeight: 700 }}
            onClick={() => openAdmitModal()}
            id="admit-new-patient-btn"
          >
            <UserPlus size={16} />
            <span>Admit New Patient</span>
          </button>
        </div>

        {/* Operational Status Badges */}
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "12px", padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Available Beds:</span>
            <span style={{ fontWeight: 700, color: "#16a34a", fontSize: "13px" }}>
              {totalSummary.available} Ready for Intake
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Active Physicians:</span>
            <span style={{ fontWeight: 700, color: "#0f766e", fontSize: "13px" }}>
              {activeDoctors.length} On Duty
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Overall Occupancy:</span>
            <span style={{ fontWeight: 700, color: "#2563eb", fontSize: "13px" }}>
              {totalSummary.occRate}%
            </span>
          </div>
        </div>
      </div>

      {/* Section 1: Unit-wise Bed Summary Table */}
      <div className="section-card">
        <div className="section-card-header">
          <div>
            <h3>Unit-wise Bed Summary</h3>
            <p className="section-subtitle">Real-time bed counts across all configured ICU units</p>
          </div>
          <button
            type="button"
            className="action-link-btn"
            onClick={() => navigate("/app/admin")}
          >
            <Settings size={14} /> Configure Units
          </button>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Unit Name</th>
                <th style={{ textAlign: "center" }}>Available</th>
                <th style={{ textAlign: "center" }}>Occupied</th>
                <th style={{ textAlign: "center" }}>Cleaning</th>
                <th style={{ textAlign: "center" }}>Total</th>
                <th>Occupancy Rate</th>
              </tr>
            </thead>
            <tbody>
              {unitSummaries.map((unit) => (
                <tr key={unit.id}>
                  <td><strong>{unit.name}</strong></td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ color: "#16a34a", fontWeight: 700 }}>{unit.available}</span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ color: "#2563eb", fontWeight: 700 }}>{unit.occupied}</span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ color: "#9333ea", fontWeight: 700 }}>{unit.cleaning}</span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <strong>{unit.total}</strong>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="occupancy-bar-container" style={{ width: "90px", height: "6px" }}>
                        <div className="occupancy-bar-fill" style={{ width: `${unit.occRate}%` }} />
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: 600 }}>{unit.occRate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {/* Summary Total Row */}
              <tr className="summary-total-row">
                <td><strong>Total All Units</strong></td>
                <td style={{ textAlign: "center" }}>
                  <span style={{ color: "#16a34a", fontWeight: 800 }}>{totalSummary.available}</span>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span style={{ color: "#2563eb", fontWeight: 800 }}>{totalSummary.occupied}</span>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span style={{ color: "#9333ea", fontWeight: 800 }}>{totalSummary.cleaning}</span>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span style={{ fontWeight: 800 }}>{totalSummary.total}</span>
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div className="occupancy-bar-container" style={{ width: "90px", height: "8px" }}>
                      <div className="occupancy-bar-fill" style={{ width: `${totalSummary.occRate}%` }} />
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: 800 }}>{totalSummary.occRate}%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Visual Beds Section with Unit Tabs */}
      <div className="section-card" style={{ marginTop: "24px" }}>
        <div className="section-card-header">
          <div>
            <h3>Visual Beds</h3>
            <p className="section-subtitle">Departmental floor view with unit tabs and real-time state actions</p>
          </div>
        </div>

        {/* Unit Tabs for All, MICU, SICU, CVICU, Pedia ICU */}
        <div className="unit-tabs-wrapper" role="tablist" aria-label="ICU Unit Tabs">
          <button
            type="button"
            role="tab"
            aria-selected={visualUnitTab === "ALL"}
            className={`unit-tab-btn ${visualUnitTab === "ALL" ? "active" : ""}`}
            onClick={() => setVisualUnitTab("ALL")}
          >
            <span>All Units</span>
            <span className="unit-tab-count">{beds.length}</span>
          </button>
          {units.map((u) => {
            const count = beds.filter((b) => b.unit_id === u.id).length;
            const isTabActive = visualUnitTab === String(u.id);
            return (
              <button
                key={u.id}
                type="button"
                role="tab"
                aria-selected={isTabActive}
                className={`unit-tab-btn ${isTabActive ? "active" : ""}`}
                onClick={() => setVisualUnitTab(String(u.id))}
              >
                <span>{u.name}</span>
                <span className="unit-tab-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Visual Bed Cards Grid */}
        <div className="visual-beds-grid">
          {visualBeds.map((bed) => {
            const statusClass = `status-${bed.status.toLowerCase()}`;
            return (
              <div key={bed.id} className={`visual-bed-card ${statusClass}`}>
                <div className="visual-bed-header">
                  <span className="visual-bed-num">{bed.bed_number}</span>
                  {bed.is_isolation && <span className="isolation-pill">ISO</span>}
                </div>

                <div className="visual-bed-unit-sub">{bed.unit_name}</div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className={`status-badge ${statusClass}`}>{bed.status}</span>
                </div>

                <div className="visual-bed-meta">
                  {bed.status === "OCCUPIED" && (
                    <>
                      <div>Patient: <strong>{bed.current_patient_ref || "Admitted"}</strong></div>
                      {bed.assigned_doctor_name && (
                        <div>Dr: <strong>{bed.assigned_doctor_name}</strong></div>
                      )}
                    </>
                  )}
                  {bed.status === "CLEANING" && (
                    <>
                      <div>Turnover: <strong>{bed.cleaning_task_type || "STANDARD"}</strong></div>
                      <div>Cleaner: <strong>{bed.assigned_cleaner_name || "Unassigned"}</strong></div>
                    </>
                  )}
                  {bed.status === "RESERVED" && (
                    <div>Reserved: <strong>{bed.current_patient_ref || "Transfer hold"}</strong></div>
                  )}
                  {bed.status === "MAINTENANCE" && (
                    <div>Biomedical servicing / repair</div>
                  )}
                  {bed.status === "AVAILABLE" && (
                    <div style={{ color: "#16a34a", fontWeight: 600 }}>Ready now · Sanitized</div>
                  )}
                </div>

                {/* State-appropriate Quick Action */}
                {bed.status === "AVAILABLE" && (
                  <button
                    type="button"
                    className="visual-bed-action-btn"
                    onClick={() => openAdmitModal(bed)}
                  >
                    <UserPlus size={13} /> Admit Patient
                  </button>
                )}
                {bed.status === "OCCUPIED" && (
                  <button
                    type="button"
                    className="visual-bed-action-btn"
                    onClick={() => openDischargeModal(bed)}
                  >
                    <UserMinus size={13} /> Discharge
                  </button>
                )}
                {bed.status === "CLEANING" && (
                  <button
                    type="button"
                    className="visual-bed-action-btn"
                    onClick={() => openAssignCleanerModal(bed)}
                  >
                    <Brush size={13} /> Assign Cleaner
                  </button>
                )}
                {bed.status === "RESERVED" && (
                  <button
                    type="button"
                    className="visual-bed-action-btn"
                    onClick={() => openAdmitModal(bed)}
                  >
                    <UserPlus size={13} /> Admit Patient
                  </button>
                )}
                {bed.status === "MAINTENANCE" && (
                  <button
                    type="button"
                    className="visual-bed-action-btn"
                    onClick={() => openCompleteMaintenanceModal(bed)}
                  >
                    <Check size={13} /> Complete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3: Bed Management Table */}
      <div className="section-card" id="bed-management" style={{ marginTop: "24px" }}>
        <div className="section-card-header">
          <div>
            <h3>Bed Management</h3>
            <p className="section-subtitle">
              Live operational inventory, heuristic turnover predictions, and state-appropriate clinical workflows
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="controls-card" style={{ marginBottom: "16px", padding: "12px 16px" }}>
          <div className="search-box" style={{ flex: 1, minWidth: "260px" }}>
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search by Bed Number, Patient, Doctor, or Cleaner..."
              value={tableSearchQuery}
              onChange={(e) => setTableSearchQuery(e.target.value)}
              className="search-input"
            />
            {tableSearchQuery && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setTableSearchQuery("")}
                aria-label="Clear search query"
              >
                ×
              </button>
            )}
          </div>

          <div className="filters-row" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <select
              value={tableUnitFilter}
              onChange={(e) => setTableUnitFilter(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Units</option>
              {units.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.name}</option>
              ))}
            </select>

            <select
              value={tableStatusFilter}
              onChange={(e) => setTableStatusFilter(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="OCCUPIED">Occupied</option>
              <option value="CLEANING">Cleaning</option>
              <option value="RESERVED">Reserved</option>
              <option value="MAINTENANCE">Maintenance</option>
            </select>

            {(tableSearchQuery || tableUnitFilter !== "ALL" || tableStatusFilter !== "ALL") && (
              <button
                type="button"
                className="btn-table-action-sm"
                onClick={() => {
                  setTableSearchQuery("");
                  setTableUnitFilter("ALL");
                  setTableStatusFilter("ALL");
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* 7-Column Bed Management Table */}
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bed Number</th>
                <th>Status</th>
                <th>Patient Name</th>
                <th>Doctor Assigned</th>
                <th>Cleaner Name</th>
                <th>Predicted Free Time</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableFilteredBeds.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                    No beds match the selected filters or search query.
                  </td>
                </tr>
              ) : (
                tableFilteredBeds.map((bed) => (
                  <tr key={bed.id}>
                    {/* 1. Bed Number */}
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <strong>{bed.bed_number}</strong>
                        {bed.is_isolation && <span className="isolation-pill">ISO</span>}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>{bed.unit_name}</div>
                    </td>

                    {/* 2. Status */}
                    <td>
                      <span className={`status-badge status-${bed.status.toLowerCase()}`}>
                        {bed.status}
                      </span>
                    </td>

                    {/* 3. Patient Name */}
                    <td>
                      {bed.patient_name ? (
                        <div>
                          <div style={{ fontWeight: 600 }}>{bed.patient_name}</div>
                          {bed.current_patient_ref && (
                            <span className="code-pill" style={{ fontSize: "11px", marginTop: "2px", display: "inline-block" }}>
                              {bed.current_patient_ref}
                            </span>
                          )}
                        </div>
                      ) : bed.current_patient_ref ? (
                        <div>
                          <div style={{ fontStyle: "italic", color: "#64748b", fontSize: "12px" }}>Name unavailable</div>
                          <span className="code-pill" style={{ fontSize: "11px", marginTop: "2px", display: "inline-block" }}>
                            {bed.current_patient_ref}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>

                    {/* 4. Doctor Assigned */}
                    <td>
                      {bed.assigned_doctor_name ? (
                        <div style={{ fontWeight: 600 }}>{bed.assigned_doctor_name}</div>
                      ) : (
                        <span className="text-muted" style={{ fontStyle: "italic" }}>Unassigned</span>
                      )}
                    </td>

                    {/* 5. Cleaner Name */}
                    <td>
                      {renderBedCleanerName(bed)}
                    </td>

                    {/* 6. Predicted Free Time */}
                    <td>
                      {renderPredictionCell(bed)}
                    </td>

                    {/* 7. Actions */}
                    <td style={{ textAlign: "right" }}>
                      {renderBedTableActions(bed)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Prediction Methodology Notice */}
        <div style={{ padding: "12px 16px", backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0", fontSize: "11px", color: "#64748b" }}>
          Operational readiness estimates are computed using heuristic projections from clinical admissions, scheduled discharges, and calibrated turnover targets (45m standard / 75m deep clean). No black-box machine learning claims.
        </div>
      </div>

      {/* Section 3.5: Experimental Length of Stay (LOS) ML Prediction Panel */}
      <LosPredictionPanel
        userRole={userRole}
        currentUser={currentUser}
        beds={beds}
        admissions={admissions}
        onPredictionSuccess={() => {
          loadRoleDashboardData();
        }}
      />

      {/* Section 4: Staff Management (Hospital Staff Directory & Security Administration) */}
      <div className="section-card" id="staff-management" style={{ marginTop: "24px" }}>
        <div className="section-card-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Users size={20} style={{ color: "#3b5bcc" }} />
              <h3>Hospital Staff Directory & Account Administration</h3>
            </div>
            <p className="section-subtitle">
              Provision authorized staff accounts, assign ICU units and departments, manage account active status, and securely reset credentials
            </p>
          </div>
          <button
            type="button"
            className="action-link-btn primary"
            onClick={openCreateStaffModal}
          >
            <UserPlus size={16} />
            <span>Add Staff Member</span>
          </button>
        </div>

        {/* Staff Action Feedback Banners */}
        {staffActionSuccess && (
          <div className="success-banner" role="status" style={{ margin: "16px 0 0 0" }}>
            <CheckCircle2 size={16} />
            <span>{staffActionSuccess}</span>
            <button type="button" className="close-banner-btn" onClick={() => setStaffActionSuccess("")}>×</button>
          </div>
        )}
        {staffActionError && (
          <div className="error-banner" role="alert" style={{ margin: "16px 0 0 0" }}>
            <AlertTriangle size={16} />
            <span>{staffActionError}</span>
            <button type="button" className="close-banner-btn" onClick={() => setStaffActionError("")}>×</button>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="controls-card" style={{ marginTop: "16px", marginBottom: "16px", padding: "12px 16px" }}>
          <div className="search-box" style={{ flex: 1, minWidth: "260px" }}>
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search staff by name, email, department, or unit..."
              value={staffSearchQuery}
              onChange={(e) => setStaffSearchQuery(e.target.value)}
              className="search-input"
            />
            {staffSearchQuery && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setStaffSearchQuery("")}
                aria-label="Clear staff search query"
              >
                ×
              </button>
            )}
          </div>

          <div className="filters-row" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <select
              value={staffRoleFilter}
              onChange={(e) => setStaffRoleFilter(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Roles</option>
              <option value="ADMIN">Administrators</option>
              <option value="DOCTOR">Physicians / Doctors</option>
              <option value="NURSE">Nurses</option>
              <option value="HOUSEKEEPING">Housekeeping</option>
            </select>

            {(staffSearchQuery || staffRoleFilter !== "ALL") && (
              <button
                type="button"
                className="btn-table-action-sm"
                onClick={() => {
                  setStaffSearchQuery("");
                  setStaffRoleFilter("ALL");
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Staff Table */}
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Staff Member</th>
                <th>Role</th>
                <th>Department & Contact</th>
                <th>Assigned ICU Unit</th>
                <th>Account Status</th>
                <th style={{ textAlign: "right" }}>Account Management</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                    No staff members match the selected role or search filter.
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff) => {
                  const roleColors: Record<UserRole, { color: string; bg: string }> = {
                    ADMIN: { color: "#2563eb", bg: "#eff6ff" },
                    DOCTOR: { color: "#0d9488", bg: "#f0fdfa" },
                    NURSE: { color: "#ea580c", bg: "#fff7ed" },
                    HOUSEKEEPING: { color: "#7e22ce", bg: "#faf5ff" },
                  };
                  const roleTheme = roleColors[staff.role] || roleColors.ADMIN;

                  return (
                    <tr key={staff.id}>
                      {/* 1. Staff Member */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              backgroundColor: roleTheme.bg,
                              color: roleTheme.color,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "12px",
                              border: `1px solid ${roleTheme.color}30`,
                            }}
                          >
                            {(staff.username || staff.email).slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <strong>{staff.username || "Staff User"}</strong>
                            <div style={{ fontSize: "11px", color: "#64748b" }}>{staff.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Role */}
                      <td>
                        <span
                          className="role-pill"
                          style={{
                            color: roleTheme.color,
                            backgroundColor: roleTheme.bg,
                            border: `1px solid ${roleTheme.color}40`,
                            fontSize: "11px",
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {staff.role}
                        </span>
                      </td>

                      {/* 3. Department & Contact */}
                      <td>
                        <div style={{ fontSize: "13px", color: "#1e293b", fontWeight: 500 }}>
                          {staff.department || "General Hospital Staff"}
                        </div>
                        {staff.phone && (
                          <div style={{ fontSize: "11px", color: "#64748b" }}>{staff.phone}</div>
                        )}
                      </td>

                      {/* 4. Assigned Unit */}
                      <td>
                        {staff.assigned_unit_name ? (
                          <span style={{ fontWeight: 600, color: "#0f766e", fontSize: "13px" }}>
                            {staff.assigned_unit_name}
                          </span>
                        ) : (
                          <span className="text-muted" style={{ fontSize: "12px" }}>Hospital-wide</span>
                        )}
                      </td>

                      {/* 5. Account Status */}
                      <td>
                        {staff.active !== false ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "2px 8px",
                              borderRadius: "12px",
                              fontSize: "11px",
                              fontWeight: 700,
                              backgroundColor: "#dcfce7",
                              color: "#15803d",
                              border: "1px solid #bbf7d0",
                            }}
                          >
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#22c55e" }} />
                            ACTIVE
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "2px 8px",
                              borderRadius: "12px",
                              fontSize: "11px",
                              fontWeight: 700,
                              backgroundColor: "#fee2e2",
                              color: "#b91c1c",
                              border: "1px solid #fecaca",
                            }}
                          >
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#ef4444" }} />
                            INACTIVE
                          </span>
                        )}
                      </td>

                      {/* 6. Actions */}
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="btn-table-action-sm"
                            style={{ borderColor: "#0284c7", color: "#0284c7" }}
                            onClick={() => openEditStaffModal(staff)}
                            title="Edit staff details and assignments"
                          >
                            <Edit3 size={13} /> Edit
                          </button>

                          <button
                            type="button"
                            className="btn-table-action-sm"
                            style={{ borderColor: "#d97706", color: "#d97706" }}
                            onClick={() => openResetPasswordModal(staff)}
                            title="Reset password securely"
                          >
                            <Key size={13} /> Reset Pass
                          </button>

                          {staff.active !== false ? (
                            <button
                              type="button"
                              className="btn-table-action-sm"
                              style={{ borderColor: "#e11d48", color: "#e11d48" }}
                              onClick={() => handleToggleStaffStatus(staff)}
                              title="Deactivate account access"
                            >
                              <UserX size={13} /> Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-table-action-sm"
                              style={{ borderColor: "#16a34a", color: "#16a34a" }}
                              onClick={() => handleToggleStaffStatus(staff)}
                              title="Reactivate staff account"
                            >
                              <CheckCircle2 size={13} /> Activate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Modals */}
      {renderActionModals()}

      {/* Staff Management Modals */}
      {renderStaffModals()}

      {/* Admission Confirmation Modal */}
      {renderConfirmationModal()}
    </div>
  );

  // Helper renderer for action modals
  function renderActionModals() {
    if (!activeModal || (!targetBed && activeModal !== "ADMIT")) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-content" style={{ maxWidth: activeModal === "ADMIT" ? "640px" : "520px" }}>
          <div className="modal-header">
            <h3>
              {activeModal === "ADMIT" && (targetBed ? `Admit Patient — Bed ${targetBed.bed_number}` : "Admit New Patient — Clinical Intake & Bed Assignment")}
              {activeModal === "DISCHARGE" && `Discharge Patient — Bed ${targetBed?.bed_number}`}
              {activeModal === "RESERVE" && `Reserve Bed ${targetBed?.bed_number}`}
              {activeModal === "MAINTENANCE" && `Place Bed ${targetBed?.bed_number} in Maintenance`}
              {activeModal === "COMPLETE_MAINTENANCE" && `Complete Maintenance — Bed ${targetBed?.bed_number}`}
              {activeModal === "TRANSFER" && `Transfer Patient from Bed ${targetBed?.bed_number}`}
              {activeModal === "ASSIGN_CLEANER" && `Assign Cleaner — Bed ${targetBed?.bed_number}`}
            </h3>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => {
                setActiveModal(null);
                setTargetBed(null);
              }}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleModalSubmit}>
            <div className="modal-body">
              {actionError && (
                <div className="error-banner" role="alert" style={{ marginBottom: "16px" }}>
                  <AlertTriangle size={16} />
                  <span>{actionError}</span>
                </div>
              )}

              {/* ADMIT FORM */}
              {activeModal === "ADMIT" && (
                <>
                  {/* Server Timestamping Notice */}
                  <div style={{ padding: "10px 14px", backgroundColor: "#f0fdfa", border: "1px solid #ccfbf1", borderRadius: "6px", fontSize: "12px", color: "#0f766e", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Clock size={16} />
                    <span>Server timestamping active: High-precision admission date & time will be recorded upon confirmation.</span>
                  </div>

                  {/* Bed & Unit Assignment */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label htmlFor="admitUnitSelect">
                        ICU Unit <span style={{ color: "#e11d48" }}>*</span>
                      </label>
                      {targetBed ? (
                        <input
                          id="admitUnitSelect"
                          type="text"
                          className="form-input"
                          value={targetBed.unit_name}
                          disabled
                          style={{ backgroundColor: "#f8fafc", color: "#334155", fontWeight: 600 }}
                        />
                      ) : (
                        <select
                          id="admitUnitSelect"
                          className="form-input"
                          value={admitUnitIdInput}
                          onChange={(e) => {
                            const newUnitId = e.target.value ? Number(e.target.value) : "";
                            setAdmitUnitIdInput(newUnitId);
                            const avail = beds.find((b) => b.status === "AVAILABLE" && (!newUnitId || b.unit_id === newUnitId));
                            setAdmitBedIdInput(avail ? avail.id : "");
                          }}
                          required
                        >
                          <option value="">-- Select ICU Unit --</option>
                          {units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="form-group">
                      <label htmlFor="admitBedSelect">
                        Available Bed Number <span style={{ color: "#e11d48" }}>*</span>
                      </label>
                      {targetBed ? (
                        <input
                          id="admitBedSelect"
                          type="text"
                          className="form-input"
                          value={`Bed ${targetBed.bed_number} (${targetBed.is_isolation ? "Airborne Isolation" : "Standard"})`}
                          disabled
                          style={{ backgroundColor: "#f8fafc", color: "#0d9488", fontWeight: 700 }}
                        />
                      ) : (
                        <select
                          id="admitBedSelect"
                          className="form-input"
                          value={admitBedIdInput}
                          onChange={(e) => setAdmitBedIdInput(e.target.value ? Number(e.target.value) : "")}
                          required
                          disabled={availableBedsForUnit.length === 0}
                        >
                          {availableBedsForUnit.length === 0 ? (
                            <option value="">No available beds in this unit</option>
                          ) : (
                            <>
                              <option value="">-- Select Available Bed ({availableBedsForUnit.length} ready) --</option>
                              {availableBedsForUnit.map((b) => (
                                <option key={b.id} value={b.id}>
                                  Bed {b.bed_number} ({b.unit_name}{b.is_isolation ? " · Airborne Isolation" : " · Standard"})
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      )}
                    </div>
                  </div>

                  {!targetBed && availableBedsForUnit.length === 0 && (
                    <div style={{ fontSize: "12px", color: "#b91c1c", backgroundColor: "#fef2f2", padding: "8px 12px", borderRadius: "6px", marginBottom: "16px", border: "1px solid #fecaca" }}>
                      No beds are currently AVAILABLE in the selected ICU unit. Please select another unit or await housekeeping turnover clearance.
                    </div>
                  )}

                  {/* Patient Details */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label htmlFor="patientName">
                        Patient Full Name <span style={{ color: "#e11d48" }}>*</span>
                      </label>
                      <input
                        id="patientName"
                        type="text"
                        className="form-input"
                        value={patientNameInput}
                        onChange={(e) => setPatientNameInput(e.target.value)}
                        placeholder="e.g. Eleanor Vance"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="patientRef">
                        Patient Reference / MRN <span style={{ color: "#e11d48" }}>*</span>
                      </label>
                      <input
                        id="patientRef"
                        type="text"
                        className="form-input"
                        value={patientRefInput}
                        onChange={(e) => setPatientRefInput(e.target.value)}
                        placeholder="e.g. PT-8421"
                        required
                      />
                    </div>
                  </div>

                  {/* Doctor Assignment */}
                  <div className="form-group">
                    <label htmlFor="assignedDoctor">
                      Attending Physician <span style={{ color: "#e11d48" }}>*</span>
                    </label>
                    {userRole === "DOCTOR" ? (
                      <input
                        id="assignedDoctor"
                        type="text"
                        className="form-input"
                        value={`Dr. ${currentUser?.username || currentUser?.email} (Attending Physician)`}
                        disabled
                        style={{ backgroundColor: "#f8fafc", color: "#0f766e", fontWeight: 600 }}
                      />
                    ) : (
                      <select
                        id="assignedDoctor"
                        className="form-input"
                        value={doctorIdInput}
                        onChange={(e) => setDoctorIdInput(e.target.value ? Number(e.target.value) : "")}
                        required
                      >
                        <option value="">-- Select Active Attending Doctor --</option>
                        {activeDoctors.map((doc) => (
                          <option key={doc.id} value={doc.id}>
                            Dr. {doc.username || doc.email} ({doc.department || doc.role})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Clinical Details */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label htmlFor="condition">
                        Patient Condition & Acuity <span style={{ color: "#e11d48" }}>*</span>
                      </label>
                      <select
                        id="condition"
                        className="form-input"
                        value={conditionInput}
                        onChange={(e) => setConditionInput(e.target.value)}
                        required
                      >
                        <option value="stable">Stable</option>
                        <option value="improving">Improving</option>
                        <option value="moderate">Moderate</option>
                        <option value="critical">Critical</option>
                        <option value="uncertain">Uncertain</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="procedureType">Procedure Type (Experimental LOS)</label>
                      <select
                        id="procedureType"
                        className="form-input"
                        value={procedureTypeInput}
                        onChange={(e) => setProcedureTypeInput(e.target.value)}
                      >
                        <option value="">-- Select Procedure Type (Optional) --</option>
                        <option value="angiography">Angiography</option>
                        <option value="angioplasty">Angioplasty</option>
                        <option value="arrhythmia">Arrhythmia Management</option>
                        <option value="cardiac_surgery">Cardiac Surgery</option>
                        <option value="general_surgery">General Surgery</option>
                        <option value="kidney_injury">Acute Kidney Injury</option>
                        <option value="observation">Clinical Observation</option>
                        <option value="pneumonia">Pneumonia</option>
                        <option value="respiratory_distress">Respiratory Distress</option>
                        <option value="sepsis">Sepsis</option>
                        <option value="stroke">Stroke</option>
                        <option value="trauma">Trauma Care</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="diagnosis">Diagnosis / Reason for Admission</label>
                    <input
                      id="diagnosis"
                      type="text"
                      className="form-input"
                      value={diagnosisInput}
                      onChange={(e) => setDiagnosisInput(e.target.value)}
                      placeholder="e.g. Acute respiratory failure, Post-CABG recovery"
                    />
                  </div>

                  {/* Model Parameters Row: Admission Type, Complications, Age Group */}
                  <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label htmlFor="admissionType">Admission Type</label>
                      <select
                        id="admissionType"
                        className="form-input"
                        value={admissionTypeInput}
                        onChange={(e) => setAdmissionTypeInput(e.target.value)}
                      >
                        <option value="planned">Planned</option>
                        <option value="urgent">Urgent</option>
                        <option value="emergency">Emergency</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="complications">Complications</label>
                      <select
                        id="complications"
                        className="form-input"
                        value={complicationsInput}
                        onChange={(e) => setComplicationsInput(e.target.value)}
                      >
                        <option value="none">None</option>
                        <option value="present">Present</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="ageGroup">Age Group</label>
                      <select
                        id="ageGroup"
                        className="form-input"
                        value={ageGroupInput}
                        onChange={(e) => setAgeGroupInput(e.target.value)}
                      >
                        <option value="adult">Adult (18-64)</option>
                        <option value="child">Child (&lt;18)</option>
                        <option value="older_adult">Older Adult (65+)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="expDischargeHours">Expected Stay Duration (Hours)</label>
                    <input
                      id="expDischargeHours"
                      type="number"
                      min={1}
                      max={720}
                      className="form-input"
                      value={expectedDischargeHoursInput}
                      onChange={(e) => setExpectedDischargeHoursInput(Number(e.target.value))}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="admissionNotes">Clinical Admission / Triage Notes</label>
                    <textarea
                      id="admissionNotes"
                      className="form-textarea"
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="Initial clinical triage and monitoring instructions..."
                      rows={3}
                    />
                  </div>
                </>
              )}

              {/* RESERVE FORM */}
              {activeModal === "RESERVE" && (
                <>
                  <div className="form-group">
                    <label htmlFor="resRef">Patient / Reservation Reference</label>
                    <input
                      id="resRef"
                      type="text"
                      className="form-input"
                      value={patientRefInput}
                      onChange={(e) => setPatientRefInput(e.target.value)}
                      placeholder="e.g. PT-RES-882 or incoming patient name"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="plannedTime">Planned Admission Time</label>
                    <input
                      id="plannedTime"
                      type="datetime-local"
                      className="form-input"
                      value={plannedAdmissionTimeInput}
                      onChange={(e) => setPlannedAdmissionTimeInput(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="resDoc">Assigned Doctor (If known)</label>
                    <select
                      id="resDoc"
                      className="form-input"
                      value={doctorIdInput}
                      onChange={(e) => setDoctorIdInput(e.target.value ? Number(e.target.value) : "")}
                    >
                      <option value="">-- Attending Doctor (Optional) --</option>
                      {availableDoctors.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          Dr. {doc.username || doc.email} ({doc.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="reserveNotes">Reservation Notes</label>
                    <textarea
                      id="reserveNotes"
                      className="form-textarea"
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="e.g. Held for incoming transfer from Emergency Department..."
                      rows={3}
                    />
                  </div>
                </>
              )}

              {/* MAINTENANCE FORM */}
              {activeModal === "MAINTENANCE" && (
                <>
                  <div className="form-group">
                    <label htmlFor="maintReason">Maintenance / Servicing Reason</label>
                    <input
                      id="maintReason"
                      type="text"
                      className="form-input"
                      value={maintenanceReasonInput}
                      onChange={(e) => setMaintenanceReasonInput(e.target.value)}
                      placeholder="e.g. Ventilator calibration / biomedical electrical inspection"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="staffMember">Responsible Staff Member / Technician</label>
                    <input
                      id="staffMember"
                      type="text"
                      className="form-input"
                      value={staffMemberInput}
                      onChange={(e) => setStaffMemberInput(e.target.value)}
                      placeholder="e.g. John Doe (Biomedical Engineering)"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="maintStartTime">Start Time</label>
                    <input
                      id="maintStartTime"
                      type="datetime-local"
                      className="form-input"
                      value={admissionTimeInput}
                      onChange={(e) => setAdmissionTimeInput(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="maintNotes">Maintenance Notes</label>
                    <textarea
                      id="maintNotes"
                      className="form-textarea"
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="Work order details or required sensor replacements..."
                      rows={3}
                    />
                  </div>
                </>
              )}

              {/* TRANSFER FORM */}
              {activeModal === "TRANSFER" && targetBed && (
                <>
                  <p style={{ fontSize: "13px", color: "#475569", marginBottom: "16px" }}>
                    Transferring patient <strong>{targetBed.current_patient_ref}</strong> from <strong>Bed {targetBed.bed_number}</strong> ({targetBed.unit_name}). The vacated bed will automatically transition to <strong>CLEANING</strong> for turnover.
                  </p>

                  <div className="form-group">
                    <label htmlFor="destBed">Destination Bed</label>
                    <select
                      id="destBed"
                      className="form-input"
                      value={destinationBedIdInput}
                      onChange={(e) => setDestinationBedIdInput(Number(e.target.value))}
                      required
                    >
                      <option value="">-- Select Destination Bed --</option>
                      {beds
                        .filter((b) => b.id !== targetBed.id && (b.status === "AVAILABLE" || b.status === "RESERVED"))
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.bed_number} — {b.unit_name} ({b.status}{b.is_isolation ? " · Isolation" : ""})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="transferReason">Reason for Transfer</label>
                    <input
                      id="transferReason"
                      type="text"
                      className="form-input"
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="e.g. Clinical step-down / specialized cardiac monitoring"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="transferTime">Transfer Time</label>
                    <input
                      id="transferTime"
                      type="datetime-local"
                      className="form-input"
                      value={transferTimeInput}
                      onChange={(e) => setTransferTimeInput(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              {/* DISCHARGE FORM */}
              {activeModal === "DISCHARGE" && targetBed && (
                <>
                  <p style={{ fontSize: "13px", color: "#475569", marginBottom: "16px" }}>
                    Confirm discharge of patient <strong>{targetBed.current_patient_ref}</strong> from <strong>Bed {targetBed.bed_number}</strong>. This ends the active clinical admission and transitions the bed to <strong>CLEANING</strong>.
                  </p>

                  <div className="form-group">
                    <label htmlFor="cleanType">Turnover Decontamination Protocol</label>
                    <select
                      id="cleanType"
                      className="form-input"
                      value={cleaningTypeInput}
                      onChange={(e) => setCleaningTypeInput(e.target.value as any)}
                    >
                      <option value="STANDARD">Standard Turnover Sanitization (45m baseline)</option>
                      <option value="DEEP">Terminal Deep Disinfection (75m baseline - mandatory for isolation)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="dischargeNotes">Discharge & Turnover Notes</label>
                    <textarea
                      id="dischargeNotes"
                      className="form-textarea"
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="e.g. Patient cleared by physician for step-down transfer..."
                      rows={3}
                    />
                  </div>
                </>
              )}

              {/* ASSIGN CLEANER FORM */}
              {activeModal === "ASSIGN_CLEANER" && targetBed && (
                <>
                  <p style={{ fontSize: "13px", color: "#475569", marginBottom: "16px" }}>
                    Assign a housekeeper to turnover decontamination for <strong>Bed {targetBed.bed_number}</strong> ({targetBed.unit_name}).
                  </p>

                  <div className="form-group">
                    <label htmlFor="cleanerSelect">Housekeeper / Cleaner</label>
                    <select
                      id="cleanerSelect"
                      className="form-input"
                      value={cleanerIdInput}
                      onChange={(e) => setCleanerIdInput(e.target.value ? Number(e.target.value) : "")}
                      required
                    >
                      <option value="">-- Select Housekeeper --</option>
                      {availableCleaners.length > 0
                        ? availableCleaners.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.username || c.email} ({c.role})
                            </option>
                          ))
                        : staffList.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.username || c.email} ({c.role})
                            </option>
                          ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="cleanNotes">Cleaning Priority & Notes</label>
                    <textarea
                      id="cleanNotes"
                      className="form-textarea"
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="e.g. Priority turnover for incoming emergency admission..."
                      rows={3}
                    />
                  </div>
                </>
              )}

              {/* COMPLETE MAINTENANCE FORM */}
              {activeModal === "COMPLETE_MAINTENANCE" && targetBed && (
                <>
                  <p style={{ fontSize: "13px", color: "#475569", marginBottom: "16px" }}>
                    Confirm completion of maintenance work for <strong>Bed {targetBed.bed_number}</strong> ({targetBed.unit_name}).
                  </p>
                  <div className="form-group">
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={requiresCleaningInput}
                        onChange={(e) => setRequiresCleaningInput(e.target.checked)}
                      />
                      <span>Schedule turnover sanitization prior to making bed available (Recommended)</span>
                    </label>
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setActiveModal(null);
                  setTargetBed(null);
                }}
                disabled={isSubmittingAction}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isSubmittingAction || (activeModal === "ADMIT" && !targetBed && availableBedsForUnit.length === 0)}
                id={activeModal === "ADMIT" ? "btn-submit-admission" : undefined}
                style={activeModal === "ADMIT" ? { backgroundColor: "#0d9488", borderColor: "#0d9488" } : undefined}
              >
                {isSubmittingAction
                  ? (activeModal === "ADMIT" ? "Admitting Patient..." : "Processing...")
                  : (activeModal === "ADMIT" ? "Complete Admission" : "Confirm Action")}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Admission Confirmation Modal
  function renderConfirmationModal() {
    if (!confirmedAdmission) return null;

    const isPredicted = confirmedAdmission.predictionStatus === "PREDICTED";
    const predFreeTime = confirmedAdmission.predictedFreeTime
      ? new Date(confirmedAdmission.predictedFreeTime).toLocaleString([], {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;
    const admissionTimeFormatted = confirmedAdmission.admissionTime
      ? new Date(confirmedAdmission.admissionTime).toLocaleString([], {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "Server Recorded Timestamp";

    return (
      <div className="modal-overlay" style={{ zIndex: 1100 }}>
        <div className="modal-content" style={{ maxWidth: "580px", border: "1px solid #0d948840" }}>
          <div className="modal-header" style={{ background: "#f0fdfa", borderBottom: "1px solid #ccfbf1" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircle2 size={22} style={{ color: "#0d9488" }} />
              <h3 style={{ color: "#0f766e", margin: 0 }}>Patient Admission Confirmed</h3>
            </div>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setConfirmedAdmission(null)}
              aria-label="Close admission confirmation"
            >
              <X size={18} />
            </button>
          </div>

          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                padding: "12px 16px",
                backgroundColor: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
                color: "#166534",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {confirmedAdmission.message || "Patient successfully admitted and bed updated to OCCUPIED."}
            </div>

            {/* Inpatient Assignment Summary Card */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "16px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <div>
                <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Patient Full Name</span>
                <strong style={{ fontSize: "14px", color: "#0f172a" }}>
                  {confirmedAdmission.patientName || "Admitted Inpatient"}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Patient Reference / MRN</span>
                <span className="code-pill" style={{ fontSize: "12px" }}>
                  {confirmedAdmission.patientRef}
                </span>
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Assigned Bed</span>
                <strong style={{ fontSize: "14px", color: "#0d9488" }}>
                  Bed {confirmedAdmission.bedNumber}
                </strong>
                {confirmedAdmission.icuUnit && (
                  <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>
                    {confirmedAdmission.icuUnit}
                  </span>
                )}
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Attending Physician</span>
                <strong style={{ fontSize: "13px", color: "#1e293b" }}>
                  {confirmedAdmission.assignedDoctorName
                    ? (confirmedAdmission.assignedDoctorName.startsWith("Dr.") ? confirmedAdmission.assignedDoctorName : `Dr. ${confirmedAdmission.assignedDoctorName}`)
                    : `Physician #${confirmedAdmission.admittingDoctorId}`}
                </strong>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Server Admission Timestamp</span>
                <span style={{ fontSize: "12px", color: "#334155", fontWeight: 500 }}>
                  {admissionTimeFormatted}
                </span>
              </div>
            </div>

            {/* Length of Stay & Bed-Free Time Prediction Card */}
            <div
              style={{
                background: isPredicted ? "#f0fdfa" : "#f8fafc",
                border: `1px solid ${isPredicted ? "#99f6e4" : "#e2e8f0"}`,
                borderRadius: "8px",
                padding: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
                  Length of Stay Projection
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "4px",
                    backgroundColor: isPredicted ? "#ccfbf1" : "#e2e8f0",
                    color: isPredicted ? "#0f766e" : "#475569",
                  }}
                >
                  {isPredicted ? "EXPERIMENTAL MODEL" : "HEURISTIC FALLBACK"}
                </span>
              </div>

              {isPredicted ? (
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <span style={{ fontSize: "22px", fontWeight: 800, color: "#0d9488" }}>
                      {confirmedAdmission.predictedLosDays} days
                    </span>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>predicted duration</span>
                  </div>
                  {predFreeTime && (
                    <div style={{ marginTop: "6px", fontSize: "13px", color: "#0f172a", fontWeight: 600 }}>
                      Estimated Bed-Free: Est. {predFreeTime}
                    </div>
                  )}
                  <p style={{ margin: "8px 0 0 0", fontSize: "11px", color: "#64748b", fontStyle: "italic" }}>
                    Experimental — trained on synthetic data; not for clinical decisions.
                  </p>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        padding: "3px 8px",
                        backgroundColor: "#f1f5f9",
                        color: "#475569",
                        borderRadius: "4px",
                        fontWeight: 700,
                        fontSize: "13px",
                      }}
                    >
                      Can't predict
                    </span>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      {confirmedAdmission.predictionReason || "Missing clinical input fields or ML offline"}
                    </span>
                  </div>
                  <p style={{ margin: "8px 0 0 0", fontSize: "11px", color: "#64748b" }}>
                    Admission saved successfully. Standard turnover estimation active.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="action-link-btn primary"
              id="btn-close-admission-modal"
              onClick={() => {
                setConfirmedAdmission(null);
                const tableEl = document.getElementById("bed-management-table") || document.getElementById("bed-management-section");
                if (tableEl) {
                  tableEl.scrollIntoView({ behavior: "smooth" });
                }
              }}
            >
              <span>Close & View in Bed Management</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Helper renderer for staff management modals (Administrator Workspace)
  function renderStaffModals() {
    if (!staffModalMode) return null;

    return (
      <div className="modal-overlay" onClick={() => !isSubmittingStaff && setStaffModalMode(null)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
          <div className="modal-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {staffModalMode === "CREATE" && <Shield size={20} style={{ color: "#3b5bcc" }} />}
              {staffModalMode === "EDIT" && <Edit3 size={20} style={{ color: "#0284c7" }} />}
              {staffModalMode === "RESET_PASSWORD" && <Key size={20} style={{ color: "#d97706" }} />}
              <h3 style={{ margin: 0, fontSize: "16px" }}>
                {staffModalMode === "CREATE" && "Add New Hospital Staff Member"}
                {staffModalMode === "EDIT" && `Edit Staff Profile — ${selectedStaff?.username || selectedStaff?.email}`}
                {staffModalMode === "RESET_PASSWORD" && `Reset Password — ${selectedStaff?.username || selectedStaff?.email}`}
              </h3>
            </div>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => !isSubmittingStaff && setStaffModalMode(null)}
              disabled={isSubmittingStaff}
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmitStaffForm}>
            <div className="modal-body">
              {staffActionError && (
                <div className="error-banner" role="alert" style={{ marginBottom: "14px" }}>
                  <AlertTriangle size={16} />
                  <span>{staffActionError}</span>
                </div>
              )}

              {/* CREATE STAFF MODAL */}
              {staffModalMode === "CREATE" && (
                <>
                  <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "14px", marginTop: 0 }}>
                    Create a new authorized staff account with role-based access permissions.
                  </p>

                  <div className="form-group">
                    <label htmlFor="staffEmail">Staff Email Address</label>
                    <input
                      id="staffEmail"
                      type="email"
                      className="form-input"
                      value={staffEmailInput}
                      onChange={(e) => setStaffEmailInput(e.target.value)}
                      placeholder="e.g. nurse.patel@hospital.org"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="staffUsername">Full Name / Display Username</label>
                    <input
                      id="staffUsername"
                      type="text"
                      className="form-input"
                      value={staffUsernameInput}
                      onChange={(e) => setStaffUsernameInput(e.target.value)}
                      placeholder="e.g. Priya Patel, RN"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="staffRole">Hospital Role & Access Tier</label>
                    <select
                      id="staffRole"
                      className="form-input"
                      value={staffRoleInput}
                      onChange={(e) => setStaffRoleInput(e.target.value as UserRole)}
                      required
                    >
                      <option value="NURSE">Nurse — Inpatient Bed Monitoring & Operational Turnover</option>
                      <option value="DOCTOR">Doctor — Attending Physician Clinical Isolation & Care</option>
                      <option value="HOUSEKEEPING">Housekeeping — Decontamination & Turnover Command</option>
                      <option value="ADMIN">Administrator — Full Hospital System & Unit Setup</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="staffPassword">Initial Account Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="staffPassword"
                        type="password"
                        className="form-input"
                        value={staffPasswordInput}
                        onChange={(e) => setStaffPasswordInput(e.target.value)}
                        placeholder="At least 8 characters..."
                        minLength={8}
                        required
                        style={{ paddingLeft: "36px" }}
                      />
                      <Lock
                        size={15}
                        style={{
                          position: "absolute",
                          left: "12px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "#94a3b8",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label htmlFor="staffDepartment">Department</label>
                      <input
                        id="staffDepartment"
                        type="text"
                        className="form-input"
                        value={staffDepartmentInput}
                        onChange={(e) => setStaffDepartmentInput(e.target.value)}
                        placeholder="e.g. Critical Care Nursing"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="staffPhone">Contact Phone</label>
                      <input
                        id="staffPhone"
                        type="tel"
                        className="form-input"
                        value={staffPhoneInput}
                        onChange={(e) => setStaffPhoneInput(e.target.value)}
                        placeholder="e.g. +1 (555) 019-2831"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="staffAssignedUnit">Primary ICU Unit Assignment</label>
                    <select
                      id="staffAssignedUnit"
                      className="form-input"
                      value={staffUnitIdInput}
                      onChange={(e) => setStaffUnitIdInput(e.target.value ? Number(e.target.value) : "")}
                    >
                      <option value="">Hospital-wide / Unassigned</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.capacity || u.bed_count || 0} Beds)
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* EDIT STAFF MODAL */}
              {staffModalMode === "EDIT" && selectedStaff && (
                <>
                  <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "14px", marginTop: 0 }}>
                    Modify staff profile, role tier, department, and assigned ICU unit.
                  </p>

                  <div className="form-group">
                    <label htmlFor="staffEditEmail">Email Address (Read-only)</label>
                    <input
                      id="staffEditEmail"
                      type="email"
                      className="form-input"
                      value={staffEmailInput}
                      disabled
                      style={{ backgroundColor: "#f1f5f9", cursor: "not-allowed", color: "#64748b" }}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="staffEditUsername">Full Name / Display Username</label>
                    <input
                      id="staffEditUsername"
                      type="text"
                      className="form-input"
                      value={staffUsernameInput}
                      onChange={(e) => setStaffUsernameInput(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="staffEditRole">Hospital Role & Access Tier</label>
                    <select
                      id="staffEditRole"
                      className="form-input"
                      value={staffRoleInput}
                      onChange={(e) => setStaffRoleInput(e.target.value as UserRole)}
                      required
                    >
                      <option value="NURSE">Nurse — Inpatient Bed Monitoring & Operational Turnover</option>
                      <option value="DOCTOR">Doctor — Attending Physician Clinical Isolation & Care</option>
                      <option value="HOUSEKEEPING">Housekeeping — Decontamination & Turnover Command</option>
                      <option value="ADMIN">Administrator — Full Hospital System & Unit Setup</option>
                    </select>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label htmlFor="staffEditDepartment">Department</label>
                      <input
                        id="staffEditDepartment"
                        type="text"
                        className="form-input"
                        value={staffDepartmentInput}
                        onChange={(e) => setStaffDepartmentInput(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="staffEditPhone">Contact Phone</label>
                      <input
                        id="staffEditPhone"
                        type="tel"
                        className="form-input"
                        value={staffPhoneInput}
                        onChange={(e) => setStaffPhoneInput(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="staffEditAssignedUnit">Primary ICU Unit Assignment</label>
                    <select
                      id="staffEditAssignedUnit"
                      className="form-input"
                      value={staffUnitIdInput}
                      onChange={(e) => setStaffUnitIdInput(e.target.value ? Number(e.target.value) : "")}
                    >
                      <option value="">Hospital-wide / Unassigned</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.capacity || u.bed_count || 0} Beds)
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* RESET PASSWORD MODAL */}
              {staffModalMode === "RESET_PASSWORD" && selectedStaff && (
                <>
                  <div
                    style={{
                      padding: "12px",
                      backgroundColor: "#fffbeb",
                      border: "1px solid #fde68a",
                      borderRadius: "8px",
                      marginBottom: "16px",
                      fontSize: "12px",
                      color: "#92400e",
                      lineHeight: 1.5,
                    }}
                  >
                    <strong>Security Reset:</strong> You are resetting the account password for{" "}
                    <strong>{selectedStaff.email}</strong> ({selectedStaff.role}). The user will immediately be required to use this new credential.
                  </div>

                  <div className="form-group">
                    <label htmlFor="staffNewPassword">New Account Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="staffNewPassword"
                        type="password"
                        className="form-input"
                        value={staffResetPasswordInput}
                        onChange={(e) => setStaffResetPasswordInput(e.target.value)}
                        placeholder="Enter new secure password (min 8 characters)..."
                        minLength={8}
                        required
                        style={{ paddingLeft: "36px" }}
                      />
                      <Lock
                        size={15}
                        style={{
                          position: "absolute",
                          left: "12px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "#94a3b8",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", display: "block" }}>
                      Must be at least 8 characters long.
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStaffModalMode(null)}
                disabled={isSubmittingStaff}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmittingStaff}>
                {isSubmittingStaff
                  ? "Processing..."
                  : staffModalMode === "CREATE"
                  ? "Create Staff Member"
                  : staffModalMode === "EDIT"
                  ? "Save Staff Profile"
                  : "Update Password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
};

