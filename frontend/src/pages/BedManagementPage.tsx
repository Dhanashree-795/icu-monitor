import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  AlertCircle,
  CheckCircle2,
  X,
  UserPlus,
  UserMinus,
  Clock,
  Wrench,
  Info,
  Check,
} from "lucide-react";
import type { Bed, IcuUnit, AuditLog, UserRole, AuthUser } from "../types";
import { api } from "../api";

interface BedManagementPageProps {
  userRole: UserRole;
  currentUser?: AuthUser | null;
  refreshTrigger?: number;
}

export const BedManagementPage: React.FC<BedManagementPageProps> = ({ userRole, currentUser, refreshTrigger }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [beds, setBeds] = useState<Bed[]>([]);
  const [units, setUnits] = useState<IcuUnit[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get("search") || "");
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isolationFilter, setIsolationFilter] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Drawer / Details state
  const [selectedBed, setSelectedBed] = useState<Bed | null>(null);
  const [bedHistory, setBedHistory] = useState<AuditLog[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

  // Action Modals State
  const [activeModal, setActiveModal] = useState<
    "ADMIT" | "DISCHARGE" | "RESERVE" | "MAINTENANCE" | "COMPLETE_MAINTENANCE" | null
  >(null);
  const [targetBed, setTargetBed] = useState<Bed | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string>("");

  // Form Fields
  const [patientRefInput, setPatientRefInput] = useState<string>("");
  const [expectedDischargeInput, setExpectedDischargeInput] = useState<string>("");
  const [notesInput, setNotesInput] = useState<string>("");
  const [cleaningTypeInput, setCleaningTypeInput] = useState<"STANDARD" | "DEEP">("STANDARD");
  const [requiresCleaningInput, setRequiresCleaningInput] = useState<boolean>(true);
  const [procedureTypeInput, setProcedureTypeInput] = useState<string>("");
  const [conditionInput, setConditionInput] = useState<string>("stable");
  const [admissionTypeInput, setAdmissionTypeInput] = useState<string>("planned");
  const [complicationsInput, setComplicationsInput] = useState<string>("none");
  const [ageGroupInput, setAgeGroupInput] = useState<string>("adult");

  async function loadBeds() {
    setIsLoading(true);
    setError("");
    try {
      const [bedsData, unitsData] = await Promise.all([
        api.getBeds({
          search: searchQuery,
          status: statusFilter === "ALL" ? undefined : statusFilter,
          unitId: unitFilter === "ALL" ? undefined : unitFilter,
          isolation: isolationFilter === "ALL" ? undefined : isolationFilter === "YES",
        }),
        api.getUnits(),
      ]);
      setBeds(bedsData);
      setUnits(unitsData);

      // If drawer was open, refresh its data
      if (selectedBed) {
        const updatedBed = bedsData.find((b) => b.id === selectedBed.id);
        if (updatedBed) setSelectedBed(updatedBed);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load beds";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadBeds();
  }, [searchQuery, unitFilter, statusFilter, isolationFilter, refreshTrigger]);

  async function openBedDetails(bed: Bed) {
    setSelectedBed(bed);
    setIsLoadingDetails(true);
    try {
      const res = await api.getBedDetails(bed.id);
      setSelectedBed(res.bed);
      setBedHistory(res.history);
    } catch (err) {
      console.error("Failed to load bed history:", err);
    } finally {
      setIsLoadingDetails(false);
    }
  }

  function openActionModal(
    action: "ADMIT" | "DISCHARGE" | "RESERVE" | "MAINTENANCE" | "COMPLETE_MAINTENANCE",
    bed: Bed
  ) {
    setTargetBed(bed);
    setActiveModal(action);
    setActionError("");
    setNotesInput("");

    if (action === "ADMIT") {
      setPatientRefInput(`PT-${Math.floor(1000 + Math.random() * 9000)}`);
      // Default to 48 hours ahead
      const nextDate = new Date(Date.now() + 48 * 3600 * 1000);
      setExpectedDischargeInput(nextDate.toISOString().slice(0, 16));
      setProcedureTypeInput("");
      setConditionInput("stable");
      setAdmissionTypeInput("planned");
      setComplicationsInput("none");
      setAgeGroupInput("adult");
    } else if (action === "DISCHARGE") {
      setCleaningTypeInput(bed.is_isolation ? "DEEP" : "STANDARD");
    } else if (action === "RESERVE") {
      setPatientRefInput(`PT-RES-${Math.floor(100 + Math.random() * 900)}`);
    } else if (action === "MAINTENANCE") {
      setNotesInput("Periodic biomedical calibration and electrical check");
    } else if (action === "COMPLETE_MAINTENANCE") {
      setRequiresCleaningInput(true);
    }
  }

  function closeActionModal() {
    setActiveModal(null);
    setTargetBed(null);
    setActionError("");
  }

  async function handleActionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetBed) return;

    setIsSubmittingAction(true);
    setActionError("");

    try {
      if (activeModal === "ADMIT") {
        const res = await api.admitPatient(targetBed.id, {
          patientRef: patientRefInput.trim(),
          expectedDischargeTime: expectedDischargeInput ? new Date(expectedDischargeInput).toISOString() : undefined,
          notes: notesInput.trim() || undefined,
          procedureType: procedureTypeInput.trim() || undefined,
          condition: conditionInput || undefined,
          admissionType: admissionTypeInput || undefined,
          complications: complicationsInput || undefined,
          ageGroup: ageGroupInput || undefined,
        });
        setSuccessMessage(res.message);
      } else if (activeModal === "DISCHARGE") {
        const res = await api.dischargePatient(targetBed.id, cleaningTypeInput, notesInput);
        setSuccessMessage(res.message);
      } else if (activeModal === "RESERVE") {
        const res = await api.reserveBed(targetBed.id, patientRefInput, notesInput);
        setSuccessMessage(res.message);
      } else if (activeModal === "MAINTENANCE") {
        const res = await api.markMaintenance(targetBed.id, notesInput);
        setSuccessMessage(res.message);
      } else if (activeModal === "COMPLETE_MAINTENANCE") {
        const res = await api.completeMaintenance(targetBed.id, requiresCleaningInput);
        setSuccessMessage(res.message);
      }

      closeActionModal();
      await loadBeds();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Action failed";
      setActionError(msg);
    } finally {
      setIsSubmittingAction(false);
    }
  }

  async function handleQuickReleaseReservation(bed: Bed) {
    if (!confirm(`Release reservation for Bed '${bed.bed_number}' and return to AVAILABLE?`)) return;
    try {
      const res = await api.releaseReservation(bed.id);
      setSuccessMessage(res.message);
      await loadBeds();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to release reservation";
      setError(msg);
    }
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
      return (
        <div>
          <span style={{ fontWeight: 600, color: "#8b60b5", fontSize: "13px" }}>
            ~20 mins
          </span>
          <div style={{ fontSize: "10px", color: "#64748b" }}>
            Turnover sanitization
          </div>
        </div>
      );
    }

    if (bed.status === "OCCUPIED") {
      const storedLos = bed.predicted_los_days;
      const admTimeRaw = bed.admission_time;
      const storedFreeTime = bed.predicted_free_time;

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
      const reason = bed.prediction_reason || (!admTimeRaw ? "Missing admission timestamp" : "Inputs insufficient");

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
        <span style={{ fontSize: "12px", color: "#64748b" }}>
          Hold active
        </span>
      );
    }

    return <span className="muted-dash">—</span>;
  }

  return (
    <div className="bed-management-page">
      {/* Header bar */}
      <div className="page-header">
        <div>
          <h2>ICU Bed Management</h2>
          <p className="page-subtitle">
            Inspect bed clinical readiness, manage turnover queues, and handle patient placement
          </p>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="success-banner" role="status">
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
          <button type="button" className="close-banner-btn" onClick={() => setSuccessMessage("")}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Global Error Banner */}
      {error && (
        <div className="error-banner" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button type="button" className="close-banner-btn" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Controls Bar */}
      <div className="controls-card">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search bed (e.g. MICU-02) or patient ref (e.g. PT-1041)..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchParams(e.target.value ? { search: e.target.value } : {});
            }}
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => {
                setSearchQuery("");
                setSearchParams({});
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="filters-row">
          <div className="filter-item">
            <span className="filter-label">Unit:</span>
            <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
              <option value="ALL">All Units</option>
              {units.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <span className="filter-label">Status:</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="OCCUPIED">Occupied</option>
              <option value="RESERVED">Reserved</option>
              <option value="CLEANING">Cleaning</option>
              <option value="MAINTENANCE">Maintenance</option>
            </select>
          </div>

          <div className="filter-item">
            <span className="filter-label">Isolation:</span>
            <select value={isolationFilter} onChange={(e) => setIsolationFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="YES">Isolation Only</option>
              <option value="NO">Standard Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="table-card">
        {isLoading ? (
          <div className="loading-state">Loading bed statuses...</div>
        ) : beds.length === 0 ? (
          <div className="empty-state">No beds match your filter parameters.</div>
        ) : (
          <div className="table-responsive">
            <table className="icu-table">
              <thead>
                <tr>
                  <th>Bed Number</th>
                  <th>Unit</th>
                  <th>Status</th>
                  <th>Isolation</th>
                  <th>Patient Name</th>
                  <th>Cleaner Name</th>
                  <th>Turnover / Active Details</th>
                  <th>Predicted Free Time</th>
                  <th style={{ textAlign: "right" }}>Permitted Actions</th>
                </tr>
              </thead>
              <tbody>
                {beds.map((bed) => {
                  const isOccupied = bed.status === "OCCUPIED";
                  const isAvailable = bed.status === "AVAILABLE";
                  const isReserved = bed.status === "RESERVED";
                  const isCleaning = bed.status === "CLEANING";
                  const isMaintenance = bed.status === "MAINTENANCE";

                  return (
                    <tr key={bed.id} className={selectedBed?.id === bed.id ? "selected-row" : ""}>
                      <td>
                        <button
                          type="button"
                          className="bed-number-link"
                          onClick={() => openBedDetails(bed)}
                        >
                          <strong>{bed.bed_number}</strong>
                        </button>
                      </td>
                      <td>{bed.unit_name}</td>
                      <td>
                        <span className={`status-badge status-${bed.status.toLowerCase()}`}>
                          {bed.status}
                        </span>
                      </td>
                      <td>
                        {bed.is_isolation ? (
                          <span className="isolation-chip">Airborne ISO</span>
                        ) : (
                          <span className="standard-chip">Standard</span>
                        )}
                      </td>
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
                          <span className="muted-dash">—</span>
                        )}
                      </td>
                      <td>
                        {bed.assigned_cleaner_name ? (
                          <div style={{ fontWeight: 600 }}>{bed.assigned_cleaner_name}</div>
                        ) : isCleaning ? (
                          <span style={{ color: "#8b60b5", fontSize: "12px", fontStyle: "italic" }}>Unassigned</span>
                        ) : (
                          <span className="muted-dash">—</span>
                        )}
                      </td>
                      <td>
                        {isOccupied && bed.admission_time ? (
                          <span className="meta-text">
                            Admitted {new Date(bed.admission_time).toLocaleDateString()}
                          </span>
                        ) : isCleaning && bed.cleaning_task_type ? (
                          <span className="cleaning-chip">
                            {bed.cleaning_task_type} ({bed.cleaning_task_status || "Queued"})
                          </span>
                        ) : isMaintenance ? (
                          <span className="meta-text text-warning">Biomedical check</span>
                        ) : isReserved ? (
                          <span className="meta-text">Hold active</span>
                        ) : (
                          <span className="meta-text text-success">Clean & ready</span>
                        )}
                      </td>
                      <td>
                        {renderPredictedFreeTime(bed)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="actions-cell">
                          {/* Role-based action buttons */}
                          {userRole !== "HOUSEKEEPING" && isAvailable && (userRole === "DOCTOR" || userRole === "ADMIN") && (
                            <button
                              type="button"
                              className="btn-action btn-admit"
                              onClick={() => openActionModal("ADMIT", bed)}
                              title="Admit patient to bed"
                            >
                              <UserPlus size={14} /> Admit
                            </button>
                          )}

                          {userRole !== "HOUSEKEEPING" && isOccupied && (
                            userRole === "DOCTOR" ? (
                              bed.assigned_doctor_id === currentUser?.id ? (
                                <button
                                  type="button"
                                  className="btn-action btn-discharge"
                                  onClick={() => openActionModal("DISCHARGE", bed)}
                                  title="Discharge patient and queue cleaning"
                                >
                                  <UserMinus size={14} /> Discharge
                                </button>
                              ) : (
                                <span className="text-muted" style={{ fontSize: "11px", fontStyle: "italic" }}>
                                  Protected Inpatient
                                </span>
                              )
                            ) : (userRole === "NURSE" || userRole === "ADMIN") && (
                              <button
                                type="button"
                                className="btn-action btn-discharge"
                                onClick={() => openActionModal("DISCHARGE", bed)}
                                title="Discharge patient and queue cleaning"
                              >
                                <UserMinus size={14} /> Discharge
                              </button>
                            )
                          )}

                          {userRole !== "HOUSEKEEPING" && isAvailable && (userRole === "NURSE" || userRole === "ADMIN") && (
                            <button
                              type="button"
                              className="btn-action btn-secondary"
                              onClick={() => openActionModal("RESERVE", bed)}
                              title="Reserve bed for incoming case"
                            >
                              <Clock size={14} /> Reserve
                            </button>
                          )}

                          {userRole !== "HOUSEKEEPING" && isReserved && (
                            userRole === "DOCTOR" ? (
                              <span className="text-muted" style={{ fontSize: "11px", fontStyle: "italic" }}>
                                Scheduled Hold
                              </span>
                            ) : (userRole === "NURSE" || userRole === "ADMIN") && (
                              <>
                                {userRole === "ADMIN" && (
                                  <button
                                    type="button"
                                    className="btn-action btn-admit"
                                    onClick={() => openActionModal("ADMIT", bed)}
                                    title="Admit to reserved bed"
                                  >
                                    <UserPlus size={14} /> Admit
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn-action btn-secondary"
                                  onClick={() => handleQuickReleaseReservation(bed)}
                                  title="Release reservation"
                                >
                                  Release
                                </button>
                              </>
                            )
                          )}

                          {userRole !== "HOUSEKEEPING" && !isOccupied && !isMaintenance && (userRole === "NURSE" || userRole === "ADMIN") && (
                            <button
                              type="button"
                              className="btn-action btn-secondary"
                              onClick={() => openActionModal("MAINTENANCE", bed)}
                              title="Mark for maintenance"
                            >
                              <Wrench size={14} /> Maint
                            </button>
                          )}

                          {userRole !== "HOUSEKEEPING" && isMaintenance && (userRole === "NURSE" || userRole === "ADMIN") && (
                            <button
                              type="button"
                              className="btn-action btn-secondary"
                              onClick={() => openActionModal("COMPLETE_MAINTENANCE", bed)}
                              title="Finish maintenance"
                            >
                              <Check size={14} /> Ready
                            </button>
                          )}

                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => openBedDetails(bed)}
                            title="View details & status history"
                          >
                            <Info size={16} />
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

      {/* Bed Details Drawer */}
      {selectedBed && (
        <div className="drawer-overlay" onClick={() => setSelectedBed(null)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3>Bed {selectedBed.bed_number}</h3>
                <span className="drawer-subtitle">{selectedBed.unit_name}</span>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSelectedBed(null)}
                aria-label="Close drawer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="drawer-body">
              {/* Bed Specs */}
              <div className="detail-section">
                <h4>Bed Specifications</h4>
                <div className="detail-grid">
                  <div>
                    <span className="detail-label">Current Status:</span>
                    <span className={`status-badge status-${selectedBed.status.toLowerCase()}`}>
                      {selectedBed.status}
                    </span>
                  </div>
                  <div>
                    <span className="detail-label">Room Type:</span>
                    {selectedBed.is_isolation ? (
                      <span className="isolation-chip">Airborne Isolation</span>
                    ) : (
                      <span className="standard-chip">Standard ICU</span>
                    )}
                  </div>
                  <div>
                    <span className="detail-label">Patient Name:</span>
                    <strong>{selectedBed.patient_name || (selectedBed.current_patient_ref ? "Name unavailable" : "None (Unassigned)")}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Patient ID:</span>
                    <strong>{selectedBed.current_patient_ref || "—"}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Last Updated:</span>
                    <span>{new Date(selectedBed.updated_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Active Clinical Admission if Occupied */}
              {selectedBed.status === "OCCUPIED" && selectedBed.active_admission_id && (
                <div className="detail-section highlight-box">
                  <h4>Active Patient Placement</h4>
                  <p>
                    <strong>Patient Name:</strong> {selectedBed.patient_name || "Name unavailable"}
                  </p>
                  <p>
                    <strong>Patient ID:</strong> {selectedBed.current_patient_ref || "—"}
                  </p>
                  <p>
                    <strong>Admission Time:</strong>{" "}
                    {selectedBed.admission_time ? new Date(selectedBed.admission_time).toLocaleString() : "Unknown"}
                  </p>
                  {selectedBed.expected_discharge_time && (
                    <p>
                      <strong>Expected Discharge:</strong>{" "}
                      {new Date(selectedBed.expected_discharge_time).toLocaleString()}
                    </p>
                  )}
                  {selectedBed.patient_procedure_type && (
                    <p>
                      <strong>Procedure Type:</strong> {selectedBed.patient_procedure_type}
                    </p>
                  )}
                  {selectedBed.admission_notes && (
                    <p>
                      <strong>Clinical Notes:</strong> {selectedBed.admission_notes}
                    </p>
                  )}
                </div>
              )}

              {/* Experimental Length of Stay & Bed-Free Prediction Details */}
              {selectedBed.status === "OCCUPIED" && (
                <div
                  className="detail-section highlight-box"
                  style={{
                    backgroundColor: "#f0fdf4",
                    borderColor: "#bbf7d0",
                    borderLeft: "4px solid #10b981",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h4 style={{ margin: 0, color: "#166534" }}>Experimental Bed-Free Estimate</h4>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        backgroundColor: "#dcfce7",
                        color: "#15803d",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "1px solid #86efac",
                        textTransform: "uppercase",
                      }}
                    >
                      {selectedBed.prediction_status || (selectedBed.predicted_los_days != null ? "PREDICTED" : "CANT_PREDICT")}
                    </span>
                  </div>

                  {selectedBed.predicted_los_days != null && selectedBed.admission_time ? (
                    <>
                      <p style={{ margin: "4px 0", fontSize: "13px" }}>
                        <strong>Predicted LOS:</strong>{" "}
                        <span style={{ color: "#15803d", fontWeight: 700 }}>
                          {Number(selectedBed.predicted_los_days).toFixed(1)} days
                        </span>
                      </p>
                      <p style={{ margin: "4px 0", fontSize: "13px" }}>
                        <strong>Estimated Free Time:</strong>{" "}
                        <span>
                          {selectedBed.predicted_free_time
                            ? new Date(selectedBed.predicted_free_time).toLocaleString()
                            : new Date(new Date(selectedBed.admission_time).getTime() + Number(selectedBed.predicted_los_days) * 86400000).toLocaleString()}
                        </span>
                      </p>
                      {selectedBed.prediction_updated_at && (
                        <p style={{ margin: "4px 0", fontSize: "11px", color: "#64748b" }}>
                          <strong>Last Prediction Calculated:</strong>{" "}
                          {new Date(selectedBed.prediction_updated_at).toLocaleString()}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p style={{ margin: "4px 0", fontSize: "13px", color: "#64748b" }}>
                        <strong>Prediction Status:</strong> Can't predict
                      </p>
                      <p style={{ margin: "4px 0", fontSize: "12px", color: "#94a3b8" }}>
                        <strong>Reason:</strong>{" "}
                        {selectedBed.prediction_reason || (!selectedBed.admission_time ? "Missing admission timestamp" : "Inputs insufficient")}
                      </p>
                    </>
                  )}

                  <div style={{ marginTop: "10px", fontSize: "10px", color: "#64748b", fontStyle: "italic" }}>
                    Experimental demonstration — trained on synthetic educational data; not clinically validated and must not guide clinical triage or bed decisions.
                  </div>
                </div>
              )}

              {/* Active Cleaning Task if in turnover */}
              {selectedBed.status === "CLEANING" && (
                <div className="detail-section highlight-box turnover-highlight">
                  <h4>Turnover Protocol Active</h4>
                  <p>
                    <strong>Cleaning Level:</strong> {selectedBed.cleaning_task_type || "STANDARD"}
                  </p>
                  <p>
                    <strong>Turnover Status:</strong> {selectedBed.cleaning_task_status || "PENDING"}
                  </p>
                  <p>
                    <strong>Assigned Housekeeper:</strong> {selectedBed.assigned_cleaner_name || selectedBed.assigned_cleaner_email || "Unassigned"}
                  </p>
                  {selectedBed.cleaning_start_time && (
                    <p>
                      <strong>Started:</strong>{" "}
                      {new Date(selectedBed.cleaning_start_time).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              )}

              {/* Status History & Audit Log */}
              <div className="detail-section">
                <h4>Status Transition History</h4>
                {isLoadingDetails ? (
                  <p className="loading-state">Loading history...</p>
                ) : bedHistory.length === 0 ? (
                  <p className="empty-state">No status transition events logged for this bed.</p>
                ) : (
                  <div className="history-list">
                    {bedHistory.map((item) => (
                      <div key={item.id} className="history-item">
                        <div className="history-header">
                          <strong>{item.action.replace(/_/g, " ")}</strong>
                          <span>{new Date(item.created_at).toLocaleString()}</span>
                        </div>
                        <div className="history-meta">
                          <span>User: {item.user_email || "System"}</span>
                          {item.details && (
                            <span className="history-details">
                              {typeof item.details === "object"
                                ? JSON.stringify(item.details)
                                : String(item.details)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Action Modals */}
      {activeModal && targetBed && (
        <div className="modal-overlay" onClick={closeActionModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {activeModal === "ADMIT" && `Admit Patient to Bed ${targetBed.bed_number}`}
                {activeModal === "DISCHARGE" && `Discharge Patient from Bed ${targetBed.bed_number}`}
                {activeModal === "RESERVE" && `Reserve Bed ${targetBed.bed_number}`}
                {activeModal === "MAINTENANCE" && `Place Bed ${targetBed.bed_number} into Maintenance`}
                {activeModal === "COMPLETE_MAINTENANCE" && `Return Bed ${targetBed.bed_number} from Maintenance`}
              </h3>
              <button type="button" className="btn-icon" onClick={closeActionModal}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleActionSubmit}>
              {actionError && (
                <div className="error-banner" role="alert">
                  <AlertCircle size={16} />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Admission Fields */}
              {activeModal === "ADMIT" && (
                <>
                  <div className="form-group">
                    <label htmlFor="patientRef">Anonymous Synthetic Reference *</label>
                    <input
                      id="patientRef"
                      type="text"
                      required
                      value={patientRefInput}
                      onChange={(e) => setPatientRefInput(e.target.value)}
                      placeholder="e.g. PT-4821"
                    />
                    <span className="input-hint">
                      Never enter real names or dates of birth. Use synthetic references only.
                    </span>
                  </div>

                  <div className="form-group">
                    <label htmlFor="procedureType">Procedure Type (Experimental LOS)</label>
                    <select
                      id="procedureType"
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

                  <div className="form-group">
                    <label htmlFor="condition">Condition Category</label>
                    <select
                      id="condition"
                      value={conditionInput}
                      onChange={(e) => setConditionInput(e.target.value)}
                    >
                      <option value="stable">Stable</option>
                      <option value="improving">Improving</option>
                      <option value="moderate">Moderate</option>
                      <option value="critical">Critical</option>
                      <option value="uncertain">Uncertain</option>
                    </select>
                  </div>

                  <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                    <div className="form-group">
                      <label htmlFor="admissionType">Admission Type</label>
                      <select
                        id="admissionType"
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
                    <label htmlFor="expDischarge">Expected Discharge Date/Time</label>
                    <input
                      id="expDischarge"
                      type="datetime-local"
                      value={expectedDischargeInput}
                      onChange={(e) => setExpectedDischargeInput(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="admNotes">Observation / Unit Placement Notes</label>
                    <textarea
                      id="admNotes"
                      rows={3}
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="e.g. Telemetry monitoring, post-op observation"
                    />
                  </div>
                </>
              )}

              {/* Discharge Fields */}
              {activeModal === "DISCHARGE" && (
                <>
                  <p className="modal-prompt">
                    Discharging will complete active admission for <strong>{targetBed.current_patient_ref}</strong> and automatically transition the bed to <strong>CLEANING</strong> status.
                  </p>

                  <div className="form-group">
                    <label htmlFor="cleaningType">Required Turnover Cleaning Level *</label>
                    <select
                      id="cleaningType"
                      value={cleaningTypeInput}
                      onChange={(e) => setCleaningTypeInput(e.target.value as "STANDARD" | "DEEP")}
                    >
                      <option value="STANDARD">Standard Turnover (Sanitization & Linen)</option>
                      <option value="DEEP">
                        Deep Terminal Decontamination {targetBed.is_isolation ? "(Recommended for Isolation)" : ""}
                      </option>
                    </select>
                    {targetBed.is_isolation && (
                      <span className="input-hint text-warning">
                        This bed is designated as Airborne Isolation. Terminal Deep Cleaning is recommended.
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="dischargeNotes">Discharge & Turnover Notes</label>
                    <input
                      id="dischargeNotes"
                      type="text"
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="e.g. Transferred to step-down unit"
                    />
                  </div>
                </>
              )}

              {/* Reserve Fields */}
              {activeModal === "RESERVE" && (
                <>
                  <div className="form-group">
                    <label htmlFor="resRef">Expected Case Synthetic Ref</label>
                    <input
                      id="resRef"
                      type="text"
                      value={patientRefInput}
                      onChange={(e) => setPatientRefInput(e.target.value)}
                      placeholder="e.g. PT-RES-01"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="resNotes">Reservation Reason / Details</label>
                    <input
                      id="resNotes"
                      type="text"
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="e.g. Incoming emergency transfer"
                    />
                  </div>
                </>
              )}

              {/* Maintenance Fields */}
              {activeModal === "MAINTENANCE" && (
                <div className="form-group">
                  <label htmlFor="maintReason">Reason for Biomedical Maintenance *</label>
                  <textarea
                    id="maintReason"
                    rows={3}
                    required
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="e.g. Monitor sensor replacement, electrical inspection"
                  />
                </div>
              )}

              {/* Complete Maintenance Fields */}
              {activeModal === "COMPLETE_MAINTENANCE" && (
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={requiresCleaningInput}
                      onChange={(e) => setRequiresCleaningInput(e.target.checked)}
                    />
                    <span>Queue post-maintenance turnover cleaning task before marking AVAILABLE</span>
                  </label>
                  <span className="input-hint">
                    Recommended: guarantees housekeeping sanitization before clinical patient intake.
                  </span>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={closeActionModal}
                  disabled={isSubmittingAction}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={isSubmittingAction}
                >
                  {isSubmittingAction ? "Processing..." : "Confirm Action"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
