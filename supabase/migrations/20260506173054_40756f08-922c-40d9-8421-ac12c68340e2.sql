
-- 1. Rank de status de mensagem (espelha pickHigherStatus do front)
create or replace function public.chat_message_status_rank(_status text)
returns int
language sql
immutable
as $$
  select case lower(coalesce(_status, ''))
    when 'uploading' then 1
    when 'sending'   then 1
    when 'pending'   then 1
    when 'queued'    then 1
    when 'error'     then 2
    when 'failed'    then 2
    when 'sent'      then 3
    when 'delivered' then 4
    when 'read'      then 5
    when 'played'    then 5
    when 'received'  then 5
    else 0
  end
$$;

-- 2. RPC atômica usada pela edge function evolution-webhook
create or replace function public.set_chat_message_status(
  _message_id text,
  _company_id uuid,
  _status     text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  applied        text;
begin
  update public.chat_messages
     set status = _status
   where message_id = _message_id
     and company_id = _company_id
     and chat_message_status_rank(_status) > chat_message_status_rank(status)
  returning status into applied;

  if applied is null then
    select status into current_status
      from public.chat_messages
     where message_id = _message_id
       and company_id = _company_id
     limit 1;
    return current_status; -- nada mudou (ack antigo/duplicado ou row inexistente)
  end if;

  return applied;
end;
$$;

-- 3. Trigger BEFORE UPDATE — defesa em profundidade contra qualquer caminho
create or replace function public.prevent_chat_message_status_regression()
returns trigger
language plpgsql
as $$
begin
  if NEW.status is distinct from OLD.status then
    -- Permite sobrescrever apenas se o novo rank for >= ao atual.
    -- Exceção: error/failed pode marcar mesmo após sent (rank 2 < 3) — mas
    -- nunca após delivered/read/played (mensagem já entregue não falha).
    if chat_message_status_rank(NEW.status) < chat_message_status_rank(OLD.status) then
      if (OLD.status in ('delivered','read','played'))
         or NEW.status not in ('error','failed') then
        NEW.status := OLD.status;
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_prevent_chat_message_status_regression on public.chat_messages;
create trigger trg_prevent_chat_message_status_regression
before update of status on public.chat_messages
for each row
execute function public.prevent_chat_message_status_regression();

-- 4. Backfill: promove mensagens travadas usando o maior status já registrado
--    em system_logs (event = 'status_update') nos últimos 30 dias.
with best as (
  select
    metadata->>'message_id' as message_id,
    max(chat_message_status_rank(metadata->>'resolved_status')) as best_rank
  from public.system_logs
  where event = 'status_update'
    and created_at > now() - interval '30 days'
    and metadata ? 'message_id'
    and metadata ? 'resolved_status'
  group by 1
),
resolved as (
  select b.message_id,
         case b.best_rank
           when 5 then 'read'
           when 4 then 'delivered'
           when 3 then 'sent'
           else null
         end as best_status
  from best b
)
update public.chat_messages cm
   set status = r.best_status
  from resolved r
 where cm.message_id = r.message_id
   and r.best_status is not null
   and chat_message_status_rank(r.best_status) > chat_message_status_rank(cm.status);
