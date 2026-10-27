export type BedStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING" | "MAINTENANCE";

export type CleaningTaskType = "STANDARD" | "DEEP";

export type CleaningTaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

export type AdmissionStatus = "ADMITTED" | "DISCHARGED";

export type UserRole = "ADMIN" | "DOCTOR" | "NURSE" | "HOUSEKEEPING";

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  username?: string;
  assigned_unit_id?: number | null;
  assigned_unit_name?: string | null;
  department?: string | null;
}

export interface IcuUnit {
  id: number;
  name: string;
  capacity: number;
  bed_count?: number;
  totalBeds?: number;
  occupiedBeds?: number;
  availableBeds?: number;
}

export interface StaffUser {
  id: number;
  email: string;
  username?: string;
  role: UserRole;
  active?: boolean;
  phone?: string | null;
  department?: string | null;
  assigned_unit_id?: number | null;
  assigned_unit_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Bed {
  id: number;
  bed_number: string;
  unit_id: number;
  unit_name: string;
  status: BedStatus;
  is_isolation: boolean;
  current_patient_ref: string | null;
  patient_name?: string | null;
  patient_procedure_type?: string | null;
  created_at: string;
  updated_at: string;
  active_admission_id?: number | null;
  admission_time?: string | null;
  expected_discharge_time?: string | null;
  admission_notes?: string | null;
  assigned_doctor_email?: string | null;
  assigned_doctor_name?: string | null;
  active_cleaning_task_id?: number | null;
  cleaning_task_type?: CleaningTaskType | null;
  cleaning_task_status?: CleaningTaskStatus | null;
  cleaning_start_time?: string | null;
  cleaning_created_at?: string | null;
  cleaning_notes?: string | null;
  assigned_cleaner_id?: number | null;
  assigned_cleaner_email?: string | null;
  assigned_cleaner_name?: string | null;
  patient_condition?: string | null;
  assigned_doctor_id?: number | null;
  predicted_los_days?: number | null;
  prediction_status?: string | null;
  prediction_reason?: string | null;
  predicted_free_time?: string | null;
  prediction_updated_at?: string | null;
  prediction_inputs?: Record<string, string> | null;
}

export interface CleaningTask {
  id: number;
  bed_id: number;
  bed_number: string;
  unit_name: string;
  is_isolation: boolean;
  task_type: CleaningTaskType;
  status: CleaningTaskStatus;
  assigned_user_id: number | null;
  assigned_user_email: string | null;
  assigned_user_name?: string | null;
  start_time: string | null;
  completion_time: string | null;
  notes: string | null;
  is_overdue: boolean;
  elapsed_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface Admission {
  id: number;
  patient_ref: string;
  patient_name?: string | null;
  procedure_type?: string | null;
  bed_id: number;
  bed_number: string;
  is_isolation: boolean;
  unit_name: string;
  admission_time: string;
  expected_discharge_time: string | null;
  actual_discharge_time: string | null;
  status: AdmissionStatus;
  condition?: string | null;
  admission_reason?: string | null;
  notes: string | null;
  admitting_doctor_id?: number | null;
  admitting_doctor_email: string | null;
  admitting_doctor_name?: string | null;
  predicted_los_days?: number | null;
  prediction_status?: string | null;
  prediction_reason?: string | null;
  predicted_free_time?: string | null;
  prediction_updated_at?: string | null;
  prediction_inputs?: Record<string, string> | null;
}

export interface DashboardStats {
  totalBeds: number;
  availableBeds: number;
  occupiedBeds: number;
  reservedBeds: number;
  cleaningBeds: number;
  maintenanceBeds: number;
  occupancyRate: number;
  pendingCleaningCount: number;
  inProgressCleaningCount: number;
  overdueCleaningCount: number;
  units: Array<{
    id: number;
    name: string;
    capacity: number;
    totalBeds: number;
    occupiedBeds: number;
    availableBeds: number;
    maintenanceBeds?: number;
  }>;
  timestamp: string;
}

export interface AuditLog {
  id: number;
  user_email: string | null;
  user_role: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: any;
  created_at: string;
}

export interface BedReadinessItem {
  id: number;
  bed_number: string;
  unit_id: number;
  unit_name: string;
  status: BedStatus;
  is_isolation: boolean;
  current_patient_ref: string | null;
  readyNow: boolean;
  estimatedReadyTime: string | null;
  estimatedReadyHours: number;
  reason: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  confidenceExplanation: string;
  category: "AVAILABLE" | "CLEANING_IN_PROGRESS" | "CLEANING_PENDING" | "DISCHARGE_PLANNED" | "OCCUPIED_LONG_STAY" | "RESERVED" | "MAINTENANCE";
  elapsedMinutes?: number;
  taskType?: CleaningTaskType;
  assignedUserEmail?: string | null;
  isOverdue?: boolean;
  predictedTurnoverMinutesRemaining?: number;
  cleaningPredictedCompletion?: string | null;
  estimatedDischargeMinutesRemaining?: number;
  estimatedDischargeTime?: string | null;
}

export interface ReadinessHorizon {
  horizonHours: number;
  label: string;
  count: number;
  netCountAfterSimulatedDemand: number;
  isDeficit: boolean;
  beds: BedReadinessItem[];
}

export interface TurnoverPerformanceBenchmark {
  taskType: CleaningTaskType;
  baselineTargetMinutes: number;
  sampleCount: number;
  averageActualMinutes: number | null;
  varianceMinutes: number | null;
}

export interface RecentTurnoverComparison {
  id: number;
  bed_number: string;
  task_type: CleaningTaskType;
  duration_minutes: number;
  baseline_minutes: number;
  variance_minutes: number;
  completion_time: string;
}

export interface ReadinessResponse {
  summary: {
    totalBeds: number;
    availableNowCount: number;
    cleaningCount: number;
    occupiedCount: number;
    reservedCount: number;
    maintenanceCount: number;
  };
  horizons: {
    window2h: ReadinessHorizon;
    window4h: ReadinessHorizon;
    window8h: ReadinessHorizon;
  };
  capacityWarning: {
    hasWarning: boolean;
    level: "OK" | "WARNING" | "CRITICAL";
    title: string;
    message: string;
    recommendedAction: string;
    thresholdBufferBeds: number;
    projectedNet2h: number;
  };
  scenario: {
    current: "Normal" | "Busy" | "Surge";
    simulatedDemand: number;
    description: string;
    isSimulated: boolean;
  };
  benchmarks: TurnoverPerformanceBenchmark[];
  recentCompletedTurnovers: RecentTurnoverComparison[];
  allBeds: BedReadinessItem[];
  meta: {
    generatedAt: string;
    disclaimer: string;
    modelType: string;
  };
}

export interface ReadinessConfig {
  scenario: "Normal" | "Busy" | "Surge";
  warningBufferBeds: number;
  turnoverTargetMinutesStandard: number;
  turnoverTargetMinutesDeep: number;
  simulatedSurgeDemand: number;
}

export interface LosPredictionRequest {
  patient_id?: number;
  patient_ref?: string;
  procedure_type: string;
  condition: string;
  admission_type: string;
  complications: string;
  icu_unit: string;
  age_group: string;
}

export interface LosPredictionResponse {
  success: boolean;
  predicted_los_days: number;
  model_status: string;
  clinical_use: boolean;
  disclaimer: string;
  is_experimental: boolean;
  warning?: string;
  patient_id?: number;
  patient_ref?: string;
  predicted_free_time?: string | null;
  prediction_status?: string | null;
  prediction_reason?: string | null;
  admission_id?: number | null;
  inputs?: LosPredictionRequest | Record<string, string>;
}

export interface MlHealthResponse {
  status: string;
  service: string;
  model_status: string;
  model_loaded?: boolean;
  data_type: string;
  disclaimer: string;
  is_experimental: boolean;
}

export interface AdmissionResponse {
  success: boolean;
  message: string;
  status: string;
  admissionId?: number;
  patientRef: string;
  patientName?: string | null;
  bedId?: number;
  bedNumber?: string;
  icuUnit?: string;
  admittingDoctorId?: number;
  assignedDoctorName?: string;
  admissionTime?: string;
  condition?: string;
  diagnosis?: string;
  admissionType?: string;
  complications?: string;
  predictedLosDays?: number | null;
  predictionStatus?: string | null;
  predictionReason?: string | null;
  predictedFreeTime?: string | null;
}

export interface AdminAdmitPayload {
  patientName: string;
  patientRef?: string;
  bedId: number;
  doctorId: number;
  icuUnit?: string;
  procedureType?: string;
  condition?: string;
  diagnosis?: string;
  admissionReason?: string;
  admissionType?: string;
  complications?: string;
  ageGroup?: string;
  notes?: string;
  expectedDischargeHours?: number;
}

