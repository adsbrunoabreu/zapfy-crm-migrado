import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

const SELECTED_PIPELINE_KEY = 'pipelines:selectedId';

interface Pipeline { id: string; is_default?: boolean | null; lead_count?: number | null; name?: string }

export function usePipelineSelection(pipelines: Pipeline[] | undefined) {
  const navigate = useNavigate();
  const { pipelineId: routePipelineId } = useParams<{ pipelineId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPipelineId = routePipelineId || searchParams.get('pipeline_id') || searchParams.get('pipelineId') || searchParams.get('pipe_id');
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);

  useEffect(() => {
    if (!pipelines || pipelines.length === 0) return;
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(SELECTED_PIPELINE_KEY) : null;
    const preferred = pipelines.find(p => (p.lead_count ?? 0) > 0) || pipelines.find(p => p.is_default) || pipelines[0];

    if (urlPipelineId && pipelines.some(p => p.id === urlPipelineId)) {
      if (selectedPipelineId !== urlPipelineId) setSelectedPipelineId(urlPipelineId);
      return;
    }

    if (selectedPipelineId && !pipelines.some(p => p.id === selectedPipelineId)) {
      setSelectedPipelineId(preferred.id);
      return;
    }

    const sel = pipelines.find(p => p.id === selectedPipelineId);
    if (sel && (sel.lead_count ?? 0) === 0 && (preferred.lead_count ?? 0) > 0) {
      setSelectedPipelineId(preferred.id);
      return;
    }

    if (!selectedPipelineId) {
      const storedPipeline = stored ? pipelines.find(p => p.id === stored) : null;
      const next = storedPipeline && ((storedPipeline.lead_count ?? 0) > 0 || (preferred.lead_count ?? 0) === 0)
        ? storedPipeline.id
        : preferred.id;
      setSelectedPipelineId(next);
    }
  }, [pipelines, selectedPipelineId, urlPipelineId]);

  useEffect(() => {
    if (selectedPipelineId && typeof window !== 'undefined') {
      window.localStorage.setItem(SELECTED_PIPELINE_KEY, selectedPipelineId);
    }
  }, [selectedPipelineId]);

  useEffect(() => {
    if (!selectedPipelineId) return;
    if (routePipelineId === selectedPipelineId) return;
    if (searchParams.get('pipeline_id') === selectedPipelineId) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('pipeline_id', selectedPipelineId);
    setSearchParams(nextParams, { replace: true });
  }, [routePipelineId, searchParams, selectedPipelineId, setSearchParams]);

  return { selectedPipelineId, setSelectedPipelineId, navigate };
}
