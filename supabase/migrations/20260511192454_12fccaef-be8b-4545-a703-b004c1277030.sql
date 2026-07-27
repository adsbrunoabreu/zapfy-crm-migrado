-- Jornada de trabalho do profissional
ALTER TABLE public.appointment_professionals
  ADD COLUMN IF NOT EXISTS work_start_time time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS work_end_time   time NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS work_days       int[] NOT NULL DEFAULT '{1,2,3,4,5}',
  ADD COLUMN IF NOT EXISTS buffer_minutes  int  NOT NULL DEFAULT 0;

-- Checklist de pauta no agendamento
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS agenda_checklist jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Índice GiST para busca rápida de conflitos por profissional/intervalo
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE INDEX IF NOT EXISTS idx_appointments_pro_range
  ON public.appointments
  USING gist (professional_id, tstzrange(start_at, end_at, '[)'));

-- RPC para checagem de conflitos
CREATE OR REPLACE FUNCTION public.check_appointment_conflict(
  _professional_id uuid,
  _start timestamptz,
  _end timestamptz,
  _exclude uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, title text, start_at timestamptz, end_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.title, a.start_at, a.end_at
  FROM public.appointments a
  WHERE a.professional_id = _professional_id
    AND a.status NOT IN ('cancelled', 'no_show')
    AND (_exclude IS NULL OR a.id <> _exclude)
    AND tstzrange(a.start_at, a.end_at, '[)') && tstzrange(_start, _end, '[)')
  ORDER BY a.start_at
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.check_appointment_conflict(uuid, timestamptz, timestamptz, uuid) TO authenticated;