import React, { useEffect, useState } from "react";
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
  AlertCircle,
} from "lucide-react";
import type {
  DashboardStats,
  Bed,
  AuditLog,
  IcuUnit,
  CleaningTask,
  Admission,
  ReadinessConfig,
  UserRole,
} from "../types";
import { api } from "../api";

interface DashboardPageProps {
  userRole: UserRole;
  refreshTrigger?: number;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ userRole, refreshTrigger }) => {
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [units, setUnits] = useState<IcuUnit[]>([]);
  const [cleaningTasks, setCleaningTasks] = useState<CleaningTask[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [readinessConfig, setReadinessConfig] = useState<ReadinessConfig | null>(null);

  const [selectedUnit, setSelectedUnit] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Action Modals State (for Doctor & Nurse quick workflows)
  const [activeModal, setActiveModal] = useState<
    "ADMIT" | "DISCHARGE" | "RESERVE" | "MAINTENANCE" | "COMPLETE_MAINTENANCE" | null
  >(null);
  const [targetBed, setTargetBed] = useState<Bed | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string>("");

  // Form Fields
  const [patientRefInput, setPatientRefInput] = useState<string>("");
  const [expectedDischargeHoursInput, setExpectedDischargeHoursInput] = useState<number>(24);
  const [notesInput, setNotesInput] = useState<string>("");
  const [cleaningTypeInput, setCleaningTypeInput] = useState<"STANDARD" | "DEEP">("STANDARD");
  const [requiresCleaningInput, setRequiresCleaningInput] = useState<boolean>(true);

  // Housekeeping task action state
  const [processingTaskId, setProcessingTaskId] = useState<number | null>(null);

  // Admin scenario controls
  const [isUpdatingScenario, setIsUpdatingScenario] = useState<boolean>(false);

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
        // Doctor: beds, active admissions, cleaning tasks (to track post-discharge turnover), stats
        const [statsData, bedsData, unitsData, admissionsData, tasksData] = await Promise.all([
          api.getDashboardStats(),
          api.getBeds(),
          api.getUnits(),
          api.getAdmissions({ status: "ADMITTED" }),
          api.getCleaningTasks(),
        ]);
        setStats(statsData);
        setBeds(bedsData);
        setUnits(unitsData);
        setAdmissions(admissionsData);
        setCleaningTasks(tasksData);
      } else if (userRole === "NURSE") {
        // Nurse: beds, cleaning tasks, active admissions, stats, audit logs
        const [statsData, bedsData, unitsData, tasksData, admissionsData, logsData] = await Promise.all([
          api.getDashboardStats(),
          api.getBeds(),
          api.getUnits(),
          api.getCleaningTasks(),
          api.getAdmissions({ status: "ADMITTED" }),
          api.getAuditLogs(10),
        ]);
        setStats(statsData);
        setBeds(bedsData);
        setUnits(unitsData);
        setCleaningTasks(tasksData);
        setAdmissions(admissionsData);
        setAuditLogs(logsData);
      } else {
        // ADMIN: all data + readiness config
        const [statsData, bedsData, unitsData, tasksData, admissionsData, logsData, configData] =
          await Promise.all([
            api.getDashboardStats(),
            api.getBeds(),
            api.getUnits(),
            api.getCleaningTasks(),
            api.getAdmissions(),
            api.getAuditLogs(12),
            api.getReadinessSettings().catch(() => null),
          ]);
        setStats(statsData);
        setBeds(bedsData);
        setUnits(unitsData);
        setCleaningTasks(tasksData);
        setAdmissions(admissionsData);
        setAuditLogs(logsData);
        setReadinessConfig(configData);
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
  function openAdmitModal(bed: Bed) {
    setTargetBed(bed);
    setPatientRefInput(`PT-${Math.floor(1000 + Math.random() * 9000)}`);
    setExpectedDischargeHoursInput(24);
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
    setNotesInput("");
    setActionError("");
    setActiveModal("RESERVE");
  }

  function openMaintenanceModal(bed: Bed) {
    setTargetBed(bed);
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

  // Submit Modal Actions
  async function handleModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetBed) return;

    setIsSubmittingAction(true);
    setActionError("");

    try {
      if (activeModal === "ADMIT") {
        const expTime = new Date(Date.now() + expectedDischargeHoursInput * 3600 * 1000).toISOString();
        const res = await api.admitPatient(
          targetBed.id,
          patientRefInput.trim().toUpperCase(),
          expTime,
          notesInput.trim() || undefined
        );
        setSuccessMessage(res.message);
      } else if (activeModal === "DISCHARGE") {
        const res = await api.dischargePatient(
          targetBed.id,
          cleaningTypeInput,
          notesInput.trim() || undefined
        );
        setSuccessMessage(res.message);
      } else if (activeModal === "RESERVE") {
        const res = await api.reserveBed(
          targetBed.id,
          undefined,
          notesInput.trim() || undefined
        );
        setSuccessMessage(res.message);
      } else if (activeModal === "MAINTENANCE") {
        const res = await api.markMaintenance(
          targetBed.id,
          notesInput.trim() || undefined
        );
        setSuccessMessage(res.message);
      } else if (activeModal === "COMPLETE_MAINTENANCE") {
        const res = await api.completeMaintenance(
          targetBed.id,
          requiresCleaningInput
        );
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
                      {task.assigned_user_email && (
                        <div className="task-assigned">Staff: {task.assigned_user_email}</div>
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
    const availableBeds = beds.filter((b) => b.status === "AVAILABLE");
    const activeCleaningTasks = cleaningTasks.filter((t) => t.status !== "COMPLETED");

    return (
      <div className="dashboard-container">
        {/* Header bar */}
        <div className="page-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h2>Physician Clinical Command & Bed Intake</h2>
              <span className="demo-badge" style={{ backgroundColor: "#168b8220", color: "#168b82" }}>
                DOCTOR WORKSPACE
              </span>
            </div>
            <p className="page-subtitle">
              Monitor patient admission capacity, execute clinical admissions/discharges, and track post-discharge turnover
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              className="action-link-btn primary"
              onClick={() => navigate("/app/readiness")}
            >
              <TrendingUp size={16} />
              <span>Bed Readiness Intelligence</span>
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

        {/* Doctor Clinical KPI Cards */}
        <div className="kpi-grid">
          <div className="kpi-card card-available">
            <div className="kpi-header">
              <span className="kpi-title">AVAILABLE BEDS</span>
              <CheckCircle2 size={18} style={{ color: "#10b981" }} />
            </div>
            <div className="kpi-value">{stats?.availableBeds ?? 0}</div>
            <div className="kpi-footer">Ready for immediate patient intake</div>
          </div>

          <div className="kpi-card card-occupied">
            <div className="kpi-header">
              <span className="kpi-title">OCCUPIED BEDS</span>
              <BedDouble size={18} style={{ color: "#3b5bcc" }} />
            </div>
            <div className="kpi-value">{stats?.occupiedBeds ?? 0}</div>
            <div className="kpi-footer">Under active clinical inpatient care</div>
          </div>

          <div className="kpi-card card-reserved">
            <div className="kpi-header">
              <span className="kpi-title">RESERVED BEDS</span>
              <Clock size={18} style={{ color: "#d97706" }} />
            </div>
            <div className="kpi-value">{stats?.reservedBeds ?? 0}</div>
            <div className="kpi-footer">Held for incoming scheduled transfers</div>
          </div>

          <div className="kpi-card card-cleaning">
            <div className="kpi-header">
              <span className="kpi-title">CLEANING IN PROGRESS</span>
              <Sparkles size={18} style={{ color: "#8b60b5" }} />
            </div>
            <div className="kpi-value">{stats?.cleaningBeds ?? 0}</div>
            <div className="kpi-footer">Undergoing decontamination; returning soon</div>
          </div>
        </div>

        {/* Section 1: Beds Ready for Immediate Admission */}
        <div className="section-card" style={{ marginTop: "24px" }}>
          <div className="section-card-header">
            <div>
              <h3>Beds Ready for Immediate Patient Admission</h3>
              <p className="section-subtitle">
                Vacant, sanitized beds ready for clinical intake assignment
              </p>
            </div>
            <span className="ready-tag-now">{availableBeds.length} Ready Now</span>
          </div>

          {availableBeds.length === 0 ? (
            <div className="empty-state">
              <AlertCircle size={32} style={{ color: "#e11d48", marginBottom: "8px" }} />
              <p>No available beds right now. Check below for beds completing turnover soon.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bed Number</th>
                    <th>ICU Unit</th>
                    <th>Isolation Status</th>
                    <th>Sanitization Readiness</th>
                    <th style={{ textAlign: "right" }}>Clinical Action</th>
                  </tr>
                </thead>
                <tbody>
                  {availableBeds.map((bed) => (
                    <tr key={bed.id}>
                      <td><strong>{bed.bed_number}</strong></td>
                      <td>{bed.unit_name}</td>
                      <td>
                        {bed.is_isolation ? (
                          <span className="isolation-pill">Airborne Isolation</span>
                        ) : (
                          <span className="text-muted">Standard</span>
                        )}
                      </td>
                      <td>
                        <span className="status-badge status-available">AVAILABLE</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn-table-action btn-admit"
                          onClick={() => openAdmitModal(bed)}
                        >
                          <UserPlus size={14} />
                          <span>Admit Patient</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 2: Active Inpatients & Discharge Actions */}
        <div className="section-card" style={{ marginTop: "24px" }}>
          <div className="section-card-header">
            <div>
              <h3>Active Inpatients & Discharge Pipeline</h3>
              <p className="section-subtitle">
                Synthetic inpatients admitted to ICU. Discharge triggers automated turnover sanitization.
              </p>
            </div>
            <span className="text-muted">{admissions.length} Active Patients</span>
          </div>

          {admissions.length === 0 ? (
            <div className="empty-state">No admitted patients currently in ICU.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Synthetic Patient ID</th>
                    <th>Bed / Unit</th>
                    <th>Admitted At</th>
                    <th>Expected Discharge</th>
                    <th>Admitting Doctor</th>
                    <th style={{ textAlign: "right" }}>Clinical Action</th>
                  </tr>
                </thead>
                <tbody>
                  {admissions.map((adm) => {
                    const matchBed = beds.find((b) => b.id === adm.bed_id);
                    return (
                      <tr key={adm.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <UserCheck size={15} style={{ color: "#168b82" }} />
                            <strong>{adm.patient_ref}</strong>
                          </div>
                        </td>
                        <td>
                          <div><strong>{adm.bed_number}</strong></div>
                          <span className="text-muted" style={{ fontSize: "11px" }}>{adm.unit_name}</span>
                        </td>
                        <td className="text-muted">
                          {new Date(adm.admission_time).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td>
                          {adm.expected_discharge_time ? (
                            <span style={{ fontWeight: 500, color: "#1e293b" }}>
                              {new Date(adm.expected_discharge_time).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          ) : (
                            <span className="text-muted">Open-ended</span>
                          )}
                        </td>
                        <td className="text-muted">{adm.admitting_doctor_email || "Attending Physician"}</td>
                        <td style={{ textAlign: "right" }}>
                          {matchBed && (
                            <button
                              type="button"
                              className="btn-table-action btn-discharge"
                              onClick={() => openDischargeModal(matchBed)}
                            >
                              <UserMinus size={14} />
                              <span>Discharge</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 3: Recently Discharged & Turnover Progress */}
        <div className="section-card" style={{ marginTop: "24px" }}>
          <div className="section-card-header">
            <div>
              <h3>Recently Discharged & Undergoing Sanitization</h3>
              <p className="section-subtitle">
                Housekeeping decontamination progress on recently discharged beds returning to service
              </p>
            </div>
            <span className="text-muted">{activeCleaningTasks.length} Beds Cleaning</span>
          </div>

          {activeCleaningTasks.length === 0 ? (
            <div className="empty-state">No beds currently undergoing turnover.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bed</th>
                    <th>ICU Unit</th>
                    <th>Sanitization Protocol</th>
                    <th>Status</th>
                    <th>Elapsed Time</th>
                    <th>Assigned Housekeeper</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCleaningTasks.map((t) => (
                    <tr key={t.id}>
                      <td><strong>{t.bed_number}</strong></td>
                      <td>{t.unit_name}</td>
                      <td>
                        <span className={`task-type-badge type-${t.task_type.toLowerCase()}`}>
                          {t.task_type}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge status-${t.status === "IN_PROGRESS" ? "occupied" : "cleaning"}`}>
                          {t.status.replace("_", " ")}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: t.is_overdue ? "#e11d48" : "#475569", fontWeight: 500 }}>
                          {t.elapsed_minutes} mins {t.is_overdue && "(OVERDUE)"}
                        </span>
                      </td>
                      <td className="text-muted">{t.assigned_user_email || "Awaiting pickup"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Action Forms */}
        {renderActionModals()}
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h2>Nursing Station & Bed Readiness Operations</h2>
              <span className="demo-badge" style={{ backgroundColor: "#d17a3720", color: "#d17a37" }}>
                NURSE WORKSPACE
              </span>
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

        {/* Section: Available Beds for Hold or Maintenance */}
        <div className="section-card" style={{ marginTop: "24px" }}>
          <div className="section-card-header">
            <div>
              <h3>Available Beds — Reserve Hold or Schedule Maintenance</h3>
              <p className="section-subtitle">
                Place holds for incoming patient transfers or mark equipment for biomedical repair
              </p>
            </div>
            <span className="ready-tag-now">{beds.filter((b) => b.status === "AVAILABLE").length} Available</span>
          </div>

          {beds.filter((b) => b.status === "AVAILABLE").length === 0 ? (
            <div className="empty-state">No beds available for hold or maintenance.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bed Number</th>
                    <th>ICU Unit</th>
                    <th>Isolation</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Nursing Operations</th>
                  </tr>
                </thead>
                <tbody>
                  {beds
                    .filter((b) => b.status === "AVAILABLE")
                    .slice(0, 6)
                    .map((bed) => (
                      <tr key={bed.id}>
                        <td><strong>{bed.bed_number}</strong></td>
                        <td>{bed.unit_name}</td>
                        <td>{bed.is_isolation ? <span className="isolation-pill">ISO</span> : "Standard"}</td>
                        <td><span className="status-badge status-available">AVAILABLE</span></td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="btn-table-action"
                            onClick={() => openReserveModal(bed)}
                            style={{ marginRight: "6px" }}
                          >
                            <Clock size={13} /> Reserve Hold
                          </button>
                          <button
                            type="button"
                            className="btn-table-action"
                            onClick={() => openMaintenanceModal(bed)}
                          >
                            <Wrench size={13} /> Maintenance
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 2: Active Bed Holds & Biomedical Maintenance */}
        <div className="section-card" style={{ marginTop: "24px" }}>
          <div className="section-card-header">
            <div>
              <h3>Active Bed Reservations & Maintenance Tracking</h3>
              <p className="section-subtitle">
                Manage clinical holds for incoming patient transfers and biomedical inspection workflows
              </p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bed Number</th>
                  <th>ICU Unit</th>
                  <th>Status</th>
                  <th>Details / Reason</th>
                  <th style={{ textAlign: "right" }}>Nursing Actions</th>
                </tr>
              </thead>
              <tbody>
                {reservedBeds.length === 0 && maintenanceBeds.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                      No beds currently held under reservation or undergoing biomedical maintenance.
                    </td>
                  </tr>
                ) : (
                  <>
                    {reservedBeds.map((bed) => (
                      <tr key={bed.id}>
                        <td><strong>{bed.bed_number}</strong></td>
                        <td>{bed.unit_name}</td>
                        <td><span className="status-badge status-reserved">RESERVED</span></td>
                        <td className="text-muted">Clinical hold for scheduled transfer</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="btn-table-action"
                            onClick={() => handleReleaseReservation(bed.id)}
                            style={{ borderColor: "#d97706", color: "#d97706" }}
                          >
                            Release Hold
                          </button>
                        </td>
                      </tr>
                    ))}
                    {maintenanceBeds.map((bed) => (
                      <tr key={bed.id}>
                        <td><strong>{bed.bed_number}</strong></td>
                        <td>{bed.unit_name}</td>
                        <td><span className="status-badge status-maintenance">MAINTENANCE</span></td>
                        <td className="text-muted">Biomedical repair / sensor inspection</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="btn-table-action"
                            onClick={() => openCompleteMaintenanceModal(bed)}
                            style={{ borderColor: "#10b981", color: "#10b981" }}
                          >
                            <Check size={14} /> Complete Maintenance
                          </button>
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Status History Trail */}
        {auditLogs.length > 0 && (
          <div className="section-card" style={{ marginTop: "24px" }}>
            <div className="section-card-header">
              <div>
                <h3>Recent Bed Status & Admission Events</h3>
                <p className="section-subtitle">Real-time audited operational event timeline</p>
              </div>
            </div>
            <div className="audit-timeline">
              {auditLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="audit-item">
                  <div className="audit-badge">{log.action}</div>
                  <div className="audit-details">
                    <div>
                      <strong>{log.user_email}</strong> ({log.user_role})
                    </div>
                    <span className="audit-time">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal Action Forms */}
        {renderActionModals()}
      </div>
    );
  }

  // ==============================================================================
  // VIEW 4: ADMINISTRATOR HOSPITAL-WIDE COMMAND DASHBOARD
  // ==============================================================================
  const overdueTurnovers = cleaningTasks.filter((t) => t.is_overdue && t.status !== "COMPLETED");

  const filteredBeds = beds.filter((b) => {
    const matchUnit = selectedUnit === "ALL" || String(b.unit_id) === selectedUnit;
    const matchStatus = selectedStatus === "ALL" || b.status === selectedStatus;
    return matchUnit && matchStatus;
  });

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
            onClick={() => navigate("/app/readiness")}
          >
            <TrendingUp size={16} />
            <span>Readiness Intelligence</span>
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

      {/* Overdue Turnover Warning */}
      {overdueTurnovers.length > 0 && (
        <div className="overdue-banner" role="alert">
          <ShieldAlert size={20} />
          <div>
            <strong>{overdueTurnovers.length} Bed Turnover Task(s) Overdue:</strong> Extended wait times detected on Bed(s):{" "}
            {overdueTurnovers.map((t) => t.bed_number).join(", ")}. Prioritize housekeeping turnaround.
          </div>
        </div>
      )}

      {/* Hospital-Wide KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card card-total">
          <div className="kpi-header">
            <span className="kpi-title">TOTAL ICU CAPACITY</span>
            <BedDouble size={18} style={{ color: "#475569" }} />
          </div>
          <div className="kpi-value">{stats?.totalBeds ?? 0}</div>
          <div className="kpi-footer">Across {stats?.units.length ?? 0} specialized units</div>
        </div>

        <div className="kpi-card card-occupancy">
          <div className="kpi-header">
            <span className="kpi-title">OCCUPANCY RATE</span>
            <Activity size={18} style={{ color: "#3b5bcc" }} />
          </div>
          <div className="kpi-value">{stats?.occupancyRate ?? 0}%</div>
          <div className="occupancy-bar-container">
            <div className="occupancy-bar-fill" style={{ width: `${stats?.occupancyRate ?? 0}%` }} />
          </div>
        </div>

        <div className="kpi-card card-available">
          <div className="kpi-header">
            <span className="kpi-title">AVAILABLE NOW</span>
            <CheckCircle2 size={18} style={{ color: "#10b981" }} />
          </div>
          <div className="kpi-value">{stats?.availableBeds ?? 0}</div>
          <div className="kpi-footer">Sanitized & unassigned</div>
        </div>

        <div className="kpi-card card-occupied">
          <div className="kpi-header">
            <span className="kpi-title">OCCUPIED</span>
            <BedDouble size={18} style={{ color: "#3b5bcc" }} />
          </div>
          <div className="kpi-value">{stats?.occupiedBeds ?? 0}</div>
          <div className="kpi-footer">Active patient care</div>
        </div>

        <div className="kpi-card card-cleaning">
          <div className="kpi-header">
            <span className="kpi-title">TURNOVER QUEUE</span>
            <Sparkles size={18} style={{ color: "#8b60b5" }} />
          </div>
          <div className="kpi-value">{stats?.cleaningBeds ?? 0}</div>
          <div className="kpi-footer">{stats?.pendingCleaningCount ?? 0} pending, {stats?.inProgressCleaningCount ?? 0} active</div>
        </div>

        <div className="kpi-card card-maintenance">
          <div className="kpi-header">
            <span className="kpi-title">MAINTENANCE</span>
            <Wrench size={18} style={{ color: "#e11d48" }} />
          </div>
          <div className="kpi-value">{stats?.maintenanceBeds ?? 0}</div>
          <div className="kpi-footer">Biomedical repair</div>
        </div>
      </div>

      {/* Unit Breakdown Table */}
      {stats?.units && (
        <div className="section-card" style={{ marginTop: "24px" }}>
          <div className="section-card-header">
            <div>
              <h3>ICU Unit Breakdown & Capacity Distribution</h3>
              <p className="section-subtitle">Live utilization across clinical departments</p>
            </div>
            <button
              type="button"
              className="action-link-btn"
              onClick={() => navigate("/app/admin")}
            >
              <Settings size={14} /> Provision Units & Beds
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit Name</th>
                  <th>Design Capacity</th>
                  <th>Installed Beds</th>
                  <th>Occupied</th>
                  <th>Available</th>
                  <th>Occupancy %</th>
                </tr>
              </thead>
              <tbody>
                {stats.units.map((unit) => {
                  const rate = unit.totalBeds > 0 ? Math.round((unit.occupiedBeds / unit.totalBeds) * 100) : 0;
                  return (
                    <tr key={unit.id}>
                      <td><strong>{unit.name}</strong></td>
                      <td>{unit.capacity} beds</td>
                      <td>{unit.totalBeds} beds</td>
                      <td><span style={{ color: "#3b5bcc", fontWeight: 600 }}>{unit.occupiedBeds}</span></td>
                      <td><span style={{ color: "#10b981", fontWeight: 600 }}>{unit.availableBeds}</span></td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div className="occupancy-bar-container" style={{ width: "80px", height: "6px" }}>
                            <div className="occupancy-bar-fill" style={{ width: `${rate}%` }} />
                          </div>
                          <span>{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Visual Bed Grid with Filter */}
      <div className="section-card" style={{ marginTop: "24px" }}>
        <div className="section-card-header" style={{ flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3>Visual Bed-Readiness Grid</h3>
            <p className="section-subtitle">Click on any bed to review details or navigate to management</p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Units</option>
              {units.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.name}</option>
              ))}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="OCCUPIED">Occupied</option>
              <option value="RESERVED">Reserved</option>
              <option value="CLEANING">Cleaning</option>
              <option value="MAINTENANCE">Maintenance</option>
            </select>
          </div>
        </div>

        <div className="bed-grid">
          {filteredBeds.map((bed) => (
            <div
              key={bed.id}
              className={`bed-tile bed-status-${bed.status.toLowerCase()}`}
              onClick={() => navigate(`/app/beds?search=${encodeURIComponent(bed.bed_number)}`)}
            >
              <div className="bed-tile-header">
                <strong>{bed.bed_number}</strong>
                {bed.is_isolation && <span className="isolation-pill">ISO</span>}
              </div>
              <div className="bed-tile-unit">{bed.unit_name}</div>
              <span className={`status-badge status-${bed.status.toLowerCase()}`}>
                {bed.status}
              </span>
              {bed.current_patient_ref && (
                <div className="bed-tile-patient">ID: {bed.current_patient_ref}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Audit Log Timeline */}
      {auditLogs.length > 0 && (
        <div className="section-card" style={{ marginTop: "24px" }}>
          <div className="section-card-header">
            <div>
              <h3>Recent System Audit Events</h3>
              <p className="section-subtitle">Traceability log for hospital operational actions</p>
            </div>
          </div>
          <div className="audit-timeline">
            {auditLogs.map((log) => (
              <div key={log.id} className="audit-item">
                <div className="audit-badge">{log.action}</div>
                <div className="audit-details">
                  <div>
                    <strong>{log.user_email}</strong> ({log.user_role}) — Entity: {log.entity_type} #{log.entity_id}
                  </div>
                  <span className="audit-time">
                    {new Date(log.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Modals */}
      {renderActionModals()}
    </div>
  );

  // Helper renderer for action modals
  function renderActionModals() {
    if (!activeModal || !targetBed) return null;

    return (
      <div className="modal-backdrop">
        <div className="modal-content">
          <div className="modal-header">
            <h3>
              {activeModal === "ADMIT" && `Admit Patient to Bed ${targetBed.bed_number}`}
              {activeModal === "DISCHARGE" && `Discharge Patient from Bed ${targetBed.bed_number}`}
              {activeModal === "RESERVE" && `Reserve Bed ${targetBed.bed_number}`}
              {activeModal === "MAINTENANCE" && `Place Bed ${targetBed.bed_number} in Maintenance`}
              {activeModal === "COMPLETE_MAINTENANCE" && `Complete Maintenance for Bed ${targetBed.bed_number}`}
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
                  <div className="form-group">
                    <label htmlFor="patientRef">Synthetic Patient Reference (PT-XXXX)</label>
                    <input
                      id="patientRef"
                      type="text"
                      className="form-input"
                      value={patientRefInput}
                      onChange={(e) => setPatientRefInput(e.target.value)}
                      placeholder="e.g. PT-4821"
                      required
                    />
                    <span className="input-hint">Never input real patient names or health identifiers</span>
                  </div>

                  <div className="form-group">
                    <label htmlFor="expDischargeHours">Expected Stay Duration (Hours)</label>
                    <input
                      id="expDischargeHours"
                      type="number"
                      min={1}
                      max={360}
                      className="form-input"
                      value={expectedDischargeHoursInput}
                      onChange={(e) => setExpectedDischargeHoursInput(Number(e.target.value))}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="admissionNotes">Clinical Admission Notes</label>
                    <textarea
                      id="admissionNotes"
                      className="form-textarea"
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="Synthetic observation care plan..."
                      rows={3}
                    />
                  </div>
                </>
              )}

              {/* DISCHARGE FORM */}
              {activeModal === "DISCHARGE" && (
                <>
                  <p style={{ fontSize: "13px", color: "#475569", marginBottom: "16px" }}>
                    Discharging this patient will transition <strong>Bed {targetBed.bed_number}</strong> to{" "}
                    <strong>CLEANING</strong> state and automatically dispatch a turnover sanitization task.
                  </p>

                  <div className="form-group">
                    <label htmlFor="cleanType">Decontamination Protocol</label>
                    <select
                      id="cleanType"
                      className="form-input"
                      value={cleaningTypeInput}
                      onChange={(e) => setCleaningTypeInput(e.target.value as any)}
                    >
                      <option value="STANDARD">Standard Bed Turnover (45m baseline)</option>
                      <option value="DEEP">Terminal Deep Disinfection (75m baseline)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="dischargeNotes">Discharge & Turnover Notes</label>
                    <textarea
                      id="dischargeNotes"
                      className="form-textarea"
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="e.g. Routine discharge turnover required..."
                      rows={3}
                    />
                  </div>
                </>
              )}

              {/* RESERVE FORM */}
              {activeModal === "RESERVE" && (
                <div className="form-group">
                  <label htmlFor="reserveNotes">Transfer / Reservation Reason</label>
                  <textarea
                    id="reserveNotes"
                    className="form-textarea"
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="e.g. Held for incoming cardiac transfer from ER..."
                    rows={3}
                    required
                  />
                </div>
              )}

              {/* MAINTENANCE FORM */}
              {activeModal === "MAINTENANCE" && (
                <div className="form-group">
                  <label htmlFor="maintReason">Maintenance / Repair Reason</label>
                  <textarea
                    id="maintReason"
                    className="form-textarea"
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="e.g. Ventilator sensor replacement and electrical safety check..."
                    rows={3}
                    required
                  />
                </div>
              )}

              {/* COMPLETE MAINTENANCE FORM */}
              {activeModal === "COMPLETE_MAINTENANCE" && (
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
              <button type="submit" className="btn-primary" disabled={isSubmittingAction}>
                {isSubmittingAction ? "Processing..." : "Confirm Action"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
};
