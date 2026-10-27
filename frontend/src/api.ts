import type {
  DashboardStats,
  IcuUnit,
  Bed,
  StaffUser,
  CleaningTask,
  Admission,
  AuditLog,
  ReadinessResponse,
  ReadinessConfig,
  UserRole,
  LosPredictionRequest,
  LosPredictionResponse,
  MlHealthResponse,
  AdmissionResponse,
  AdminAdmitPayload,
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

  // Staff
  getStaff: () => request<StaffUser[]>("/api/icu/staff"),

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
  admitPatient: (
    bedId: number,
    payloadOrRef?: string | {
      patientRef?: string;
      patientName?: string;
      procedureType?: string;
      condition?: string;
      admissionReason?: string;
      doctorId?: number;
      admissionTime?: string;
      expectedDischargeTime?: string;
      notes?: string;
      admissionType?: string;
      complications?: string;
      ageGroup?: string;
      icuUnit?: string;
    },
    expectedDischargeTime?: string,
    notes?: string
  ) => {
    const body = typeof payloadOrRef === "object"
      ? payloadOrRef
      : { patientRef: payloadOrRef, expectedDischargeTime, notes };
    return request<AdmissionResponse>(
      `/api/icu/beds/${bedId}/admit`,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
  },

  createAdmission: (data: AdminAdmitPayload) =>
    request<AdmissionResponse>("/api/icu/admissions", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  dischargePatient: (bedId: number, taskType: "STANDARD" | "DEEP" = "STANDARD", notes?: string) =>
    request<{ success: boolean; message: string; status: string; cleaningTaskId: number; cleaningType: string }>(
      `/api/icu/beds/${bedId}/discharge`,
      {
        method: "POST",
        body: JSON.stringify({ taskType, notes }),
      }
    ),

  reserveBed: (
    bedId: number,
    payloadOrRef?: string | {
      patientRef?: string;
      reservationRef?: string;
      plannedAdmissionTime?: string;
      doctorId?: number;
      notes?: string;
    },
    notes?: string
  ) => {
    const body = typeof payloadOrRef === "object"
      ? payloadOrRef
      : { patientRef: payloadOrRef, notes };
    return request<{ success: boolean; message: string; status: string; patientRef?: string }>(
      `/api/icu/beds/${bedId}/reserve`,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
  },

  releaseReservation: (bedId: number) =>
    request<{ success: boolean; message: string; status: string }>(`/api/icu/beds/${bedId}/release-reservation`, {
      method: "POST",
    }),

  markMaintenance: (
    bedId: number,
    payloadOrReason?: string | {
      reason?: string;
      staffMember?: string;
      startTime?: string;
      notes?: string;
    }
  ) => {
    const body = typeof payloadOrReason === "object"
      ? payloadOrReason
      : { reason: payloadOrReason };
    return request<{ success: boolean; message: string; status: string }>(`/api/icu/beds/${bedId}/maintenance`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  completeMaintenance: (bedId: number, requiresCleaning: boolean = true) =>
    request<{ success: boolean; message: string; status: string }>(`/api/icu/beds/${bedId}/complete-maintenance`, {
      method: "POST",
      body: JSON.stringify({ requiresCleaning }),
    }),

  transferPatient: (
    bedId: number,
    data: { destinationBedId: number; reason?: string; transferTime?: string }
  ) =>
    request<{ success: boolean; message: string; fromBed: string; toBed: string; patientRef: string }>(
      `/api/icu/beds/${bedId}/transfer`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  assignCleanerToBed: (bedId: number, data: { cleanerId: number; notes?: string }) =>
    request<{ success: boolean; message: string; taskId: number; cleaner: StaffUser }>(
      `/api/icu/beds/${bedId}/assign-cleaner`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  assignCleanerToTask: (taskId: number, data: { cleanerId: number; notes?: string }) =>
    request<{ success: boolean; message: string; taskId: number; cleaner: StaffUser }>(
      `/api/icu/cleaning-tasks/${taskId}/assign`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

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
  getAdmissions: (params?: { status?: string; unitId?: string | number; bedId?: string | number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.unitId) query.set("unitId", String(params.unitId));
    if (params?.bedId) query.set("bedId", String(params.bedId));
    return request<Admission[]>(`/api/icu/admissions?${query.toString()}`);
  },

  getAdmission: (admissionId: number) =>
    request<Admission>(`/api/icu/admissions/${admissionId}`),

  updatePatientCondition: (admissionId: number, data: { condition: string; notes?: string }) =>
    request<{ success: boolean; message: string; admission: Admission }>(
      `/api/icu/admissions/${admissionId}/condition`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),

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

  // Staff Management (Admin)
  getAdminStaff: (params?: { role?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.role) query.set("role", params.role);
    if (params?.search) query.set("search", params.search);
    return request<StaffUser[]>(`/api/icu/admin/staff?${query.toString()}`);
  },

  createStaff: (data: {
    email: string;
    username: string;
    role: UserRole;
    password: string;
    phone?: string;
    department?: string;
    assignedUnitId?: number | null;
  }) =>
    request<{ success: boolean; message: string; staff: StaffUser }>("/api/icu/admin/staff", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateStaff: (
    id: number,
    data: {
      username?: string;
      role?: UserRole;
      phone?: string;
      department?: string;
      assignedUnitId?: number | null;
    }
  ) =>
    request<{ success: boolean; message: string; staff: StaffUser }>(`/api/icu/admin/staff/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  setStaffStatus: (id: number, active: boolean) =>
    request<{ success: boolean; message: string; active: boolean }>(`/api/icu/admin/staff/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    }),

  resetStaffPassword: (id: number, newPassword: string) =>
    request<{ success: boolean; message: string }>(`/api/icu/admin/staff/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    }),

  // Machine Learning LOS Prediction (Authenticated Express Endpoint)
  predictLos: (payload: LosPredictionRequest) =>
    request<LosPredictionResponse>("/api/ml/los-prediction", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getMlHealth: () =>
    request<MlHealthResponse>("/api/ml/health"),

  // Logout
  logout: () =>
    request<{ success: boolean; message: string }>("/api/auth/logout", {
      method: "POST",
    }),
};
