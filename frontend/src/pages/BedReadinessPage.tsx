import React, { useEffect, useState } from "react";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  TrendingUp,
  Activity,
  Sliders,
  Info,
  BarChart3,
} from "lucide-react";
import type { ReadinessResponse, UserRole } from "../types";
import { api } from "../api";

interface BedReadinessPageProps {
  userRole: UserRole;
  refreshTrigger?: number;
}

export const BedReadinessPage: React.FC<BedReadinessPageProps> = ({
  userRole,
  refreshTrigger,
}) => {
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [selectedHorizon, setSelectedHorizon] = useState<"2h" | "4h" | "8h">("2h");
  const [selectedUnit, setSelectedUnit] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Admin scenario configuration modal / controls
  const [isUpdatingScenario, setIsUpdatingScenario] = useState<boolean>(false);
  const [scenarioInput, setScenarioInput] = useState<"Normal" | "Busy" | "Surge">("Normal");
  const [warningBufferInput, setWarningBufferInput] = useState<number>(2);
  const [configMessage, setConfigMessage] = useState<string>("");

  const isAdmin = userRole === "ADMIN";

  async function loadReadiness() {
    setIsLoading(true);
    setError("");
    try {
      const res = await api.getReadiness();
      setData(res);
      setScenarioInput(res.scenario.current);
      setWarningBufferInput(res.capacityWarning.thresholdBufferBeds);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load readiness intelligence";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReadiness();
  }, [refreshTrigger]);

  async function handleApplyScenario(newScenario: "Normal" | "Busy" | "Surge", buffer: number) {
    if (!isAdmin) return;
    setIsUpdatingScenario(true);
    setConfigMessage("");
    setError("");
    try {
      const res = await api.updateReadinessSettings({
        scenario: newScenario,
        warningBufferBeds: buffer,
      });
      setConfigMessage(res.message);
      await loadReadiness();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update simulation scenario";
      setError(msg);
    } finally {
      setIsUpdatingScenario(false);
    }
  }

  if (isLoading && !data) {
    return (
      <div className="placeholder">
        <Activity size={32} className="spin-icon" style={{ color: "#3b5bcc" }} />
        <p>Calculating real-time bed readiness and turnover trajectories...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="empty-state">
        <AlertTriangle size={36} style={{ color: "#e11d48", marginBottom: "12px" }} />
        <h3>Unable to load Readiness Intelligence</h3>
        <p>{error}</p>
        <button type="button" className="btn-primary" onClick={loadReadiness} style={{ marginTop: "12px" }}>
          Retry Calculation
        </button>
      </div>
    );
  }

  if (!data) return null;

  const currentHorizonData =
    selectedHorizon === "2h"
      ? data.horizons.window2h
      : selectedHorizon === "4h"
      ? data.horizons.window4h
      : data.horizons.window8h;

  // Filter beds according to unit & category
  const filteredBeds = data.allBeds.filter((bed) => {
    const matchUnit = selectedUnit === "ALL" || String(bed.unit_id) === selectedUnit;
    const matchStatus = statusFilter === "ALL" || bed.category === statusFilter;
    return matchUnit && matchStatus;
  });

  const uniqueUnits = Array.from(new Set(data.allBeds.map((b) => JSON.stringify({ id: b.unit_id, name: b.unit_name }))))
    .map((s) => JSON.parse(s) as { id: number; name: string });

  return (
    <div className="readiness-page">
      {/* Top Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2>ICU Bed Readiness Intelligence</h2>
            <span className="demo-badge">OPERATIONAL HEURISTIC FORECAST</span>
          </div>
          <p className="page-subtitle">
            Anticipate bed availability across 2h, 4h, and 8h horizons based on active turnover and scheduled discharges.
          </p>
        </div>

        {/* Scenario Badge & Admin Switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div className={`scenario-pill scenario-${data.scenario.current.toLowerCase()}`}>
            <span className="scenario-dot" />
            <span>Scenario: <strong>{data.scenario.current}</strong></span>
            {data.scenario.simulatedDemand > 0 && (
              <span className="surge-tag">+{data.scenario.simulatedDemand} Intake Demand</span>
            )}
          </div>

          {isAdmin && (
            <div className="scenario-quick-actions" style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                className={`scenario-btn ${data.scenario.current === "Normal" ? "active" : ""}`}
                onClick={() => handleApplyScenario("Normal", warningBufferInput)}
                disabled={isUpdatingScenario}
                title="Normal operational demand (0 simulated surge)"
              >
                Normal
              </button>
              <button
                type="button"
                className={`scenario-btn ${data.scenario.current === "Busy" ? "active" : ""}`}
                onClick={() => handleApplyScenario("Busy", warningBufferInput)}
                disabled={isUpdatingScenario}
                title="Elevated demand (+2 simulated intake requests)"
              >
                Busy
              </button>
              <button
                type="button"
                className={`scenario-btn ${data.scenario.current === "Surge" ? "active" : ""}`}
                onClick={() => handleApplyScenario("Surge", warningBufferInput)}
                disabled={isUpdatingScenario}
                title="Mass surge protocol (+5 simulated intake requests)"
              >
                Surge
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Admin success feedback */}
      {configMessage && (
        <div className="success-banner" role="status">
          <CheckCircle2 size={16} />
          <span>{configMessage}</span>
          <button type="button" className="close-banner-btn" onClick={() => setConfigMessage("")}>
            ×
          </button>
        </div>
      )}

      {/* Safety Notice & Heuristic Disclaimer */}
      <div className="heuristic-notice-bar">
        <Info size={16} style={{ flexShrink: 0, color: "#3b5bcc" }} />
        <span>
          <strong>Transparent Heuristic Baseline:</strong> Ready times are modeled from active housekeeping durations and physician-recorded expected discharges. Estimates are strictly operational benchmarks, not automated clinical decisions. Patients are never discharged automatically.
        </span>
      </div>

      {/* Capacity Warning Alert (Dynamic) */}
      {data.capacityWarning.hasWarning ? (
        <div className={`capacity-alert-banner alert-${data.capacityWarning.level.toLowerCase()}`}>
          <div className="alert-icon-col">
            <ShieldAlert size={24} />
          </div>
          <div className="alert-content-col">
            <h4>{data.capacityWarning.title}</h4>
            <p>{data.capacityWarning.message}</p>
            <div className="alert-action-rec">
              <strong>Recommended Operational Action:</strong> {data.capacityWarning.recommendedAction}
            </div>
          </div>
        </div>
      ) : (
        <div className="capacity-alert-banner alert-ok">
          <div className="alert-icon-col">
            <CheckCircle2 size={24} />
          </div>
          <div className="alert-content-col">
            <h4>{data.capacityWarning.title}</h4>
            <p>{data.capacityWarning.message}</p>
          </div>
        </div>
      )}

      {/* Horizon Projection Cards (2h, 4h, 8h) */}
      <div className="horizon-cards-grid">
        {/* Available Right Now */}
        <div className="horizon-summary-card card-now">
          <div className="horizon-card-header">
            <span className="horizon-tag-now">AVAILABLE NOW</span>
            <CheckCircle2 size={18} style={{ color: "#10b981" }} />
          </div>
          <div className="horizon-count-large">{data.summary.availableNowCount}</div>
          <p className="horizon-desc">
            Vacant, sanitized beds ready for immediate patient assignment.
          </p>
          <div className="horizon-meta">
            {data.summary.cleaningCount} bed(s) currently undergoing sanitization
          </div>
        </div>

        {/* +2 Hours Horizon */}
        <div
          className={`horizon-summary-card ${selectedHorizon === "2h" ? "selected" : ""} ${data.horizons.window2h.isDeficit ? "deficit-card" : ""}`}
          onClick={() => setSelectedHorizon("2h")}
          style={{ cursor: "pointer" }}
        >
          <div className="horizon-card-header">
            <span className="horizon-tag">NEXT 2 HOURS</span>
            <Clock size={16} style={{ color: "#3b5bcc" }} />
          </div>
          <div className="horizon-count-large">{data.horizons.window2h.count}</div>
          <div className="horizon-net-line">
            Net Capacity: <strong>{data.horizons.window2h.netCountAfterSimulatedDemand} beds</strong>
            {data.scenario.simulatedDemand > 0 && ` (-${data.scenario.simulatedDemand} surge)`}
          </div>
          <p className="horizon-desc">
            Includes available beds + active cleanings completing within 120 mins.
          </p>
          {data.horizons.window2h.isDeficit && (
            <div className="deficit-pill">Below {data.capacityWarning.thresholdBufferBeds} bed safety buffer</div>
          )}
        </div>

        {/* +4 Hours Horizon */}
        <div
          className={`horizon-summary-card ${selectedHorizon === "4h" ? "selected" : ""}`}
          onClick={() => setSelectedHorizon("4h")}
          style={{ cursor: "pointer" }}
        >
          <div className="horizon-card-header">
            <span className="horizon-tag">NEXT 4 HOURS</span>
            <Clock size={16} style={{ color: "#3b5bcc" }} />
          </div>
          <div className="horizon-count-large">{data.horizons.window4h.count}</div>
          <div className="horizon-net-line">
            Net Capacity: <strong>{data.horizons.window4h.netCountAfterSimulatedDemand} beds</strong>
          </div>
          <p className="horizon-desc">
            Includes queued cleanings and near-term expected discharges.
          </p>
        </div>

        {/* +8 Hours Horizon */}
        <div
          className={`horizon-summary-card ${selectedHorizon === "8h" ? "selected" : ""}`}
          onClick={() => setSelectedHorizon("8h")}
          style={{ cursor: "pointer" }}
        >
          <div className="horizon-card-header">
            <span className="horizon-tag">NEXT 8 HOURS</span>
            <TrendingUp size={16} style={{ color: "#3b5bcc" }} />
          </div>
          <div className="horizon-count-large">{data.horizons.window8h.count}</div>
          <div className="horizon-net-line">
            Net Capacity: <strong>{data.horizons.window8h.netCountAfterSimulatedDemand} beds</strong>
          </div>
          <p className="horizon-desc">
            Full shift trajectory including day-shift planned discharges.
          </p>
        </div>
      </div>

      {/* Main Grid: Per-Bed Readiness Trajectories */}
      <div className="section-card" style={{ marginTop: "24px" }}>
        <div className="section-card-header" style={{ flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3>Per-Bed Readiness & Estimated Available Time</h3>
            <p className="section-subtitle">
              Viewing trajectory for: <strong>{currentHorizonData.label}</strong> ({currentHorizonData.count} beds ready)
            </p>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <div className="filter-group">
              <label htmlFor="unitFilter" style={{ fontSize: "12px", color: "#64748b" }}>Unit:</label>
              <select
                id="unitFilter"
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="filter-select"
              >
                <option value="ALL">All Units</option>
                {uniqueUnits.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="catFilter" style={{ fontSize: "12px", color: "#64748b" }}>Category:</label>
              <select
                id="catFilter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="filter-select"
              >
                <option value="ALL">All Categories</option>
                <option value="AVAILABLE">Available Right Now</option>
                <option value="CLEANING_IN_PROGRESS">Active Cleaning</option>
                <option value="CLEANING_PENDING">Queued Cleaning</option>
                <option value="DISCHARGE_PLANNED">Discharge Planned</option>
                <option value="OCCUPIED_LONG_STAY">Occupied Inpatient</option>
                <option value="RESERVED">Reserved</option>
                <option value="MAINTENANCE">Maintenance</option>
              </select>
            </div>
          </div>
        </div>

        {/* Readiness Table */}
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bed / Unit</th>
                <th>Current Status</th>
                <th>Estimated Ready</th>
                <th>Confidence & Explanation</th>
                <th>Reason / Heuristic Model Basis</th>
              </tr>
            </thead>
            <tbody>
              {filteredBeds.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                    No beds match the current filter selection.
                  </td>
                </tr>
              ) : (
                filteredBeds.map((bed) => {
                  const isReadyNow = bed.readyNow;
                  const isWithinSelectedHorizon =
                    bed.readyNow ||
                    (selectedHorizon === "2h" && bed.estimatedReadyHours <= 2) ||
                    (selectedHorizon === "4h" && bed.estimatedReadyHours <= 4) ||
                    (selectedHorizon === "8h" && bed.estimatedReadyHours <= 8);

                  return (
                    <tr
                      key={bed.id}
                      style={{
                        backgroundColor: isReadyNow
                          ? "rgba(16, 185, 129, 0.03)"
                          : isWithinSelectedHorizon
                          ? "rgba(59, 91, 204, 0.02)"
                          : "transparent",
                      }}
                    >
                      {/* Bed & Unit */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <strong>{bed.bed_number}</strong>
                          {bed.is_isolation && (
                            <span className="isolation-pill" title="Airborne isolation protocol">
                              ISO
                            </span>
                          )}
                        </div>
                        <span className="text-muted" style={{ fontSize: "12px" }}>
                          {bed.unit_name}
                        </span>
                      </td>

                      {/* Current Status */}
                      <td>
                        <span className={`status-badge status-${bed.status.toLowerCase()}`}>
                          {bed.status}
                        </span>
                        {bed.current_patient_ref && (
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                            Ref: {bed.current_patient_ref}
                          </div>
                        )}
                        {bed.elapsedMinutes !== undefined && (
                          <div style={{ fontSize: "11px", color: "#d97706", marginTop: "2px" }}>
                            Active: {bed.elapsedMinutes}m
                          </div>
                        )}
                      </td>

                      {/* Estimated Ready */}
                      <td>
                        {isReadyNow ? (
                          <span className="ready-tag-now">
                            <CheckCircle2 size={13} /> READY NOW
                          </span>
                        ) : (
                          <div>
                            <div style={{ fontWeight: 600, color: "#1e293b" }}>
                              {bed.estimatedReadyHours <= 1
                                ? `In ~${Math.round(bed.estimatedReadyHours * 60)} mins`
                                : `In ~${bed.estimatedReadyHours} hrs`}
                            </div>
                            {bed.estimatedReadyTime && (
                              <span className="text-muted" style={{ fontSize: "11px" }}>
                                Target: {new Date(bed.estimatedReadyTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Confidence */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span className={`confidence-pill confidence-${bed.confidence.toLowerCase()}`}>
                            {bed.confidence}
                          </span>
                        </div>
                        <p style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", maxWidth: "220px", lineHeight: "1.3" }}>
                          {bed.confidenceExplanation}
                        </p>
                      </td>

                      {/* Reason */}
                      <td>
                        <p style={{ fontSize: "12px", color: "#334155", margin: 0, lineHeight: "1.4" }}>
                          {bed.reason}
                        </p>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historical Forecast vs Actual Validation Benchmark */}
      <div className="section-card" style={{ marginTop: "24px" }}>
        <div className="section-card-header">
          <div>
            <h3>Turnover Forecast vs Actual Empirical Performance</h3>
            <p className="section-subtitle">
              Validating model duration benchmarks against verified completed sanitizations
            </p>
          </div>
          <span className="benchmark-tag">
            <BarChart3 size={14} /> Empirical Baseline
          </span>
        </div>

        {/* Benchmark metric cards */}
        <div className="benchmark-grid">
          {data.benchmarks.map((bm) => (
            <div key={bm.taskType} className="benchmark-stat-box">
              <div className="bm-header">
                <strong>{bm.taskType} CLEANING</strong>
                <span className="text-muted">{bm.sampleCount} completed runs</span>
              </div>
              <div className="bm-metrics-row">
                <div>
                  <span className="bm-label">Target Baseline:</span>
                  <div className="bm-val">{bm.baselineTargetMinutes}m</div>
                </div>
                <div>
                  <span className="bm-label">Average Actual:</span>
                  <div className="bm-val" style={{ color: "#3b5bcc" }}>
                    {bm.averageActualMinutes ? `${bm.averageActualMinutes}m` : "N/A"}
                  </div>
                </div>
                <div>
                  <span className="bm-label">Variance:</span>
                  <div
                    className="bm-val"
                    style={{
                      color:
                        bm.varianceMinutes === null
                          ? "#64748b"
                          : bm.varianceMinutes <= 0
                          ? "#10b981"
                          : "#d97706",
                    }}
                  >
                    {bm.varianceMinutes !== null
                      ? bm.varianceMinutes > 0
                        ? `+${bm.varianceMinutes}m`
                        : `${bm.varianceMinutes}m`
                      : "0m"}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent completed turnover verification logs */}
        {data.recentCompletedTurnovers.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            <h4 style={{ fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>
              Recent Completed Turnovers (Model Comparison)
            </h4>
            <div className="table-responsive">
              <table className="data-table" style={{ fontSize: "12px" }}>
                <thead>
                  <tr>
                    <th>Bed</th>
                    <th>Clean Type</th>
                    <th>Actual Duration</th>
                    <th>Model Target</th>
                    <th>Variance</th>
                    <th>Completed At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentCompletedTurnovers.map((t) => (
                    <tr key={t.id}>
                      <td><strong>{t.bed_number}</strong></td>
                      <td>
                        <span className={`task-type-badge type-${t.task_type.toLowerCase()}`}>
                          {t.task_type}
                        </span>
                      </td>
                      <td>{t.duration_minutes} mins</td>
                      <td>{t.baseline_minutes} mins</td>
                      <td style={{ color: t.variance_minutes <= 0 ? "#10b981" : "#d97706", fontWeight: 600 }}>
                        {t.variance_minutes > 0 ? `+${t.variance_minutes}m` : `${t.variance_minutes}m`}
                      </td>
                      <td className="text-muted">
                        {new Date(t.completion_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Admin Scenario Configuration Section */}
      {isAdmin && (
        <div className="section-card admin-config-card" style={{ marginTop: "24px" }}>
          <div className="section-card-header">
            <div>
              <h3>Administrator Demo Scenario & Warning Threshold Controls</h3>
              <p className="section-subtitle">
                Configure simulation scenarios and warning triggers without modifying baseline database records
              </p>
            </div>
            <Sliders size={18} style={{ color: "#3b5bcc" }} />
          </div>

          <div className="config-form-row">
            <div className="config-field">
              <label htmlFor="scenarioSelect">Simulation Demand Scenario</label>
              <select
                id="scenarioSelect"
                value={scenarioInput}
                onChange={(e) => setScenarioInput(e.target.value as any)}
                className="filter-select"
                style={{ width: "100%", height: "38px" }}
              >
                <option value="Normal">Normal (Baseline Flow - 0 Simulated Demand)</option>
                <option value="Busy">Busy (Elevated Demand - +2 Simulated ER Requests)</option>
                <option value="Surge">Surge (Mass Emergency - +5 Simulated ER Requests)</option>
              </select>
            </div>

            <div className="config-field">
              <label htmlFor="bufferSelect">Warning Capacity Buffer (Beds)</label>
              <input
                id="bufferSelect"
                type="number"
                min={0}
                max={10}
                value={warningBufferInput}
                onChange={(e) => setWarningBufferInput(Number(e.target.value))}
                className="filter-select"
                style={{ width: "100%", height: "38px", padding: "0 10px" }}
              />
              <span className="input-hint">Alert triggers when 2h net capacity falls below this buffer</span>
            </div>

            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleApplyScenario(scenarioInput, warningBufferInput)}
                disabled={isUpdatingScenario}
                style={{ height: "38px", padding: "0 20px" }}
              >
                {isUpdatingScenario ? "Saving..." : "Apply Scenario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
