
-- Drop the old unique index that only allows ONE active instance per user
DROP INDEX IF EXISTS idx_user_whatsapp_instances_active;

-- Create new unique index allowing multiple active instances, but preventing duplicate user+instance combos
CREATE UNIQUE INDEX idx_user_whatsapp_instances_active 
ON public.user_whatsapp_instances (user_id, whatsapp_instance_id) 
WHERE (is_active = true);
