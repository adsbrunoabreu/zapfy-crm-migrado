create or replace function public.ai_agents_snapshot_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare next_v int; uname text;
begin
  if (TG_OP = 'UPDATE') and (
    new.system_prompt is distinct from old.system_prompt or
    new.persona is distinct from old.persona or
    new.tone is distinct from old.tone or
    new.name is distinct from old.name or
    new.emoji is distinct from old.emoji or
    new.collect_fields is distinct from old.collect_fields or
    new.qualification_questions is distinct from old.qualification_questions or
    new.qualification_criteria is distinct from old.qualification_criteria or
    new.kb_document_ids is distinct from old.kb_document_ids or
    new.handoff_keywords is distinct from old.handoff_keywords or
    new.available_hours is distinct from old.available_hours or
    new.is_active is distinct from old.is_active
  ) then
    select coalesce(max(version),0)+1 into next_v
      from public.ai_agent_history where agent_id = new.id;
    select coalesce(p.full_name, u.email)
      into uname
      from auth.users u
      left join public.profiles p on p.id = u.id
      where u.id = auth.uid();
    insert into public.ai_agent_history(
      agent_id, company_id, version, snapshot, change_summary, changed_by, changed_by_name
    ) values (
      new.id, new.company_id, next_v, to_jsonb(old),
      'Alteração no agente', auth.uid(), uname
    );
  end if;
  return new;
end$$;

drop trigger if exists trg_ai_agents_snapshot on public.ai_agents;
create trigger trg_ai_agents_snapshot
  before update on public.ai_agents
  for each row execute function public.ai_agents_snapshot_history();