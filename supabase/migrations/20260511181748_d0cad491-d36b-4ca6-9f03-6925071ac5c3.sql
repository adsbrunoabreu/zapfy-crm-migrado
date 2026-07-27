create extension if not exists pg_trgm;
create extension if not exists btree_gin;

create index if not exists idx_chat_messages_company_content_trgm
  on public.chat_messages using gin (company_id, content gin_trgm_ops);

create index if not exists idx_chat_messages_company_timestamp
  on public.chat_messages (company_id, "timestamp" desc);

create index if not exists idx_conversations_company_phone
  on public.conversations (company_id, phone text_pattern_ops);

create or replace function public.search_chat_history(
  p_query text default null,
  p_mode text default 'auto',
  p_status text default 'all',
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_only_attachments boolean default false,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  conversation_id uuid,
  lead_id uuid,
  contact_name text,
  phone text,
  contact_photo_url text,
  unread_count integer,
  ticket_status text,
  ticket_assigned_to uuid,
  conv_closed_at timestamptz,
  last_message_at timestamptz,
  match_count bigint,
  snippets jsonb
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_company uuid := public.get_user_company_id(auth.uid());
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_phone_q text;
  v_text_q text := v_query;
  v_mode text := coalesce(p_mode, 'auto');
  v_only_attach boolean := coalesce(p_only_attachments, false);
  v_status text := coalesce(p_status, 'all');
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if v_company is null then
    return;
  end if;

  if v_query is not null then
    v_phone_q := regexp_replace(v_query, '\D', '', 'g');
    if v_mode = 'auto' then
      if length(v_phone_q) >= 4 and v_phone_q = regexp_replace(v_query, '[\s\(\)\-\+\.]', '', 'g') then
        v_text_q := null;
      else
        v_phone_q := null;
      end if;
    elsif v_mode = 'phone' then
      v_text_q := null;
      if length(v_phone_q) = 0 then v_phone_q := null; end if;
    else
      v_phone_q := null;
    end if;
  end if;

  return query
  with
    convs as (
      select c.*
      from public.conversations c
      where c.company_id = v_company
        and (v_phone_q is null or regexp_replace(c.phone, '\D', '', 'g') like '%' || v_phone_q || '%')
    ),
    latest_ticket as (
      select distinct on (t.conversation_id)
        t.conversation_id, t.status::text as status, t.assigned_to, t.closed_at
      from public.attendance_tickets t
      where t.company_id = v_company
        and t.conversation_id in (select id from convs)
      order by t.conversation_id, t.created_at desc
    ),
    convs_resolved as (
      select
        c.id as conv_id,
        c.lead_id,
        coalesce(l.name, c.contact_name) as contact_name,
        c.phone,
        c.contact_photo_url,
        c.unread_count,
        c.closed_at as conv_closed_at,
        c.last_message_at,
        lt.status as ticket_status,
        lt.assigned_to as ticket_assigned_to,
        case
          when c.closed_at is not null then 'closed'
          when lt.status = 'closed' then 'closed'
          when lt.assigned_to is null then 'waiting'
          else 'in_progress'
        end as bucket
      from convs c
      left join latest_ticket lt on lt.conversation_id = c.id
      left join public.leads l on l.id = c.lead_id
    ),
    convs_filtered as (
      select * from convs_resolved
      where
        case v_status
          when 'all'         then true
          when 'unread'      then unread_count > 0
          when 'waiting'     then bucket = 'waiting'
          when 'in_progress' then bucket = 'in_progress'
          when 'closed'      then bucket = 'closed'
          else true
        end
    ),
    msg_matches as (
      select
        m.conversation_id,
        m.id,
        m.message_id,
        m."timestamp",
        m.message_type,
        m.from_me,
        m.content,
        m.file_name,
        m.media_mimetype
      from public.chat_messages m
      where m.company_id = v_company
        and m.conversation_id in (select conv_id from convs_filtered)
        and (p_from is null or m."timestamp" >= p_from)
        and (p_to   is null or m."timestamp" <= p_to)
        and (
          v_only_attach is false
          or m.message_type in ('image','video','audio','document','sticker')
        )
        and (
          v_text_q is null
          or m.content ilike '%' || v_text_q || '%'
          or m.file_name ilike '%' || v_text_q || '%'
        )
    ),
    msg_agg as (
      select
        x.conversation_id,
        count(*) as match_count,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', x.id,
              'message_id', x.message_id,
              'timestamp', x."timestamp",
              'message_type', x.message_type,
              'from_me', x.from_me,
              'content', left(coalesce(x.content, x.file_name, ''), 240),
              'file_name', x.file_name,
              'media_mimetype', x.media_mimetype
            )
            order by x."timestamp" desc
          ) filter (where x.rn <= 3),
          '[]'::jsonb
        ) as snippets
      from (
        select mm.*, row_number() over (partition by mm.conversation_id order by mm."timestamp" desc) as rn
        from msg_matches mm
      ) x
      group by x.conversation_id
    )
  select
    cf.conv_id as conversation_id,
    cf.lead_id,
    cf.contact_name,
    cf.phone,
    cf.contact_photo_url,
    cf.unread_count,
    cf.ticket_status,
    cf.ticket_assigned_to,
    cf.conv_closed_at,
    cf.last_message_at,
    coalesce(ma.match_count, 0) as match_count,
    coalesce(ma.snippets, '[]'::jsonb) as snippets
  from convs_filtered cf
  left join msg_agg ma on ma.conversation_id = cf.conv_id
  where
    case
      when v_text_q is not null or v_only_attach or p_from is not null or p_to is not null
        then ma.match_count is not null and ma.match_count > 0
      else true
    end
  order by
    coalesce(ma.match_count, 0) desc,
    cf.last_message_at desc nulls last
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function public.search_chat_history(text, text, text, timestamptz, timestamptz, boolean, int, int) to authenticated;