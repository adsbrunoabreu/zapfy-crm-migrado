create table if not exists public.whatsapp_hsm_template_var_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  template_name text not null,
  language text not null,
  header_tokens text[] not null default '{}',
  body_tokens text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, instance_id, template_name, language)
);

create index if not exists idx_hsm_var_mappings_lookup
  on public.whatsapp_hsm_template_var_mappings (instance_id, template_name, language);

alter table public.whatsapp_hsm_template_var_mappings enable row level security;

create policy "company members can read hsm var mappings"
  on public.whatsapp_hsm_template_var_mappings
  for select to authenticated
  using (public.is_master(auth.uid()) or company_id = public.get_user_company_id(auth.uid()));

create policy "company members can insert hsm var mappings"
  on public.whatsapp_hsm_template_var_mappings
  for insert to authenticated
  with check (public.is_master(auth.uid()) or company_id = public.get_user_company_id(auth.uid()));

create policy "company members can update hsm var mappings"
  on public.whatsapp_hsm_template_var_mappings
  for update to authenticated
  using (public.is_master(auth.uid()) or company_id = public.get_user_company_id(auth.uid()))
  with check (public.is_master(auth.uid()) or company_id = public.get_user_company_id(auth.uid()));

create policy "company members can delete hsm var mappings"
  on public.whatsapp_hsm_template_var_mappings
  for delete to authenticated
  using (public.is_master(auth.uid()) or company_id = public.get_user_company_id(auth.uid()));

create or replace function public.tg_hsm_var_mappings_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_hsm_var_mappings_touch on public.whatsapp_hsm_template_var_mappings;
create trigger trg_hsm_var_mappings_touch
  before update on public.whatsapp_hsm_template_var_mappings
  for each row execute function public.tg_hsm_var_mappings_touch();