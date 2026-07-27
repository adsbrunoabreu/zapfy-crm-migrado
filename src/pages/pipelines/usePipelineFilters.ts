import { useState, useMemo, useDeferredValue, useCallback } from 'react';
import { DEFAULT_PRESETS, type DateRange } from '@/components/ui/date-range-picker';
import type { StageWithLeads } from '@/hooks/usePipelines';
import { appRangeToUtc, getAppRangeForPreset } from '@/lib/appDate';

const RELATIVE_PRESET_KEYS = new Set(DEFAULT_PRESETS.map((p) => p.key));

export interface PipelineFilters {
  searchQuery: string;
  tagIds: string[];
  assignedTo: string | null;
  doctorId: string | null;
  procedureId: string | null;
  minValue: string;
  maxValue: string;
  dateRange: DateRange | null;
  datePresetKey: string | undefined;
}

const DEFAULT_DATE_PRESET = DEFAULT_PRESETS.find((p) => p.key === '7d')!;

function buildDefaultFilters(): PipelineFilters {
  return {
    searchQuery: '',
    tagIds: [],
    assignedTo: null,
    doctorId: null,
    procedureId: null,
    minValue: '',
    maxValue: '',
    dateRange: DEFAULT_DATE_PRESET.getRange(),
    datePresetKey: DEFAULT_DATE_PRESET.key,
  };
}

export const defaultPipelineFilters: PipelineFilters = buildDefaultFilters();


export function usePipelineFilters(stages: StageWithLeads[] | undefined) {
  const [filters, setFilters] = useState<PipelineFilters>(() => buildDefaultFilters());

  // Date filter é sempre considerado padrão do pipeline (7d), por isso não conta como filtro ativo
  const activeFiltersCount = [
    filters.searchQuery !== '',
    filters.tagIds.length > 0,
    filters.assignedTo !== null,
    filters.doctorId !== null,
    filters.procedureId !== null,
    filters.minValue !== '',
    filters.maxValue !== '',
  ].filter(Boolean).length;

  const clearFilters = useCallback(() => setFilters(buildDefaultFilters()), []);

  const toggleTag = useCallback((tagId: string) => {
    setFilters(prev => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId) ? prev.tagIds.filter(id => id !== tagId) : [...prev.tagIds, tagId],
    }));
  }, []);

  const deferredSearch = useDeferredValue(filters.searchQuery);

  const filteredStages = useMemo(() => {
    if (!stages) return undefined;
    const q = deferredSearch.trim().toLowerCase();
    const minVal = filters.minValue ? parseFloat(filters.minValue) : null;
    const maxVal = filters.maxValue ? parseFloat(filters.maxValue) : null;
    // Para presets relativos (hoje/7d/30d/…), SEMPRE recalcula com base no
    // calendário do app (America/Sao_Paulo). Evita que o range fique congelado
    // se a página foi aberta antes da virada do dia.
    const effectiveRange =
      filters.datePresetKey && RELATIVE_PRESET_KEYS.has(filters.datePresetKey)
        ? getAppRangeForPreset(filters.datePresetKey)
        : filters.dateRange ?? null;
    const dateUtc = effectiveRange?.from && effectiveRange?.to ? appRangeToUtc(effectiveRange) : null;
    const fromTs = dateUtc?.from.getTime() ?? null;
    const toTs = dateUtc?.to.getTime() ?? null;
    return stages.map(stage => ({
      ...stage,
      leads: stage.leads.filter(lead => {
        const matchesSearch = !q || lead.name.toLowerCase().includes(q);
        const matchesTags = filters.tagIds.length === 0 || lead.tags?.some(tag => filters.tagIds.includes(tag.id));
        const matchesAssignedTo = !filters.assignedTo ||
          (filters.assignedTo === 'unassigned' ? !lead.assigned_to : lead.assigned_to === filters.assignedTo);
        const matchesDoctor = !filters.doctorId ||
          (filters.doctorId === 'none' ? !lead.medical_doctor_id : lead.medical_doctor_id === filters.doctorId);
        const matchesProcedure = !filters.procedureId ||
          (filters.procedureId === 'none'
            ? !lead.medical_procedure_id && (!lead.procedures || lead.procedures.length === 0)
            : lead.medical_procedure_id === filters.procedureId ||
              !!lead.procedures?.some(p => p.id === filters.procedureId));
        const v = lead.value ?? 0;
        const matchesMinValue = minVal === null || v >= minVal;
        const matchesMaxValue = maxVal === null || v <= maxVal;
        let matchesDate = true;
        if (fromTs !== null || toTs !== null) {
          const ts = lead.created_at ? new Date(lead.created_at).getTime() : null;
          if (ts === null) matchesDate = false;
          else {
            if (fromTs !== null && ts < fromTs) matchesDate = false;
            if (toTs !== null && ts > toTs) matchesDate = false;
          }
        }
        return matchesSearch && matchesTags && matchesAssignedTo && matchesDoctor && matchesProcedure && matchesMinValue && matchesMaxValue && matchesDate;
      }),
    }));
  }, [stages, deferredSearch, filters.tagIds, filters.assignedTo, filters.doctorId, filters.procedureId, filters.minValue, filters.maxValue, filters.dateRange, filters.datePresetKey]);

  return { filters, setFilters, activeFiltersCount, clearFilters, toggleTag, filteredStages };
}
