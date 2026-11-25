-- Phase 5 fix: decide_request() on a stale ask now records the expiry and returns 'expired'.
-- The first version raised after updating, which rolled the expiry back (caught by verify:phase5).

create or replace function public.decide_request(p_request_id uuid, p_decision text, p_note text default null)
returns table (status text, effect_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_request requests%rowtype;
  v_outcome text;
  v_until timestamptz;
  v_minutes int;
  v_other uuid;
  v_seq_a int;
  v_seq_b int;
  v_tz text;
begin
  if not public.is_household_staff() then
    raise exception 'Only a guardian can answer a request.' using errcode = '42501';
  end if;

  select * into v_request from requests r
   where r.id = p_request_id and r.household_id = public.current_household_id()
   for update;
  if not found then
    raise exception 'That request is not in this household.' using errcode = 'P0002';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'That request was already answered.' using errcode = '55000';
  end if;
  if v_request.created_at < now() - interval '4 hours' then
    -- Returning (not raising) keeps the expiry: an exception would roll it back.
    update requests set status = 'expired', resolved_at = now() where id = v_request.id;
    return query select 'expired'::text, null::timestamptz;
    return;
  end if;

  v_outcome := public.request_decision_outcome(v_request.request_type, p_decision);
  if v_outcome is null then
    raise exception 'That answer does not fit this request.' using errcode = '22023';
  end if;

  if v_outcome = 'approved' then
    case v_request.request_type
      when 'break' then
        v_until := now() + make_interval(mins => p_decision::int);
      when 'unlock' then
        v_until := now() + make_interval(mins => p_decision::int);
      when 'stuck' then
        if p_decision = 'skip' and v_request.day_plan_item_id is not null then
          update day_plan_items set status = 'deferred'
           where id = v_request.day_plan_item_id and student_id = v_request.student_id
             and status in ('planned', 'in_progress');
        end if;
      when 'more_time' then
        v_minutes := least(greatest(coalesce((v_request.payload ->> 'minutes')::int, 20), 5), 60);
        update assessment_sittings
           set extra_minutes = least(extra_minutes + v_minutes, 120)
         where assessment_id = v_request.term_assessment_id
           and student_id = v_request.student_id
           and submitted_at is null;
        if not found then
          raise exception 'There is no open sitting to extend.' using errcode = '55000';
        end if;
      when 'swap' then
        v_other := nullif(v_request.payload ->> 'withItemId', '')::uuid;
        select sequence into v_seq_a from day_plan_items
         where id = v_request.day_plan_item_id and student_id = v_request.student_id;
        select sequence into v_seq_b from day_plan_items
         where id = v_other and student_id = v_request.student_id;
        if v_seq_a is null or v_seq_b is null then
          raise exception 'Those periods are no longer on the plan.' using errcode = '55000';
        end if;
        update day_plan_items set sequence = v_seq_b, student_reordered = true where id = v_request.day_plan_item_id;
        update day_plan_items set sequence = v_seq_a, student_reordered = true where id = v_other;
      when 'day_off' then
        select coalesce(h.timezone, 'UTC') into v_tz from households h where h.id = v_request.household_id;
        insert into timetable_overrides (household_id, override_date, override_type, reason, preserve_streak, created_by)
        values (
          v_request.household_id,
          (now() at time zone v_tz)::date,
          'sick_day',
          coalesce(nullif(v_request.student_note, ''), 'Day off approved'),
          true,
          public.current_profile_id()
        )
        on conflict (household_id, override_date) do update
          set override_type = 'sick_day', preserve_streak = true;
        -- Today's unfinished items roll over to the next school day.
        update day_plan_items set status = 'deferred'
         where student_id = v_request.student_id
           and plan_date = (now() at time zone v_tz)::date
           and status in ('planned', 'in_progress');
      else
        null;
    end case;
  end if;

  update requests r
     set status = v_outcome,
         decision = p_decision,
         parent_reply = nullif(trim(coalesce(p_note, '')), ''),
         resolved_by = public.current_profile_id(),
         resolved_at = now(),
         effect_until = v_until
   where r.id = v_request.id;

  return query select v_outcome, v_until;
end;
$$;

