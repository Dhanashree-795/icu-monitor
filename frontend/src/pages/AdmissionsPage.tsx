import React, { useEffect, useState } from "react";
import {
  UserPlus,
  UserMinus,
  AlertCircle,
  CheckCircle2,
  X,
  Search,
  ShieldCheck,
  Calendar,
  Clock,
} from "lucide-react";
import type { Admission, Bed, UserRole } from "../types";
import { api } from "../api";

interface AdmissionsPageProps {
  userRole: UserRole;
  refreshTrigger?: number;
}

export const AdmissionsPage: React.FC<AdmissionsPageProps> = ({ userRole, refreshTrigger }) => {
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [availableBeds, setAvailableBeds] = useState<Bed[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Admit Modal State
  const [showAdmitModal, setShowAdmitModal] = useState<boolean>(false);
  const [selectedBedId, setSelectedBedId] = useState<number | null>(null);
  const [patientRefInput, setPatientRefInput] = useState<string>("");
  const [expectedDischargeInput, setExpectedDischargeInput] = useState<string>("");
  const [notesInput, setNotesInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string>("");

  // Discharge Modal State
  const [showDischargeModal, setShowDischargeModal] = useState<boolean>(false);
  const [targetAdmission, setTargetAdmission] = useState<Admission | null>(null);
  const [cleaningTypeInput, setCleaningTypeInput] = useState<"STANDARD" | "DEEP">("STANDARD");
  const [dischargeNotesInput, setDischargeNotesInput] = useState<string>("");

  async function loadData() {
    setIsLoading(true);
    setError("");
    try {
      const [admissionsData, bedsData] = await Promise.all([
        api.getAdmissions({
          status: statusFilter === "ALL" ? undefined : statusFilter,
        }),
        api.getBeds({ status: "AVAILABLE" }),
      ]);
      setAdmissions(admissionsData);
      setAvailableBeds(bedsData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load admissions";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [statusFilter, refreshTrigger]);

  function openNewAdmitModal() {
    setModalError("");
    setPatientRefInput(`PT-${Math.floor(1000 + Math.random() * 9000)}`);
    const defaultDate = new Date(Date.now() + 48 * 3600 * 1000);
    setExpectedDischargeInput(defaultDate.toISOString().slice(0, 16));
    setNotesInput("");
    setSelectedBedId(availableBeds[0]?.id || null);
    setShowAdmitModal(true);
  }

  function openDischargeModal(adm: Admission) {
    setTargetAdmission(adm);
    setCleaningTypeInput(adm.is_isolation ? "DEEP" : "STANDARD");
    setDischargeNotesInput("");
    setModalError("");
    setShowDischargeModal(true);
  }

  async function handleAdmitSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBedId) {
      setModalError("Please select an available ICU bed.");
      return;
    }

    setIsSubmitting(true);
    setModalError("");

    try {
      const res = await api.admitPatient(
        selectedBedId,
        patientRefInput,
        expectedDischargeInput ? new Date(expectedDischargeInput).toISOString() : undefined,
        notesInput
      );
      setSuccessMessage(res.message);
      setShowAdmitModal(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Admission failed";
      setModalError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDischargeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetAdmission) return;

    setIsSubmitting(true);
    setModalError("");

    try {
      const res = await api.dischargePatient(targetAdmission.bed_id, cleaningTypeInput, dischargeNotesInput);
      setSuccessMessage(res.message);
      setShowDischargeModal(false);
      setTargetAdmission(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Discharge failed";
      setModalError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  const filteredAdmissions = admissions.filter((adm) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      adm.patient_ref.toLowerCase().includes(q) ||
      adm.bed_number.toLowerCase().includes(q) ||
      adm.unit_name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="admissions-page">
      {/* Header bar */}
      <div className="page-header">
        <div>
          <h2>Synthetic ICU Patient Admissions</h2>
          <p className="page-subtitle">
            Manage bed placement and discharge turnover using synthetic reference identifiers
          </p>
        </div>

        {/* Admit button: available for Doctor and Admin */}
        {(userRole === "DOCTOR" || userRole === "ADMIN") && (
          <button
            type="button"
            className="btn-primary"
            onClick={openNewAdmitModal}
            disabled={availableBeds.length === 0}
            title={availableBeds.length === 0 ? "No available beds" : "Admit synthetic patient"}
          >
            <UserPlus size={16} />
            <span>Admit Synthetic Patient</span>
          </button>
        )}
      </div>

      {/* Synthetic Safety Notice */}
      <div className="info-banner">
        <ShieldCheck size={18} />
        <span>
          <strong>Zero PII Policy:</strong> Real patient names, dates of birth, social IDs, and confidential health records are never collected or stored. Synthetic reference codes (e.g. <code>PT-4821</code>) are used exclusively.
        </span>
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

      {/* Error Banner */}
      {error && (
        <div className="error-banner" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button type="button" className="close-banner-btn" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="controls-card">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by synthetic patient ref, bed number, or unit..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filters-row">
          <div className="filter-item">
            <span className="filter-label">Admission Status:</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All Records</option>
              <option value="ADMITTED">Active Admitted</option>
              <option value="DISCHARGED">Discharged</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table-card">
        {isLoading ? (
          <div className="loading-state">Loading admission records...</div>
        ) : filteredAdmissions.length === 0 ? (
          <div className="empty-state">No admissions found matching the current filters.</div>
        ) : (
          <div className="table-responsive">
            <table className="icu-table">
              <thead>
                <tr>
                  <th>Patient Ref</th>
                  <th>Assigned Bed</th>
                  <th>Unit</th>
                  <th>Room Type</th>
                  <th>Admission Time</th>
                  <th>Expected / Actual Discharge</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdmissions.map((adm) => {
                  const isActive = adm.status === "ADMITTED";
                  return (
                    <tr key={adm.id}>
                      <td>
                        <span className="code-pill">
                          <strong>{adm.patient_ref}</strong>
                        </span>
                      </td>
                      <td>
                        <strong>{adm.bed_number}</strong>
                      </td>
                      <td>{adm.unit_name}</td>
                      <td>
                        {adm.is_isolation ? (
                          <span className="isolation-chip">Airborne ISO</span>
                        ) : (
                          <span className="standard-chip">Standard</span>
                        )}
                      </td>
                      <td>
                        <div className="time-cell">
                          <Calendar size={13} />
                          <span>{new Date(adm.admission_time).toLocaleString()}</span>
                        </div>
                      </td>
                      <td>
                        {isActive ? (
                          adm.expected_discharge_time ? (
                            <div className="time-cell">
                              <Clock size={13} />
                              <span>{new Date(adm.expected_discharge_time).toLocaleDateString()} (Exp)</span>
                            </div>
                          ) : (
                            <span className="muted-dash">—</span>
                          )
                        ) : adm.actual_discharge_time ? (
                          <div className="time-cell text-muted">
                            <CheckCircle2 size={13} />
                            <span>{new Date(adm.actual_discharge_time).toLocaleDateString()} (Discharged)</span>
                          </div>
                        ) : (
                          <span className="muted-dash">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-badge ${isActive ? "status-occupied" : "status-available"}`}>
                          {adm.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {isActive && (userRole === "DOCTOR" || userRole === "NURSE" || userRole === "ADMIN") ? (
                          <button
                            type="button"
                            className="btn-action btn-discharge"
                            onClick={() => openDischargeModal(adm)}
                          >
                            <UserMinus size={14} /> Discharge
                          </button>
                        ) : (
                          <span className="muted-dash">—</span>
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

      {/* Admit Patient Modal */}
      {showAdmitModal && (
        <div className="modal-overlay" onClick={() => setShowAdmitModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Admit Synthetic Patient</h3>
              <button type="button" className="btn-icon" onClick={() => setShowAdmitModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAdmitSubmit}>
              {modalError && (
                <div className="error-banner" role="alert">
                  <AlertCircle size={16} />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="selectBed">Select Available ICU Bed *</label>
                <select
                  id="selectBed"
                  required
                  value={selectedBedId || ""}
                  onChange={(e) => setSelectedBedId(Number(e.target.value))}
                >
                  {availableBeds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bed_number} ({b.unit_name}) {b.is_isolation ? "— [Airborne Isolation]" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="patientRef">Synthetic Patient Reference *</label>
                <input
                  id="patientRef"
                  type="text"
                  required
                  value={patientRefInput}
                  onChange={(e) => setPatientRefInput(e.target.value)}
                  placeholder="e.g. PT-8912"
                />
                <span className="input-hint">Synthetic identifier only. Real patient info strictly prohibited.</span>
              </div>

              <div className="form-group">
                <label htmlFor="expDischarge">Anticipated Discharge Date / Time</label>
                <input
                  id="expDischarge"
                  type="datetime-local"
                  value={expectedDischargeInput}
                  onChange={(e) => setExpectedDischargeInput(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="notes">Observation Protocol Notes</label>
                <textarea
                  id="notes"
                  rows={3}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="e.g. Critical respiratory monitoring"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowAdmitModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={isSubmitting || availableBeds.length === 0}
                >
                  {isSubmitting ? "Processing..." : "Confirm Admission"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discharge Patient Modal */}
      {showDischargeModal && targetAdmission && (
        <div className="modal-overlay" onClick={() => setShowDischargeModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Discharge Patient ({targetAdmission.patient_ref})</h3>
              <button type="button" className="btn-icon" onClick={() => setShowDischargeModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleDischargeSubmit}>
              {modalError && (
                <div className="error-banner" role="alert">
                  <AlertCircle size={16} />
                  <span>{modalError}</span>
                </div>
              )}

              <p className="modal-prompt">
                Discharging patient <strong>{targetAdmission.patient_ref}</strong> will free <strong>Bed {targetAdmission.bed_number}</strong> and automatically queue a turnover cleaning task.
              </p>

              <div className="form-group">
                <label htmlFor="clnType">Turnover Cleaning Level *</label>
                <select
                  id="clnType"
                  value={cleaningTypeInput}
                  onChange={(e) => setCleaningTypeInput(e.target.value as "STANDARD" | "DEEP")}
                >
                  <option value="STANDARD">Standard Sanitization & Turnover</option>
                  <option value="DEEP">
                    Terminal Deep Decontamination {targetAdmission.is_isolation ? "(Recommended for Isolation)" : ""}
                  </option>
                </select>
                {targetAdmission.is_isolation && (
                  <span className="input-hint text-warning">
                    This bed is designated as Airborne Isolation. Terminal Deep Cleaning is recommended.
                  </span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="dcNotes">Discharge Turnover Notes</label>
                <input
                  id="dcNotes"
                  type="text"
                  value={dischargeNotesInput}
                  onChange={(e) => setDischargeNotesInput(e.target.value)}
                  placeholder="e.g. Transferred to Cardiology Step-down Ward"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowDischargeModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Discharging..." : "Confirm Discharge & Queue Clean"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
