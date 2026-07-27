
-- =========================================================
-- 1) get_database_overview() — visão global do banco
-- =========================================================
create or replace function public.get_database_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_total_size bigint;
  v_table_count int;
  v_active_conns int;
  v_top_tables jsonb;
  v_dead_tuples_total bigint;
begin
  if not public.has_role(auth.uid(), 'master'::public.app_role) then
    raise exception 'forbidden';
  end if;

  select pg_database_size(current_database()) into v_total_size;

  select count(*) into v_table_count
  from pg_stat_user_tables
  where schemaname = 'public';

  select count(*) into v_active_conns
  from pg_stat_activity
  where datname = current_database() and state = 'active';

  select coalesce(sum(n_dead_tup), 0) into v_dead_tuples_total
  from pg_stat_user_tables
  where schemaname = 'public';

  select jsonb_agg(t order by t.total_bytes desc)
    into v_top_tables
  from (
    select
      c.relname as table_name,
      pg_total_relation_size(c.oid) as total_bytes,
      pg_relation_size(c.oid) as table_bytes,
      pg_indexes_size(c.oid) as index_bytes,
      coalesce(s.n_live_tup, 0)::bigint as live_rows,
      coalesce(s.n_dead_tup, 0)::bigint as dead_rows,
      case
        when coalesce(s.n_live_tup, 0) + coalesce(s.n_dead_tup, 0) = 0 then 0
        else round((coalesce(s.n_dead_tup,0)::numeric / nullif(coalesce(s.n_live_tup,0) + coalesce(s.n_dead_tup,0), 0)) * 100, 1)
      end as bloat_pct
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
    order by pg_total_relation_size(c.oid) desc
    limit 15
  ) t;

  return jsonb_build_object(
    'total_bytes', v_total_size,
    'table_count', v_table_count,
    'active_connections', v_active_conns,
    'dead_tuples_total', v_dead_tuples_total,
    'top_tables', coalesce(v_top_tables, '[]'::jsonb),
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_database_overview() from public, anon;
grant execute on function public.get_database_overview() to authenticated;

-- =========================================================
-- 2) get_company_usage_overview() — consumo por empresa
-- =========================================================
create or replace function public.get_company_usage_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_rows jsonb;
  v_total_media bigint;
begin
  if not public.has_role(auth.uid(), 'master'::public.app_role) then
    raise exception 'forbidden';
  end if;

  with media as (
    select split_part(name, '/', 1) as company_id,
           sum(coalesce((metadata->>'size')::bigint, 0)) as media_bytes
    from storage.objects
    where bucket_id = 'chat-media'
    group by 1
  ),
  per_company as (
    select
      c.id as company_id,
      c.name as company_name,
      c.status as company_status,
      coalesce(p.name, '—') as plan_name,
      (select count(*) from public.leads l where l.company_id = c.id) as leads_count,
      (select count(*) from public.messages m where m.company_id = c.id) as messages_count,
      (select count(*) from public.conversations cv where cv.company_id = c.id) as conversations_count,
      (select count(*) from public.appointments a where a.company_id = c.id) as appointments_count,
      coalesce((select count(*) from public.store_products sp where sp.company_id = c.id), 0) as products_count,
      coalesce((select count(*) from public.store_orders so where so.company_id = c.id), 0) as orders_count,
      coalesce((select count(*) from public.system_logs sl where sl.company_id = c.id), 0) as logs_count,
      coalesce((
        select coalesce(media_bytes, 0)::bigint
        from media md where md.company_id::uuid = c.id
      ), 0) as media_bytes
    from public.companies c
    left join public.subscriptions s on s.company_id = c.id and s.status in ('active','trialing','past_due')
    left join public.subscription_plans p on p.id = s.plan_id
  )
  select jsonb_agg(
    jsonb_build_object(
      'company_id', company_id,
      'company_name', company_name,
      'company_status', company_status,
      'plan_name', plan_name,
      'leads_count', leads_count,
      'messages_count', messages_count,
      'conversations_count', conversations_count,
      'appointments_count', appointments_count,
      'products_count', products_count,
      'orders_count', orders_count,
      'logs_count', logs_count,
      'media_bytes', media_bytes,
      'estimated_total_bytes',
        -- estimativa simples: bytes médios por linha em cada domínio
        (leads_count * 2048)
        + (messages_count * 1024)
        + (conversations_count * 512)
        + (appointments_count * 1024)
        + (products_count * 4096)
        + (orders_count * 2048)
        + (logs_count * 512)
        + media_bytes
    )
    order by (
      (leads_count * 2048)
      + (messages_count * 1024)
      + (conversations_count * 512)
      + (appointments_count * 1024)
      + (products_count * 4096)
      + (orders_count * 2048)
      + (logs_count * 512)
      + media_bytes
    ) desc
  ) into v_rows
  from per_company;

  select coalesce(sum(coalesce((metadata->>'size')::bigint, 0)), 0)
    into v_total_media
  from storage.objects where bucket_id = 'chat-media';

  return jsonb_build_object(
    'companies', coalesce(v_rows, '[]'::jsonb),
    'total_media_bytes', v_total_media,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_company_usage_overview() from public, anon;
grant execute on function public.get_company_usage_overview() to authenticated;

-- =========================================================
-- 3) get_company_growth(company_id, days) — série temporal
-- =========================================================
create or replace function public.get_company_growth(_company_id uuid, _days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_series jsonb;
  v_start timestamptz;
begin
  if not public.has_role(auth.uid(), 'master'::public.app_role) then
    raise exception 'forbidden';
  end if;

  if _days is null or _days <= 0 then
    _days := 30;
  end if;
  if _days > 180 then
    _days := 180;
  end if;

  v_start := date_trunc('day', now()) - make_interval(days => _days - 1);

  with days as (
    select generate_series(v_start, date_trunc('day', now()), interval '1 day')::date as d
  ),
  l as (
    select date_trunc('day', created_at)::date as d, count(*) as c
    from public.leads
    where company_id = _company_id and created_at >= v_start
    group by 1
  ),
  m as (
    select date_trunc('day', created_at)::date as d, count(*) as c
    from public.messages
    where company_id = _company_id and created_at >= v_start
    group by 1
  ),
  o as (
    select date_trunc('day', created_at)::date as d, count(*) as c
    from public.store_orders
    where company_id = _company_id and created_at >= v_start
    group by 1
  )
  select jsonb_agg(
    jsonb_build_object(
      'date', to_char(days.d, 'YYYY-MM-DD'),
      'leads', coalesce(l.c, 0),
      'messages', coalesce(m.c, 0),
      'orders', coalesce(o.c, 0)
    ) order by days.d
  ) into v_series
  from days
  left join l on l.d = days.d
  left join m on m.d = days.d
  left join o on o.d = days.d;

  return jsonb_build_object(
    'company_id', _company_id,
    'days', _days,
    'series', coalesce(v_series, '[]'::jsonb),
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_company_growth(uuid, int) from public, anon;
grant execute on function public.get_company_growth(uuid, int) to authenticated;
