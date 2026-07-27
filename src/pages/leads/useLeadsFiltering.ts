import { useMemo, useState, useCallback } from 'react';
import type { Lead } from '@/hooks/useLeads';
import { defaultFilters, LeadFilters, SortKey } from './constants';

export function useLeadsFiltering(leads: Lead[] | undefined) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<LeadFilters>(defaultFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const ITEMS_PER_PAGE = 25;

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDir('asc');
      return key;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(defaultFilters);
    setCurrentPage(1);
  }, []);

  const toggleStatus = useCallback((status: string) => {
    setFilters(prev => ({
      ...prev,
      status: prev.status.includes(status) ? prev.status.filter(s => s !== status) : [...prev.status, status],
    }));
    setCurrentPage(1);
  }, []);

  const activeFiltersCount = [
    filters.status.length > 0,
    filters.pipelineId !== null,
    filters.assignedTo !== null,
    filters.minValue !== '',
    filters.maxValue !== '',
    filters.dateFrom !== null,
    filters.dateTo !== null,
  ].filter(Boolean).length;

  const allFilteredLeads = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const minVal = filters.minValue ? parseFloat(filters.minValue) : null;
    const maxVal = filters.maxValue ? parseFloat(filters.maxValue) : null;
    const toDate = filters.dateTo ? new Date(new Date(filters.dateTo).setHours(23, 59, 59)) : null;
    return (leads || []).filter((lead) => {
      const matchesSearch =
        lead.name.toLowerCase().includes(q) ||
        (lead.email?.toLowerCase().includes(q)) ||
        (lead.phone?.includes(searchQuery));
      const matchesStatus = filters.status.length === 0 || filters.status.includes(lead.status);
      const matchesPipeline = !filters.pipelineId || lead.pipeline_id === filters.pipelineId;
      const matchesAssignedTo = !filters.assignedTo ||
        (filters.assignedTo === 'unassigned' ? !lead.assigned_to : lead.assigned_to === filters.assignedTo);
      const matchesMinValue = minVal === null || (lead.value && lead.value >= minVal);
      const matchesMaxValue = maxVal === null || (lead.value && lead.value <= maxVal);
      const leadDate = new Date(lead.created_at);
      const matchesDateFrom = !filters.dateFrom || leadDate >= filters.dateFrom;
      const matchesDateTo = !toDate || leadDate <= toDate;
      return matchesSearch && matchesStatus && matchesPipeline && matchesAssignedTo && matchesMinValue && matchesMaxValue && matchesDateFrom && matchesDateTo;
    }).sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'code': return dir * (((a as any).tenant_seq || 0) - ((b as any).tenant_seq || 0));
        case 'name': return dir * a.name.localeCompare(b.name, 'pt-BR');
        case 'pipeline': return dir * (a.pipeline?.name || '').localeCompare(b.pipeline?.name || '', 'pt-BR');
        case 'stage': return dir * (a.stage?.name || '').localeCompare(b.stage?.name || '', 'pt-BR');
        case 'assignee': return dir * (a.assignee?.full_name || a.assignee?.email || '').localeCompare(b.assignee?.full_name || b.assignee?.email || '', 'pt-BR');
        case 'value': return dir * ((a.value || 0) - (b.value || 0));
        case 'status': return dir * a.status.localeCompare(b.status, 'pt-BR');
        case 'created_at': return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        default: return 0;
      }
    });
  }, [leads, searchQuery, filters, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(allFilteredLeads.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const filteredLeads = allFilteredLeads.slice((safeCurrentPage - 1) * ITEMS_PER_PAGE, safeCurrentPage * ITEMS_PER_PAGE);

  return {
    searchQuery, setSearchQuery,
    filters, setFilters,
    currentPage: safeCurrentPage, setCurrentPage,
    totalPages, ITEMS_PER_PAGE,
    sortKey, sortDir, toggleSort,
    clearFilters, toggleStatus, activeFiltersCount,
    allFilteredLeads, filteredLeads,
  };
}
