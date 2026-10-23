import type {
  DashboardStats,
  IcuUnit,
  Bed,
  CleaningTask,
  Admission,
  AuditLog,
  ReadinessResponse,
  ReadinessConfig,
} from "./types";

let cachedCsrfToken: string = "";

export function setCachedCsrfToken(token: string) {
  cachedCsrfToken = token;
}

export function getCachedCsrfToken(): string {
  // If not cached in memory, attempt to read from document.cookie
  if (!cachedCsrfToken) {
    const match = document.cookie.match(/(?:^|; )icu_csrf=([^;]*)/);
    if (match && match[1]) {
      cachedCsrfToken = decodeURIComponent(match[1]);
    }
  }
  return cachedCsrfToken;
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  
  if (!headers.has("Content-Type") && options.method && options.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  // Attach CSRF token on state-changing requests
  if (options.method && ["POST", "PUT", "PATCH", "DELETE"].includes(options.method.toUpperCase())) {
    const csrf = getCachedCsrfToken();
    if (csrf) {
      headers.set("x-csrf-token", csrf);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = data.message || data.error || `Request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  return data as T;
}

export const api = {
  // Stats
  getDashboardStats: () => request<DashboardStats>("/api/icu/dashboard/stats"),

  // Units
  getUnits: () => request<IcuUnit[]>("/api/icu/units"),
  createUnit: (name: string, capacity: number) =>
    request<{ success: boolean; message: string; unit: IcuUnit }>("/api/icu/units", {
      method: "POST",
      body: JSON.stringify({ name, capacity }),
    }),

  // Beds
  getBeds: (params?: { status?: string; unitId?: string | number; isolation?: boolean | string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.unitId) query.set("unitId", String(params.unitId));
    if (params?.isolation !== undefined && params?.isolation !== "") query.set("isolation", String(params.isolation));
    if (params?.search) query.set("search", params.search);
    return request<Bed[]>(`/api/icu/beds?${query.toString()}`);
  },

  getBedDetails: (id: number) =>
    request<{ bed: Bed; history: AuditLog[] }>(`/api/icu/beds/${id}`),

  createBed: (bedNumber: string, unitId: number, isIsolation: boolean) =>
    request<{ success: boolean; message: string; bed: Bed }>("/api/icu/beds", {
      method: "POST",
      body: JSON.stringify({ bedNumber, unitId, isIsolation }),
    }),

  editBed: (id: number, data: { bedNumber?: string; unitId?: number; isIsolation?: boolean }) =>
    request<{ success: boolean; message: string; bed: Bed }>(`/api/icu/beds/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Bed Workflows
  admitPatient: (bedId: number, patientRef?: string, expectedDischargeTime?: string, notes?: string) =>
    request<{ success: boolean; message: string; status: string; patientRef: string }>(
      `/api/icu/beds/${bedId}/admit`,
      {
        method: "POST",
        body: JSON.stringify({ patientRef, expectedDischargeTime, notes }),
      }
    ),

  dischargePatient: (bedId: number, taskType: "STANDARD" | "DEEP" = "STANDARD", notes?: string) =>
    request<{ success: boolean; message: string; status: string; cleaningTaskId: number; cleaningType: string }>(
      `/api/icu/beds/${bedId}/discharge`,
      {
        method: "POST",
        body: JSON.stringify({ taskType, notes }),
      }
    ),

  reserveBed: (bedId: number, patientRef?: string, notes?: string) =>
    request<{ success: boolean; message: string; status: string }>(`/api/icu/beds/${bedId}/reserve`, {
      method: "POST",
      body: JSON.stringify({ patientRef, notes }),
    }),

  releaseReservation: (bedId: number) =>
    request<{ success: boolean; message: string; status: string }>(`/api/icu/beds/${bedId}/release-reservation`, {
      method: "POST",
    }),

  markMaintenance: (bedId: number, reason?: string) =>
    request<{ success: boolean; message: string; status: string }>(`/api/icu/beds/${bedId}/maintenance`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  completeMaintenance: (bedId: number, requiresCleaning: boolean = true) =>
    request<{ success: boolean; message: string; status: string }>(`/api/icu/beds/${bedId}/complete-maintenance`, {
      method: "POST",
      body: JSON.stringify({ requiresCleaning }),
    }),

  // Cleaning Tasks / Turnover
  getCleaningTasks: (params?: { status?: string; unitId?: string | number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.unitId) query.set("unitId", String(params.unitId));
    return request<CleaningTask[]>(`/api/icu/cleaning-tasks?${query.toString()}`);
  },

  startCleaningTask: (taskId: number) =>
    request<{ success: boolean; message: string; status: string }>(
      `/api/icu/cleaning-tasks/${taskId}/start`,
      { method: "POST" }
    ),

  completeCleaningTask: (taskId: number) =>
    request<{ success: boolean; message: string; bedNumber: string; bedStatus: string; status: string }>(
      `/api/icu/cleaning-tasks/${taskId}/complete`,
      { method: "POST" }
    ),

  // Admissions
  getAdmissions: (params?: { status?: string; unitId?: string | number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.unitId) query.set("unitId", String(params.unitId));
    return request<Admission[]>(`/api/icu/admissions?${query.toString()}`);
  },

  // Audit Logs
  getAuditLogs: (limit: number = 25) =>
    request<AuditLog[]>(`/api/icu/audit-logs?limit=${limit}`),

  // Bed Readiness Intelligence
  getReadiness: () =>
    request<ReadinessResponse>("/api/icu/readiness"),

  getReadinessSettings: () =>
    request<ReadinessConfig>("/api/icu/readiness/settings"),

  updateReadinessSettings: (payload: { scenario?: string; warningBufferBeds?: number }) =>
    request<{ success: boolean; message: string; config: ReadinessConfig }>(
      "/api/icu/readiness/settings",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  // Logout
  logout: () =>
    request<{ success: boolean; message: string }>("/api/auth/logout", {
      method: "POST",
    }),
};
