import { supabase } from '@/integrations/supabase/client';
import type {
  MedicalPractice,
  MedicalDoctor,
  MedicalPatient,
  MedicalAppointment,
  MedicalKPIs,
} from '@/types/medical';

// Tabelas medical_* ainda não estão refletidas em types.ts (auto-gerado).
// Cast em `as any` é proposital até a migração ser aplicada.
const db = supabase as any;

export const medicalService = {
  // Practices
  async getPracticeByCompany(companyId: string) {
    const { data, error } = await db
      .from('medical_practices')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) console.error('Error fetching practice:', error);
    return (data ?? null) as MedicalPractice | null;
  },

  async createPractice(practice: Partial<MedicalPractice>) {
    const { data, error } = await db
      .from('medical_practices')
      .insert([practice])
      .select()
      .single();

    if (error) console.error('Error creating practice:', error);
    return data as MedicalPractice;
  },

  // Doctors
  async getDoctorsByPractice(practiceId: string) {
    const { data, error } = await db
      .from('medical_doctors')
      .select('*')
      .eq('practice_id', practiceId)
      .eq('active', true)
      .order('full_name');

    if (error) console.error('Error fetching doctors:', error);
    return (data || []) as MedicalDoctor[];
  },

  // Patients
  async getPatientsByPractice(practiceId: string, limit = 50) {
    const { data, error } = await db
      .from('medical_patients')
      .select('*')
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) console.error('Error fetching patients:', error);
    return (data || []) as MedicalPatient[];
  },

  async getPatientsAtRisk(practiceId: string) {
    const { data, error } = await db
      .from('medical_patients')
      .select('*')
      .eq('practice_id', practiceId)
      .eq('at_risk_flag', true)
      .order('created_at', { ascending: false });

    if (error) console.error('Error fetching at-risk patients:', error);
    return (data || []) as MedicalPatient[];
  },

  // Appointments
  async getAppointmentsByDoctor(doctorId: string, fromDate: string, toDate: string) {
    const { data, error } = await db
      .from('medical_appointments')
      .select('*')
      .eq('doctor_id', doctorId)
      .gte('scheduled_date', fromDate)
      .lte('scheduled_date', toDate)
      .order('scheduled_date');

    if (error) console.error('Error fetching appointments:', error);
    return (data || []) as MedicalAppointment[];
  },

  // KPIs (placeholder — usar useMedicalKPIs hook na UI)
  async getKPIsByPractice(_practiceId: string): Promise<MedicalKPIs> {
    const pair = { current: 0, previous: 0 };
    return {
      period_days: 0,
      daily_revenue: 0,
      doctor_count: 0,
      revenue: { ...pair },
      avg_ticket: { ...pair },
      completed_appointments: { ...pair },
      total_appointments: { ...pair },
      no_show_rate: { ...pair, count: 0 },
      conversion_rate: { ...pair, leads: 0, booked: 0 },
      new_patients: { ...pair },
      occupancy_rate: { ...pair },
    };
  },
};
