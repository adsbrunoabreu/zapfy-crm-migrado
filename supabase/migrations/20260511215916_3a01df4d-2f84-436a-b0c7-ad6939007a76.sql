ALTER TABLE public.roadmap_items
  ADD COLUMN IF NOT EXISTS progress SMALLINT NOT NULL DEFAULT 0
  CHECK (progress >= 0 AND progress <= 100);

-- Backfill: itens "done" → 100%, "soon" → 0%, "in_progress" → 50% inicial
UPDATE public.roadmap_items SET progress = 100 WHERE status = 'done' AND progress = 0;
UPDATE public.roadmap_items SET progress = 50 WHERE status = 'in_progress' AND progress = 0;