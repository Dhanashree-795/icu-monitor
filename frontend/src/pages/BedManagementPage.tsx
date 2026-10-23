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
import type { Bed, IcuUnit, AuditLog, UserRole } from "../types";
import { api } from "../api";

interface BedManagementPageProps {
  userRole: UserRole;
  refreshTrigger?: number;
}

export const BedManagementPage: React.FC<BedManagementPageProps> = ({ userRole, refreshTrigger }) => {
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
        const res = await api.admitPatient(
          targetBed.id,
          patientRefInput,
          expectedDischargeInput ? new Date(expectedDischargeInput).toISOString() : undefined,
          notesInput
        );
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
                  <th>Synthetic Patient Ref</th>
                  <th>Turnover / Active Details</th>
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
                        {bed.current_patient_ref ? (
                          <span className="code-pill">{bed.current_patient_ref}</span>
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

                          {userRole !== "HOUSEKEEPING" && isOccupied && (userRole === "DOCTOR" || userRole === "NURSE" || userRole === "ADMIN") && (
                            <button
                              type="button"
                              className="btn-action btn-discharge"
                              onClick={() => openActionModal("DISCHARGE", bed)}
                              title="Discharge patient and queue cleaning"
                            >
                              <UserMinus size={14} /> Discharge
                            </button>
                          )}

                          {userRole !== "HOUSEKEEPING" && isAvailable && (
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
                            <>
                              {(userRole === "DOCTOR" || userRole === "ADMIN") && (
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
                    <span className="detail-label">Patient Ref:</span>
                    <strong>{selectedBed.current_patient_ref || "None (Unassigned)"}</strong>
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
                    <strong>Synthetic ID:</strong> {selectedBed.current_patient_ref}
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
                  {selectedBed.admission_notes && (
                    <p>
                      <strong>Clinical Notes:</strong> {selectedBed.admission_notes}
                    </p>
                  )}
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
