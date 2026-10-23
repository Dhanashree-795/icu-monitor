import React, { useEffect, useState } from "react";
import {
  Sparkles,
  Play,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldAlert,
  X,
  Filter,
} from "lucide-react";
import type { CleaningTask, IcuUnit, UserRole } from "../types";
import { api } from "../api";

interface TurnoverBoardPageProps {
  userRole: UserRole;
  refreshTrigger?: number;
}

export const TurnoverBoardPage: React.FC<TurnoverBoardPageProps> = ({ userRole, refreshTrigger }) => {
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [units, setUnits] = useState<IcuUnit[]>([]);
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [processingTaskId, setProcessingTaskId] = useState<number | null>(null);

  const canManageCleaning = userRole === "HOUSEKEEPING" || userRole === "ADMIN" || userRole === "NURSE";

  async function loadTasks() {
    setIsLoading(true);
    setError("");
    try {
      const [data, unitsData] = await Promise.all([
        api.getCleaningTasks({
          unitId: unitFilter === "ALL" ? undefined : unitFilter,
        }),
        api.getUnits(),
      ]);
      setTasks(data);
      setUnits(unitsData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load turnover tasks";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, [unitFilter, refreshTrigger]);

  async function handleStartCleaning(taskId: number) {
    setProcessingTaskId(taskId);
    setError("");
    try {
      const res = await api.startCleaningTask(taskId);
      setSuccessMessage(res.message);
      await loadTasks();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start cleaning task";
      setError(msg);
    } finally {
      setProcessingTaskId(null);
    }
  }

  async function handleCompleteCleaning(taskId: number) {
    setProcessingTaskId(taskId);
    setError("");
    try {
      const res = await api.completeCleaningTask(taskId);
      setSuccessMessage(res.message);
      await loadTasks();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to complete cleaning task";
      setError(msg);
    } finally {
      setProcessingTaskId(null);
    }
  }

  const pendingTasks = tasks.filter((t) => t.status === "PENDING");
  const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS");
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED");

  const overdueCount = tasks.filter((t) => t.is_overdue && t.status !== "COMPLETED").length;

  return (
    <div className="turnover-board-page">
      {/* Header bar */}
      <div className="page-header">
        <div>
          <h2>ICU Bed Turnover & Sanitization Board</h2>
          <p className="page-subtitle">
            Track terminal decontaminations, housekeeping turnover workflows, and bed readiness
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div className="filter-group" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Filter size={15} style={{ color: "#64748b" }} />
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="filter-select"
              aria-label="Filter tasks by ICU unit"
            >
              <option value="ALL">All Units</option>
              {units.map((u) => (
                <option key={u.id} value={u.id.toString()}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {overdueCount > 0 && (
            <div className="header-warning-badge">
              <ShieldAlert size={16} />
              <span>{overdueCount} Overdue Turnover Task(s)</span>
            </div>
          )}
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

      {/* Error Banner */}
      {error && (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button type="button" className="close-banner-btn" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Info notice for Housekeeping vs clinical staff */}
      {!canManageCleaning && (
        <div className="info-banner">
          <Sparkles size={16} />
          <span>
            You are logged in as <strong>{userRole}</strong>. This board is in read-only observation mode for your role. Only Housekeeping staff, Nurses, and Administrators can start or complete turnover tasks.
          </span>
        </div>
      )}

      {/* Kanban Board Layout */}
      {isLoading ? (
        <div className="loading-state">Loading turnover task queues...</div>
      ) : (
        <div className="kanban-grid">
          {/* Column 1: PENDING */}
          <div className="kanban-column column-pending">
            <div className="column-header">
              <div className="column-title">
                <span className="dot dot-pending" />
                <h3>Pending Cleaning</h3>
              </div>
              <span className="task-count-pill">{pendingTasks.length}</span>
            </div>

            <div className="task-list">
              {pendingTasks.length === 0 ? (
                <div className="kanban-empty">No beds waiting in queue.</div>
              ) : (
                pendingTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`task-card ${task.is_overdue ? "task-overdue" : ""}`}
                  >
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

                    {task.notes && <p className="task-notes">{task.notes}</p>}

                    <div className="task-meta-row">
                      <span className="task-time-label">
                        <Clock size={13} /> Queued: {task.elapsed_minutes}m ago
                      </span>
                      {task.is_overdue && <span className="overdue-tag">OVERDUE</span>}
                    </div>

                    {canManageCleaning && (
                      <button
                        type="button"
                        className="btn-start-task"
                        onClick={() => handleStartCleaning(task.id)}
                        disabled={processingTaskId === task.id}
                      >
                        <Play size={14} />
                        <span>{processingTaskId === task.id ? "Starting..." : "Start Cleaning"}</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2: IN PROGRESS */}
          <div className="kanban-column column-inprogress">
            <div className="column-header">
              <div className="column-title">
                <span className="dot dot-inprogress" />
                <h3>In Progress</h3>
              </div>
              <span className="task-count-pill">{inProgressTasks.length}</span>
            </div>

            <div className="task-list">
              {inProgressTasks.length === 0 ? (
                <div className="kanban-empty">No beds actively being sanitized.</div>
              ) : (
                inProgressTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`task-card ${task.is_overdue ? "task-overdue" : ""}`}
                  >
                    <div className="task-card-header">
                      <strong>{task.bed_number}</strong>
                      <span className={`task-type-badge type-${task.task_type.toLowerCase()}`}>
                        {task.task_type}
                      </span>
                    </div>

                    <div className="task-unit-name">{task.unit_name}</div>

                    {task.assigned_user_email && (
                      <div className="task-assigned">
                        Assigned: <strong>{task.assigned_user_email}</strong>
                      </div>
                    )}

                    {task.notes && <p className="task-notes">{task.notes}</p>}

                    <div className="task-meta-row">
                      <span className="task-time-label">
                        <Clock size={13} /> Active for: {task.elapsed_minutes}m
                      </span>
                      {task.is_overdue && <span className="overdue-tag">OVERDUE</span>}
                    </div>

                    {canManageCleaning && (
                      <button
                        type="button"
                        className="btn-complete-task"
                        onClick={() => handleCompleteCleaning(task.id)}
                        disabled={processingTaskId === task.id}
                      >
                        <CheckCircle2 size={14} />
                        <span>{processingTaskId === task.id ? "Completing..." : "Complete & Mark Available"}</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 3: COMPLETED */}
          <div className="kanban-column column-completed">
            <div className="column-header">
              <div className="column-title">
                <span className="dot dot-completed" />
                <h3>Completed Turnovers</h3>
              </div>
              <span className="task-count-pill">{completedTasks.length}</span>
            </div>

            <div className="task-list">
              {completedTasks.length === 0 ? (
                <div className="kanban-empty">No completed tasks yet today.</div>
              ) : (
                completedTasks.slice(0, 15).map((task) => (
                  <div key={task.id} className="task-card task-card-completed">
                    <div className="task-card-header">
                      <strong>{task.bed_number}</strong>
                      <span className="status-badge status-available">AVAILABLE</span>
                    </div>

                    <div className="task-unit-name">{task.unit_name}</div>

                    <div className="task-meta-row">
                      <span className="task-time-label">
                        {task.task_type} Clean Complete
                      </span>
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
      )}
    </div>
  );
};
