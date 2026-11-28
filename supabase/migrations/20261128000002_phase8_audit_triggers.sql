-- Phase 8: write the audit log from the database, so every path that unlocks, approves,
-- marks or pairs is recorded, whichever action or RPC made the change.

create or replace function public.audit_write(
  p_household uuid, p_actor uuid, p_action text, p_target_type text, p_target_id text, p_detail jsonb
) returns void
language sql
security definer
set search_path = public
as $$
  insert into audit_log (household_id, actor_profile_id, action, target_type, target_id, detail)
  values (
    p_household,
    (select id from profiles where id = p_actor or auth_user_id = p_actor limit 1),
    p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb)
  );
$$;
revoke all on function public.audit_write(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;

-- Parent area unlocks and lockouts.
create or replace function public.audit_pin_attempt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.succeeded then
    perform audit_write(new.household_id, new.actor_profile_id, 'parent.unlock', 'device', new.device_id::text, '{}');
  elsif new.locked_until is not null then
    perform audit_write(new.household_id, new.actor_profile_id, 'parent.lockout', 'device', new.device_id::text,
      jsonb_build_object('locked_until', new.locked_until));
  end if;
  return new;
end $$;
drop trigger if exists audit_pin_attempt on pin_attempt_logs;
create trigger audit_pin_attempt after insert on pin_attempt_logs for each row execute function public.audit_pin_attempt();

-- Request decisions (break, unlock, help, extra time).
create or replace function public.audit_request_decision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'declined') then
    perform audit_write(new.household_id, coalesce(new.resolved_by, auth.uid()), 'request.' || new.status,
      'request', new.id::text,
      jsonb_build_object('type', new.request_type, 'decision', new.decision, 'effect_until', new.effect_until));
  end if;
  return new;
end $$;
drop trigger if exists audit_request_decision on requests;
create trigger audit_request_decision after update on requests for each row execute function public.audit_request_decision();

-- Mark changes, including the first mark and any later edit.
create or replace function public.audit_item_mark() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_household uuid;
begin
  if tg_op = 'UPDATE' and new.marks_awarded is not distinct from old.marks_awarded then
    return new;
  end if;
  select p.household_id into v_household
  from term_assessments a join profiles p on p.id = a.student_id where a.id = new.assessment_id;
  if v_household is null then return new; end if;
  perform audit_write(v_household, coalesce(new.marked_by, auth.uid()),
    case when tg_op = 'INSERT' then 'mark.set' else 'mark.changed' end,
    'assessment_item', new.id::text,
    jsonb_build_object('assessment_id', new.assessment_id, 'question_template_id', new.question_template_id,
      'from', case when tg_op = 'UPDATE' then old.marks_awarded end, 'to', new.marks_awarded));
  return new;
end $$;
drop trigger if exists audit_item_mark on assessment_item_marks;
create trigger audit_item_mark after insert or update on assessment_item_marks for each row execute function public.audit_item_mark();

-- Device pairing codes, pairings and revocations.
create or replace function public.audit_device() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform audit_write(new.household_id, coalesce(new.created_by, auth.uid()), 'device.code_issued', 'device', new.id::text,
      jsonb_build_object('name', new.device_name));
  elsif new.revoked_at is not null and old.revoked_at is null then
    perform audit_write(new.household_id, auth.uid(), 'device.revoked', 'device', new.id::text,
      jsonb_build_object('name', new.device_name));
  elsif new.paired_at is not null and old.paired_at is null then
    perform audit_write(new.household_id, auth.uid(), 'device.paired', 'device', new.id::text,
      jsonb_build_object('name', new.device_name));
  end if;
  return new;
end $$;
drop trigger if exists audit_device on devices;
create trigger audit_device after insert or update on devices for each row execute function public.audit_device();
