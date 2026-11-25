-- Phase 5, Step 5.1: structured requests.
--
-- A request is a typed ask with a decision. The learner can only raise one (status pending, no
-- decision); a guardian answers through decide_request(), which applies the effect in the same
-- transaction. Learners lose the old self-update policy, so a learner token cannot approve its own
-- break over REST. Every new request notifies the household's guardians, and every decision
-- notifies the learner, through notification rows written by triggers.

-- ------------------------------------------------------------ shape
alter table requests drop constraint if exists requests_request_type_check;
alter table requests add constraint requests_request_type_check
  check (request_type in ('stuck', 'break', 'more_time', 'swap', 'unlock', 'check_work', 'day_off'));

alter table requests drop constraint if exists requests_status_check;
alter table requests add constraint requests_status_check
  check (status in ('pending', 'approved', 'declined', 'expired'));

alter table requests add column if not exists decision text;
alter table requests add column if not exists effect_until timestamptz;
alter table requests add column if not exists term_assessment_id uuid references term_assessments (id) on delete set null;
alter table requests add column if not exists evidence_id uuid references evidence_portfolio (id) on delete set null;

create index if not exists requests_student_idx on requests (student_id, created_at desc);

-- "More time" extends one sitting by whole minutes.
alter table assessment_sittings add column if not exists extra_minutes int not null default 0
  check (extra_minutes between 0 and 120);

-- ------------------------------------------------------------ policies
drop policy if exists requests_student_update on requests;
drop policy if exists requests_staff_write on requests;
drop policy if exists requests_staff_insert on requests;
drop policy if exists requests_student_insert on requests;
drop policy if exists requests_read on requests;

create policy requests_read on requests
  for select to authenticated
  using (
    household_id = public.current_household_id()
    and (student_id = public.current_profile_id() or public.is_household_staff())
  );

-- The learner raises a pending ask for themselves; the decision columns stay empty.
create policy requests_student_insert on requests
  for insert to authenticated
  with check (
    student_id = public.current_profile_id()
    and household_id = public.current_household_id()
    and public.is_current_learner()
    and status = 'pending'
    and decision is null
    and resolved_by is null
    and resolved_at is null
    and effect_until is null
    and parent_reply is null
  );
-- No update or delete policy: decisions go through decide_request().

-- ------------------------------------------------------------ decisions
-- Which one-tap answers each type accepts, and whether the answer approves it.
create or replace function public.request_decision_outcome(p_type text, p_decision text)
returns text
language sql
immutable
as $$
  select case
    when p_type = 'stuck' and p_decision in ('coming', 'hint', 'skip') then 'approved'
    when p_type = 'break' and p_decision in ('5', '10', '15') then 'approved'
    when p_type = 'break' and p_decision = 'not_now' then 'declined'
    when p_type in ('more_time', 'swap', 'day_off') and p_decision = 'approve' then 'approved'
    when p_type in ('more_time', 'swap') and p_decision = 'decline' then 'declined'
    when p_type = 'day_off' and p_decision = 'call_me' then 'declined'
    when p_type = 'unlock' and p_decision in ('15', '30') then 'approved'
    when p_type = 'unlock' and p_decision = 'decline' then 'declined'
    when p_type = 'check_work' and p_decision = 'reviewing' then 'approved'
    else null
  end;
$$;

-- Pending asks older than four hours are stale: the moment they were about has passed.
create or replace function public.expire_stale_requests()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update requests
     set status = 'expired', resolved_at = now()
   where household_id = public.current_household_id()
     and status = 'pending'
     and created_at < now() - interval '4 hours';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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
    update requests set status = 'expired', resolved_at = now() where id = v_request.id;
    raise exception 'That request has expired.' using errcode = '55000';
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

revoke all on function public.decide_request(uuid, text, text) from public, anon;
grant execute on function public.decide_request(uuid, text, text) to authenticated;
grant execute on function public.expire_stale_requests() to authenticated;
grant execute on function public.request_decision_outcome(text, text) to authenticated;

-- ------------------------------------------------------------ notifications
-- Learners and guardians never write notification rows directly; triggers do.
drop policy if exists notifications_insert on notifications;

alter table notifications add column if not exists request_id uuid references requests (id) on delete cascade;
alter table notifications add column if not exists pushed_at timestamptz;

create or replace function public.request_label(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'stuck' then 'Stuck'
    when 'break' then 'Break'
    when 'more_time' then 'More time'
    when 'swap' then 'Swap periods'
    when 'unlock' then 'Unlock'
    when 'check_work' then 'Check my work'
    when 'day_off' then 'Day off'
    else p_type
  end;
$$;

create or replace function public.notify_request_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' then
    select display_name into v_name from profiles where id = new.student_id;
    insert into notifications (household_id, recipient_profile_id, kind, title, body, link_url, request_id)
    select new.household_id, p.id, 'request',
           coalesce(v_name, 'The learner') || ': ' || public.request_label(new.request_type),
           coalesce(nullif(new.student_note, ''), public.request_label(new.request_type) || ' request'),
           '/parent', new.id
      from profiles p
     where p.household_id = new.household_id and p.role <> 'student';
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'declined') then
    insert into notifications (household_id, recipient_profile_id, kind, title, body, link_url, request_id)
    values (
      new.household_id, new.student_id, 'request_decided',
      public.request_label(new.request_type) || case new.status when 'approved' then ': yes' else ': not now' end,
      coalesce(new.parent_reply, case new.status when 'approved' then 'Your parent said yes.' else 'Your parent said not now.' end),
      '/today', new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists requests_notify on requests;
create trigger requests_notify
  after insert or update on requests
  for each row execute function public.notify_request_change();

-- Recipients mark their own notifications read; nothing else on the row may change.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update notifications
     set read_at = now()
   where recipient_profile_id = public.current_profile_id()
     and read_at is null
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

drop policy if exists notifications_update on notifications;
drop policy if exists notifications_read on notifications;
create policy notifications_read on notifications
  for select to authenticated
  using (recipient_profile_id = public.current_profile_id());

grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- Realtime needs the full row on updates so a filtered subscriber sees status changes.
alter table requests replica identity full;
