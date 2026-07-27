-- 1. Rename existing enum values (preserves OID, so policies keep working)
ALTER TYPE public.app_role RENAME VALUE 'company_admin' TO 'admin';
ALTER TYPE public.app_role RENAME VALUE 'user' TO 'agente';

-- 2. Add new enum values
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'financeiro';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor';

-- 3. Update default
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'agente'::public.app_role;

-- 4. Recreate is_company_admin (semantics unchanged: master + admin)
CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('master', 'admin')
  )
$$;

-- 5. Manager helper (master + admin + gestor) — operational write access
CREATE OR REPLACE FUNCTION public.is_company_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('master', 'admin', 'gestor')
  )
$$;

-- 6. Finance helper (master + admin + financeiro)
CREATE OR REPLACE FUNCTION public.is_company_finance(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('master', 'admin', 'financeiro')
  )
$$;

-- 7. Read-all helper for a given company (master + admin + gestor + financeiro of same tenant)
CREATE OR REPLACE FUNCTION public.can_read_company_data(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = _user_id
      AND (
        ur.role::text = 'master'
        OR (p.company_id = _company_id AND ur.role::text IN ('admin', 'gestor', 'financeiro'))
      )
  )
$$;
