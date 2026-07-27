/**
 * Hooks CRUD para os catálogos da vertical médica:
 * convênios, hospitais/clínicas, médicos e procedimentos.
 *
 * Todos escoam por company_id (RLS) e usam staleTime de 5min.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMyMedicalPractice } from './useMedicalPractice';

// ---------- tipos ----------
export interface MedicalInsurance {
  id: string;
  company_id: string;
  practice_id: string | null;
  name: string;
  ans_code: string | null;
  modality: string | null;
  coverage_scope: string | null;
  contact_phone: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MedicalFacility {
  id: string;
  company_id: string;
  practice_id: string | null;
  name: string;
  kind: 'hospital' | 'clinic';
  cnpj: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MedicalDoctorFull {
  id: string;
  company_id: string;
  practice_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  professional_registry: string | null;
  specialization: string | null;
  active: boolean;
  created_at: string;
}

export interface MedicalProcedureFull {
  id: string;
  company_id: string;
  practice_id: string;
  name: string;
  category: string | null;
  base_price: number;
  duration_minutes: number | null;
  active: boolean;
  created_at: string;
}

const STALE = 5 * 60 * 1000;

/** Ordenação alfabética estável com colação pt-BR (acentos não atrapalham). */
function sortByName<T>(arr: T[], getName: (item: T) => string): T[] {
  return [...arr].sort((a, b) =>
    getName(a).localeCompare(getName(b), 'pt-BR', { sensitivity: 'base' }),
  );
}

function useCtx() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { data: practice } = useMyMedicalPractice(companyId);
  return { companyId, practiceId: practice?.id ?? null };
}

// ============ Insurances ============
export function useMedicalInsurances(opts?: { onlyActive?: boolean }) {
  const { companyId } = useCtx();
  const onlyActive = opts?.onlyActive ?? false;
  return useQuery({
    queryKey: ['medical-insurances', companyId, onlyActive],
    enabled: !!companyId,
    staleTime: STALE,
    queryFn: async () => {
      let q = (supabase as any)
        .from('medical_insurances')
        .select('*')
        .eq('company_id', companyId)
        .order('name')
        .limit(500);
      if (onlyActive) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) throw error;
      return sortByName((data ?? []) as MedicalInsurance[], (r) => r.name);
    },
  });
}

export function useUpsertMedicalInsurance() {
  const qc = useQueryClient();
  const { companyId, practiceId } = useCtx();
  return useMutation({
    mutationFn: async (input: Partial<MedicalInsurance> & { id?: string }) => {
      if (!companyId) throw new Error('Empresa não encontrada');
      const payload: any = {
        company_id: companyId,
        practice_id: input.practice_id ?? practiceId,
        name: input.name?.trim(),
        ans_code: input.ans_code || null,
        modality: input.modality || null,
        coverage_scope: input.coverage_scope || null,
        contact_phone: input.contact_phone || null,
        notes: input.notes || null,
        active: input.active ?? true,
      };
      if (input.id) {
        const { id, ...patch } = { ...input };
        const { error } = await (supabase as any)
          .from('medical_insurances')
          .update(patch)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('medical_insurances').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medical-insurances'] }),
  });
}

export function useDeleteMedicalInsurance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('medical_insurances').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medical-insurances'] }),
  });
}

// ============ Facilities ============
export function useMedicalFacilities(opts?: { onlyActive?: boolean }) {
  const { companyId } = useCtx();
  const onlyActive = opts?.onlyActive ?? false;
  return useQuery({
    queryKey: ['medical-facilities', companyId, onlyActive],
    enabled: !!companyId,
    staleTime: STALE,
    queryFn: async () => {
      let q = (supabase as any)
        .from('medical_facilities')
        .select('*')
        .eq('company_id', companyId)
        .order('name')
        .limit(500);
      if (onlyActive) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) throw error;
      return sortByName((data ?? []) as MedicalFacility[], (r) => r.name);
    },
  });
}

export function useUpsertMedicalFacility() {
  const qc = useQueryClient();
  const { companyId, practiceId } = useCtx();
  return useMutation({
    mutationFn: async (input: Partial<MedicalFacility> & { id?: string }) => {
      if (!companyId) throw new Error('Empresa não encontrada');
      const base: any = {
        company_id: companyId,
        practice_id: input.practice_id ?? practiceId,
        name: input.name?.trim(),
        kind: input.kind ?? 'clinic',
        cnpj: input.cnpj || null,
        phone: input.phone || null,
        address: input.address || null,
        city: input.city || null,
        state: input.state || null,
        notes: input.notes || null,
        active: input.active ?? true,
      };
      if (input.id) {
        const { error } = await (supabase as any)
          .from('medical_facilities')
          .update(base)
          .eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('medical_facilities').insert(base);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medical-facilities'] }),
  });
}

export function useDeleteMedicalFacility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('medical_facilities').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medical-facilities'] }),
  });
}

// ============ Doctors (CRUD completo) ============
export function useMedicalDoctorsFull() {
  const { companyId, practiceId } = useCtx();
  return useQuery({
    queryKey: ['medical-doctors-full', companyId, practiceId],
    enabled: !!companyId && !!practiceId,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('medical_doctors')
        .select('id, company_id, practice_id, full_name, email, phone, professional_registry, specialization, active, created_at')
        .eq('company_id', companyId)
        .order('full_name')
        .limit(500);
      if (error) throw error;
      return sortByName((data ?? []) as MedicalDoctorFull[], (r) => r.full_name);
    },
  });
}

export function useUpsertMedicalDoctor() {
  const qc = useQueryClient();
  const { companyId, practiceId } = useCtx();
  return useMutation({
    mutationFn: async (input: Partial<MedicalDoctorFull> & { id?: string }) => {
      if (!companyId || !practiceId) throw new Error('Clínica não encontrada');
      const base: any = {
        company_id: companyId,
        practice_id: practiceId,
        full_name: input.full_name?.trim(),
        email: input.email || null,
        phone: input.phone || null,
        professional_registry: input.professional_registry || null,
        specialization: input.specialization || null,
        active: input.active ?? true,
      };
      if (input.id) {
        const { error } = await (supabase as any)
          .from('medical_doctors')
          .update(base)
          .eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('medical_doctors').insert(base);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medical-doctors-full'] });
      qc.invalidateQueries({ queryKey: ['medical-doctors'] });
    },
  });
}

export function useDeleteMedicalDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('medical_doctors').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medical-doctors-full'] });
      qc.invalidateQueries({ queryKey: ['medical-doctors'] });
    },
  });
}

// ============ Procedures (CRUD completo) ============
export function useMedicalProceduresFull() {
  const { companyId, practiceId } = useCtx();
  return useQuery({
    queryKey: ['medical-procedures-full', companyId, practiceId],
    enabled: !!companyId && !!practiceId,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('medical_procedures')
        .select('id, company_id, practice_id, name, category, base_price, duration_minutes, active, created_at')
        .eq('company_id', companyId)
        .order('name')
        .limit(500);
      if (error) throw error;
      return sortByName((data ?? []) as MedicalProcedureFull[], (r) => r.name);
    },
  });
}

export function useUpsertMedicalProcedure() {
  const qc = useQueryClient();
  const { companyId, practiceId } = useCtx();
  return useMutation({
    mutationFn: async (input: Partial<MedicalProcedureFull> & { id?: string }) => {
      if (!companyId || !practiceId) throw new Error('Clínica não encontrada');
      const base: any = {
        company_id: companyId,
        practice_id: practiceId,
        name: input.name?.trim(),
        category: input.category || null,
        base_price: input.base_price ?? 0,
        duration_minutes: input.duration_minutes ?? 30,
        active: input.active ?? true,
      };
      if (input.id) {
        const { error } = await (supabase as any)
          .from('medical_procedures')
          .update(base)
          .eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('medical_procedures').insert(base);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medical-procedures-full'] });
      qc.invalidateQueries({ queryKey: ['medical-procedures'] });
    },
  });
}

export function useDeleteMedicalProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('medical_procedures').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medical-procedures-full'] });
      qc.invalidateQueries({ queryKey: ['medical-procedures'] });
    },
  });
}

export interface BulkProcedureRow {
  name: string;
  category?: string | null;
  base_price?: number;
  duration_minutes?: number;
  active?: boolean;
}

export function useBulkImportMedicalProcedures() {
  const qc = useQueryClient();
  const { companyId, practiceId } = useCtx();
  return useMutation({
    mutationFn: async (rows: BulkProcedureRow[]) => {
      if (!companyId || !practiceId) throw new Error('Clínica não encontrada');
      if (!rows.length) return { inserted: 0 };
      const payload = rows.map((r) => ({
        company_id: companyId,
        practice_id: practiceId,
        name: r.name.trim(),
        category: r.category?.toString().trim() || null,
        base_price: Number(r.base_price ?? 0) || 0,
        duration_minutes: Number(r.duration_minutes ?? 30) || 30,
        active: r.active ?? true,
      }));
      const CHUNK = 200;
      let inserted = 0;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const slice = payload.slice(i, i + CHUNK);
        const { error } = await (supabase as any).from('medical_procedures').insert(slice);
        if (error) throw error;
        inserted += slice.length;
      }
      return { inserted };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medical-procedures-full'] });
      qc.invalidateQueries({ queryKey: ['medical-procedures'] });
    },
  });
}
