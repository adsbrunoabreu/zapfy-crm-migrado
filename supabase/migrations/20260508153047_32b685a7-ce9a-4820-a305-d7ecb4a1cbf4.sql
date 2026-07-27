create or replace function public.get_master_won_lost_overview(
  p_from timestamptz,
  p_to   timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_global    jsonb;
  v_companies jsonb;
  v_top_loss  jsonb;
begin
  if not public.is_master(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with closed as (
    select l.company_id, l.status, l.value, l.loss_reason_id, l.loss_reason_text
      from public.leads l
     where l.closed_at is not null
       and l.closed_at >= p_from
       and l.closed_at <= p_to
       and l.status in ('won','lost')
  )
  select jsonb_build_object(
    'won_count',    coalesce(sum(case when status='won' then 1 else 0 end), 0),
    'lost_count',   coalesce(sum(case when status='lost' then 1 else 0 end), 0),
    'closed_count', count(*),
    'won_revenue',  coalesce(sum(case when status='won' then value else 0 end), 0),
    'lost_revenue', coalesce(sum(case when status='lost' then value else 0 end), 0),
    'win_rate',     case when count(*) > 0
                         then round((sum(case when status='won' then 1 else 0 end)::numeric / count(*)) * 100, 2)
                         else 0 end,
    'loss_rate',    case when count(*) > 0
                         then round((sum(case when status='lost' then 1 else 0 end)::numeric / count(*)) * 100, 2)
                         else 0 end,
    'companies_with_closings', count(distinct company_id)
  )
  into v_global
  from closed;

  with lost as (
    select
      coalesce(lr.label, nullif(trim(l.loss_reason_text), ''), 'Sem motivo informado') as label,
      l.value
    from public.leads l
    left join public.loss_reasons lr on lr.id = l.loss_reason_id
    where l.closed_at >= p_from
      and l.closed_at <= p_to
      and l.status = 'lost'
  ), totals as (
    select count(*)::numeric as total from lost
  ), grouped as (
    select label, count(*) as cnt, sum(coalesce(value,0)) as total_value
      from lost
     group by label
     order by cnt desc
     limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'label', g.label,
           'count', g.cnt,
           'total_value', g.total_value,
           'percentage', case when t.total > 0 then round((g.cnt::numeric / t.total) * 100, 2) else 0 end
         ) order by g.cnt desc), '[]'::jsonb)
    into v_top_loss
    from grouped g, totals t;

  with closed as (
    select l.company_id, l.status, l.value, l.loss_reason_id, l.loss_reason_text
      from public.leads l
     where l.closed_at is not null
       and l.closed_at >= p_from
       and l.closed_at <= p_to
       and l.status in ('won','lost')
  ),
  agg as (
    select
      c.company_id,
      sum(case when c.status='won' then 1 else 0 end)  as won_count,
      sum(case when c.status='lost' then 1 else 0 end) as lost_count,
      count(*)                                          as closed_count,
      sum(case when c.status='won' then c.value else 0 end)  as won_revenue,
      sum(case when c.status='lost' then c.value else 0 end) as lost_revenue
    from closed c
    group by c.company_id
  )
  select coalesce(jsonb_agg(row_to_json(x) order by (x.won_count + x.lost_count) desc), '[]'::jsonb)
    into v_companies
  from (
    select
      a.company_id,
      co.name as company_name,
      a.won_count,
      a.lost_count,
      a.closed_count,
      a.won_revenue,
      a.lost_revenue,
      case when a.closed_count > 0
           then round((a.won_count::numeric / a.closed_count) * 100, 2)
           else 0 end as win_rate,
      case when a.closed_count > 0
           then round((a.lost_count::numeric / a.closed_count) * 100, 2)
           else 0 end as loss_rate,
      coalesce((
        select jsonb_agg(jsonb_build_object('label', label, 'count', cnt) order by cnt desc)
          from (
            select
              coalesce(lr.label, nullif(trim(l.loss_reason_text), ''), 'Sem motivo informado') as label,
              count(*) as cnt
            from public.leads l
            left join public.loss_reasons lr on lr.id = l.loss_reason_id
            where l.company_id = a.company_id
              and l.status = 'lost'
              and l.closed_at >= p_from
              and l.closed_at <= p_to
            group by 1
            order by cnt desc
            limit 3
          ) tr
      ), '[]'::jsonb) as top_loss_reasons
    from agg a
    join public.companies co on co.id = a.company_id
  ) x;

  return jsonb_build_object(
    'global', coalesce(v_global, '{}'::jsonb),
    'top_loss_reasons', coalesce(v_top_loss, '[]'::jsonb),
    'companies', coalesce(v_companies, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_master_won_lost_overview(timestamptz, timestamptz) to authenticated;