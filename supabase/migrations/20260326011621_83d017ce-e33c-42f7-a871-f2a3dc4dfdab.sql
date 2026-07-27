
-- Create a sequence for lead numeric IDs
CREATE SEQUENCE IF NOT EXISTS public.leads_numeric_id_seq;

-- Add numeric_id column with default from sequence
ALTER TABLE public.leads ADD COLUMN numeric_id integer NOT NULL DEFAULT nextval('public.leads_numeric_id_seq');

-- Set existing leads' numeric_id based on creation order
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.leads
)
UPDATE public.leads SET numeric_id = numbered.rn
FROM numbered WHERE leads.id = numbered.id;

-- Set sequence to continue from the max value
SELECT setval('public.leads_numeric_id_seq', COALESCE((SELECT MAX(numeric_id) FROM public.leads), 0));

-- Add unique constraint
ALTER TABLE public.leads ADD CONSTRAINT leads_numeric_id_unique UNIQUE (numeric_id);
