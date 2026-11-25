-- Phase 4, Step 4.1: /today from the timetable.
--
-- * Skip asks for one of three reasons, stored on the item.
-- * A learner may change only how their day runs (status, timing, order, carry-over date), never
--   what was planned (objective, minutes, subject, title). Done is reachable only through
--   finish_plan_item(), which also writes the Exposure_Lesson event in the same transaction.

alter table day_plan_items add column if not exists skip_reason text;
alter table day_plan_items drop constraint if exists day_plan_items_skip_reason_check;
alter table day_plan_items
  add constraint day_plan_items_skip_reason_check
  check (skip_reason is null or skip_reason in ('too-hard', 'no-time', 'already-know'));

create or replace function public.day_plan_items_learner_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_household_staff() or not public.is_current_learner() then
    return new;
  end if;

  if (new.household_id, new.student_id, new.item_type, new.subject_id, new.learning_objective_id,
      new.activity_id, new.term_assessment_id, new.title, new.reasons, new.planned_minutes, new.slot_id)
     is distinct from
     (old.household_id, old.student_id, old.item_type, old.subject_id, old.learning_objective_id,
      old.activity_id, old.term_assessment_id, old.title, old.reasons, old.planned_minutes, old.slot_id) then
    raise exception 'Only a parent can change what is planned.' using errcode = '42501';
  end if;

  if new.plan_date < old.plan_date then
    raise exception 'A plan item can only move forward in time.' using errcode = '42501';
  end if;

  if new.status = 'done' and old.status <> 'done'
     and coalesce(current_setting('openigcse.finishing', true), '') <> 'on' then
    raise exception 'Use Finish to complete an item.' using errcode = '42501';
  end if;

  if old.status = 'done' and new.status <> 'done' then
    raise exception 'A finished item stays finished.' using errcode = '42501';
  end if;

  if new.status = 'skipped' and new.skip_reason is null then
    raise exception 'Say why the item was skipped.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists day_plan_items_learner_guard on day_plan_items;
create trigger day_plan_items_learner_guard
  before update on day_plan_items
  for each row execute function public.day_plan_items_learner_guard();

-- Finish: Done + the lesson event, once. Security invoker, so RLS decides who may finish what.
create or replace function public.finish_plan_item(p_item_id uuid, p_minutes int)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item day_plan_items%rowtype;
begin
  if p_minutes is null or p_minutes < 1 or p_minutes > 600 then
    raise exception 'Minutes must be between 1 and 600.' using errcode = '22023';
  end if;

  select * into v_item from day_plan_items where id = p_item_id for update;
  if not found then
    raise exception 'That plan item is not yours.' using errcode = 'P0002';
  end if;

  if v_item.status = 'done' then
    return false;
  end if;

  perform set_config('openigcse.finishing', 'on', true);
  update day_plan_items
  set status = 'done', completed_at = now(), actual_minutes = p_minutes, skip_reason = null
  where id = p_item_id;
  perform set_config('openigcse.finishing', '', true);

  if v_item.item_type <> 'break' then
    insert into learning_events (student_id, objective_id, event_type, score_ratio, actual_minutes_spent, flagged_stuck)
    values (v_item.student_id, v_item.learning_objective_id, 'Exposure_Lesson', 0, p_minutes, false);
  end if;

  return true;
end;
$$;

revoke all on function public.finish_plan_item(uuid, int) from public, anon;
grant execute on function public.finish_plan_item(uuid, int) to authenticated;
