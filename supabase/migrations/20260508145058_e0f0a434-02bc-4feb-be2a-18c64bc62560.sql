ALTER TYPE public.lead_activity_type ADD VALUE IF NOT EXISTS 'name_updated';
ALTER TYPE public.lead_activity_type ADD VALUE IF NOT EXISTS 'contact_linked';
ALTER TYPE public.lead_activity_type ADD VALUE IF NOT EXISTS 'contact_changed';
ALTER TYPE public.lead_activity_type ADD VALUE IF NOT EXISTS 'contact_unlinked';