create table if not exists public.roadmap_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  category text not null default 'feature',
  title text not null,
  description text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists idx_roadmap_suggestions_company on public.roadmap_suggestions(company_id);
create index if not exists idx_roadmap_suggestions_user on public.roadmap_suggestions(user_id);

alter table public.roadmap_suggestions enable row level security;

create policy "users insert own suggestions"
on public.roadmap_suggestions for insert
to authenticated
with check (user_id = auth.uid());

create policy "users read own suggestions"
on public.roadmap_suggestions for select
to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'master'));

create policy "master manage suggestions"
on public.roadmap_suggestions for all
to authenticated
using (public.has_role(auth.uid(), 'master'))
with check (public.has_role(auth.uid(), 'master'));