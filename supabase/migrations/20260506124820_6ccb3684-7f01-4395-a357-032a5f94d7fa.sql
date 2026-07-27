create or replace function public.get_evolution_proxy_metrics(
  _hours integer default 24,
  _company_id uuid default null
)
returns table (
  company_id uuid,
  company_name text,
  instance_name text,
  total_calls bigint,
  errors bigint,
  not_found bigint,
  server_errors bigint,
  rate_limited bigint,
  network_errors bigint,
  error_rate numeric,
  not_found_rate numeric,
  server_error_rate numeric,
  avg_latency_ms numeric,
  p95_latency_ms numeric,
  last_event_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with src as (
    select
      sl.company_id,
      sl.instance_name,
      sl.level,
      coalesce((sl.metadata->>'status')::int, 0) as status,
      sl.metadata->>'statusClass' as status_class,
      coalesce((sl.metadata->>'latencyMs')::numeric, 0) as latency_ms,
      sl.created_at
    from public.system_logs sl
    where sl.source = 'evolution-proxy'
      and sl.created_at >= now() - make_interval(hours => greatest(_hours, 1))
      and (_company_id is null or sl.company_id = _company_id)
      and (public.is_master(auth.uid()) or sl.company_id = public.get_user_company_id(auth.uid()))
  )
  select
    s.company_id,
    c.name as company_name,
    coalesce(s.instance_name, '(sem instância)') as instance_name,
    count(*)::bigint as total_calls,
    count(*) filter (where s.level in ('error','warn'))::bigint as errors,
    count(*) filter (where s.status_class = '404')::bigint as not_found,
    count(*) filter (where s.status_class = '5xx')::bigint as server_errors,
    count(*) filter (where s.status_class = 'rate_limited')::bigint as rate_limited,
    count(*) filter (where s.status_class = 'network_error')::bigint as network_errors,
    round(100.0 * count(*) filter (where s.level in ('error','warn'))::numeric / nullif(count(*),0), 2) as error_rate,
    round(100.0 * count(*) filter (where s.status_class = '404')::numeric / nullif(count(*),0), 2) as not_found_rate,
    round(100.0 * count(*) filter (where s.status_class = '5xx')::numeric / nullif(count(*),0), 2) as server_error_rate,
    round(avg(s.latency_ms) filter (where s.latency_ms > 0), 1) as avg_latency_ms,
    round(percentile_cont(0.95) within group (order by s.latency_ms) filter (where s.latency_ms > 0)::numeric, 1) as p95_latency_ms,
    max(s.created_at) as last_event_at
  from src s
  left join public.companies c on c.id = s.company_id
  group by s.company_id, c.name, s.instance_name
  order by total_calls desc
$$;

grant execute on function public.get_evolution_proxy_metrics(integer, uuid) to authenticated;