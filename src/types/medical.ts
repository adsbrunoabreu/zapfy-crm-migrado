// Medical Vertical - Tipos base
export enum CRMType {
  CLINIC = 'clinic',
  DENTAL = 'dental',
  SURGERY = 'surgery',
  HOSPITAL = 'hospital',
  CONSULTATION = 'consultation',
}

export enum BusinessModel {
  FEE_BASED = 'fee-based',
  INSURANCE = 'insurance',
  HYBRID = 'hybrid',
}

export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  NO_SHOW = 'no_show',
  CANCELLED = 'cancelled',
  RESCHEDULED = 'rescheduled',
}

export enum PaymentStatus {
  PENDING = 'pending',
  RECEIVED = 'received',
  OVERDUE = 'overdue',
  REFUNDED = 'refunded',
  PARTIAL = 'partial',
}

export enum PatientStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  AT_RISK = 'at_risk',
  VIP = 'vip',
  CANCELLED = 'cancelled',
}

export enum InsightType {
  ALERT = 'alert',
  RECOMMENDATION = 'recommendation',
  ANOMALY = 'anomaly',
  PREDICTION = 'prediction',
}

export enum InsightSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export interface MedicalPractice {
  id: string;
  company_id: string;
  crm_type: CRMType;
  business_model: BusinessModel;
  practice_name: string;
  cnpj?: string;
  city?: string;
  state?: string;
  billing_provider?: string;
  whatsapp_integration_enabled: boolean;
  appointment_reminders_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface MedicalDoctor {
  id: string;
  practice_id: string;
  company_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
  professional_registry?: string;
  specialization?: string;
  bio?: string;
  avg_ticket_price: number;
  total_revenue: number;
  total_appointments: number;
  active: boolean;
  hire_date?: string;
  created_at: string;
  updated_at: string;
}

export interface MedicalPatient {
  id: string;
  practice_id: string;
  company_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  date_of_birth?: string;
  gender?: string;
  allergies?: string;
  medical_history?: string;
  first_appointment_date?: string;
  last_appointment_date?: string;
  total_appointments: number;
  lifetime_value: number;
  status: PatientStatus;
  at_risk_flag: boolean;
  at_risk_reason?: string;
  recurrence_rate: number;
  created_at: string;
  updated_at: string;
}

export interface MedicalProcedure {
  id: string;
  practice_id: string;
  company_id: string;
  name: string;
  description?: string;
  category?: string;
  base_price: number;
  duration_minutes: number;
  total_performed: number;
  avg_rating: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MedicalAppointment {
  id: string;
  practice_id: string;
  company_id: string;
  doctor_id: string;
  patient_id: string;
  procedure_id?: string;
  scheduled_date: string;
  duration_minutes: number;
  status: AppointmentStatus;
  price?: number;
  payment_status: PaymentStatus;
  notes?: string;
  follow_up_needed: boolean;
  follow_up_date?: string;
  source?: string;
  created_at: string;
  updated_at: string;
}

export interface MedicalPayment {
  id: string;
  practice_id: string;
  company_id: string;
  appointment_id?: string;
  patient_id: string;
  doctor_id?: string;
  amount: number;
  payment_method?: string;
  payment_status: PaymentStatus;
  issue_date: string;
  due_date?: string;
  received_date?: string;
  external_payment_id?: string;
  payment_provider?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MedicalMarketing {
  id: string;
  practice_id: string;
  company_id: string;
  patient_id?: string;
  source: string;
  campaign_name?: string;
  campaign_id?: string;
  lead_received_date: string;
  appointment_booked_date?: string;
  appointment_completed_date?: string;
  appointment_booked: boolean;
  appointment_completed: boolean;
  campaign_cost: number;
  revenue_generated: number;
  roi: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MedicalKPIPair {
  current: number;
  previous: number;
}

export interface MedicalKPIs {
  period_days: number;
  daily_revenue: number;
  doctor_count: number;
  revenue: MedicalKPIPair;
  avg_ticket: MedicalKPIPair;
  completed_appointments: MedicalKPIPair;
  total_appointments: MedicalKPIPair;
  no_show_rate: MedicalKPIPair & { count: number };
  conversion_rate: MedicalKPIPair & { leads: number; booked: number };
  new_patients: MedicalKPIPair;
  occupancy_rate: MedicalKPIPair;
}

export interface MedicalInsight {
  id: string;
  practice_id: string;
  company_id: string;
  insight_type: InsightType;
  severity: InsightSeverity;
  title: string;
  description?: string;
  action_suggested?: string;
  related_doctor_id?: string;
  related_patient_id?: string;
  dismissed: boolean;
  dismissed_at?: string;
  action_taken: boolean;
  action_taken_at?: string;
  created_at: string;
  expires_at?: string;
}
