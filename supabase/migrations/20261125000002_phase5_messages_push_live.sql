-- Phase 5, Steps 5.2-5.4: messages, notifications and push, and the live monitor.

-- ============================================================ 5.2 messages
-- One thread per household. A message may be text, an image, a voice note, or text plus one
-- attachment. Read receipts are set by mark_messages_read(), never by a direct update.
alter table messages drop constraint if exists messages_body_check;
alter table messages add column if not exists attachment_path text;
alter table messages add column if not exists attachment_kind text
  check (attachment_kind in ('image', 'voice'));
alter table messages add constraint messages_body_check
  check (char_length(body) <= 1000 and (char_length(body) > 0 or attachment_path is not null));
alter table messages drop constraint if exists messages_attachment_pair;
alter table messages add constraint messages_attachment_pair
  check ((attachment_path is null) = (attachment_kind is null));

drop policy if exists messages_update on messages;
drop policy if exists messages_insert on messages;
create policy messages_insert on messages
  for insert to authenticated
  with check (
    sender_profile_id = public.current_profile_id()
    and household_id = public.current_household_id()
    and read_at is null
    and (attachment_path is null or (storage.foldername(attachment_path))[1] = public.current_household_id()::text)
  );

create or replace function public.mark_messages_read()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update messages
     set read_at = now()
   where household_id = public.current_household_id()
     and sender_profile_id <> public.current_profile_id()
     and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.mark_messages_read() to authenticated;

create or replace function public.notify_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select display_name into v_name from profiles where id = new.sender_profile_id;
  insert into notifications (household_id, recipient_profile_id, kind, title, body, link_url)
  select new.household_id, p.id, 'message',
         'Message from ' || coalesce(v_name, 'home'),
         case
           when char_length(new.body) > 0 then left(new.body, 140)
           when new.attachment_kind = 'voice' then 'Voice note'
           else 'Photo'
         end,
         case when p.role = 'student' then '/messages' else '/parent/messages' end
    from profiles p
   where p.household_id = new.household_id and p.id <> new.sender_profile_id;
  return new;
end;
$$;

drop trigger if exists messages_notify on messages;
create trigger messages_notify after insert on messages
  for each row execute function public.notify_message();

-- Attachments live in the existing private bucket under {household}/messages/{sender}/.
update storage.buckets
   set allowed_mime_types = array[
     'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
     'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'
   ]
 where id = 'household-files';

drop policy if exists household_files_insert on storage.objects;
create policy household_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'household-files'
    and (storage.foldername(name))[1] = public.current_household_id()::text
    and (storage.foldername(name))[2] in ('questions', 'working', 'evidence', 'messages')
    and (
      (storage.foldername(name))[3] = public.current_profile_id()::text
      or public.is_household_staff()
    )
  );

-- ============================================================ 5.3 notifications and push
alter table households add column if not exists quiet_hours_start time;
alter table households add column if not exists quiet_hours_end time;

-- A push subscription belongs to the device's own profile and nobody else reads it.
drop policy if exists push_subscriptions_read on push_subscriptions;
drop policy if exists push_subscriptions_write on push_subscriptions;
drop policy if exists push_subscriptions_insert on push_subscriptions;
drop policy if exists push_subscriptions_update on push_subscriptions;
drop policy if exists push_subscriptions_delete on push_subscriptions;
drop policy if exists push_subscriptions_manage on push_subscriptions;
create policy push_subscriptions_own on push_subscriptions
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id() and household_id = public.current_household_id());

-- "Test submitted" tells the guardians.
create or replace function public.notify_sitting_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if old.submitted_at is null and new.submitted_at is not null then
    select title into v_title from term_assessments where id = new.assessment_id;
    insert into notifications (household_id, recipient_profile_id, kind, title, body, link_url)
    select new.household_id, p.id, 'test_submitted', 'Test handed in',
           coalesce(v_title, 'An assessment') || ' is ready to mark.', '/parent/marking-desk'
      from profiles p
     where p.household_id = new.household_id and p.role <> 'student';
  end if;
  return new;
end;
$$;

drop trigger if exists assessment_sittings_notify on assessment_sittings;
create trigger assessment_sittings_notify after update on assessment_sittings
  for each row execute function public.notify_sitting_submitted();

-- ============================================================ 5.4 live monitor
alter table kiosk_sessions add column if not exists household_id uuid references households (id) on delete cascade;
alter table kiosk_sessions add column if not exists device_id uuid references devices (id) on delete set null;
alter table kiosk_sessions add column if not exists session_date date;
alter table kiosk_sessions add column if not exists current_route text;
alter table kiosk_sessions add column if not exists current_item_id uuid references day_plan_items (id) on delete set null;
alter table kiosk_sessions add column if not exists focus_state text
  check (focus_state in ('visible', 'hidden', 'blurred'));
alter table kiosk_sessions add column if not exists timer_running boolean not null default false;
alter table kiosk_sessions add column if not exists last_heartbeat_at timestamptz;
alter table kiosk_sessions add column if not exists idle_since timestamptz;
alter table kiosk_sessions add column if not exists idle_alerted_at timestamptz;
alter table kiosk_sessions add column if not exists screen_message text;
alter table kiosk_sessions add column if not exists screen_message_at timestamptz;
alter table kiosk_sessions add column if not exists day_ended_at timestamptz;
alter table kiosk_sessions add column if not exists digest_sent_at timestamptz;

create unique index if not exists kiosk_sessions_student_day on kiosk_sessions (student_id, session_date);

-- Learners no longer write kiosk rows directly: the heartbeat function does.
drop policy if exists kiosk_sessions_learner_insert on kiosk_sessions;
alter table kiosk_sessions replica identity full;
alter table focus_policies replica identity full;

do $$
begin
  alter publication supabase_realtime add table kiosk_sessions;
exception
  when duplicate_object then null;
end $$;

-- The current timetable slot for a household, in its own time zone.
create or replace function public.current_slot(p_household uuid)
returns table (slot_id uuid, slot_type text, title text, start_time time, end_time time)
language sql
stable
security definer
set search_path = public
as $$
  with local as (
    select (now() at time zone coalesce(h.timezone, 'UTC')) as at
      from households h where h.id = p_household
  )
  select s.id, s.slot_type, s.title, s.start_time, s.end_time
    from timetable_slots s
    join academic_terms t on t.id = s.academic_term_id and t.status = 'active'
    cross join local
   where s.household_id = p_household
     and s.day_of_week = extract(isodow from local.at)
     and local.at::time >= s.start_time
     and local.at::time < s.end_time
   order by s.start_time
   limit 1;
$$;

-- End-of-day digest text: what was done, mistakes logged, requests made.
create or replace function public.digest_body(p_student uuid, p_date date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select format(
    '%s of %s planned minutes done, %s item(s) finished. %s mistake(s) logged, %s request(s) made.',
    coalesce(sum(i.actual_minutes) filter (where i.status = 'done'), 0),
    coalesce(sum(i.planned_minutes) filter (where i.item_type <> 'break'), 0),
    count(*) filter (where i.status = 'done'),
    (select count(*) from mistake_notebook m where m.student_id = p_student and m.created_at::date = p_date),
    (select count(*) from requests r where r.student_id = p_student and r.created_at::date = p_date)
  )
  from day_plan_items i
  where i.student_id = p_student and i.plan_date = p_date;
$$;

create or replace function public.send_digest(p_session uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session kiosk_sessions%rowtype;
begin
  select * into v_session from kiosk_sessions where id = p_session for update;
  if not found or v_session.digest_sent_at is not null then
    return false;
  end if;
  insert into notifications (household_id, recipient_profile_id, kind, title, body, link_url)
  select v_session.household_id, p.id, 'digest', 'School day summary',
         public.digest_body(v_session.student_id, v_session.session_date), '/parent/live'
    from profiles p
   where p.household_id = v_session.household_id and p.role <> 'student';
  update kiosk_sessions set digest_sent_at = now() where id = p_session;
  return true;
end;
$$;

-- The study device calls this every 30 seconds. It keeps one row per learner per local day,
-- stamps the device, raises the 15-minute idle alert once per idle spell, and sends the digest
-- once the school day has ended.
create or replace function public.record_heartbeat(
  p_route text,
  p_item uuid default null,
  p_focus text default 'visible',
  p_timer_running boolean default false
)
returns table (session_id uuid, screen_message text, screen_message_at timestamptz, day_ended boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_student uuid := public.current_profile_id();
  v_household uuid := public.current_household_id();
  v_tz text;
  v_today date;
  v_device uuid;
  v_session kiosk_sessions%rowtype;
  v_slot record;
  v_day_end time;
  v_new_idle timestamptz;
begin
  if v_student is null or not public.is_current_learner() then
    raise exception 'Only the learner''s device sends a heartbeat.' using errcode = '42501';
  end if;
  if p_focus not in ('visible', 'hidden', 'blurred') then
    p_focus := 'visible';
  end if;
  if p_item is not null and not exists (select 1 from day_plan_items where id = p_item and student_id = v_student) then
    p_item := null;
  end if;

  select coalesce(timezone, 'UTC') into v_tz from households where id = v_household;
  v_today := (now() at time zone v_tz)::date;

  update devices set last_seen_at = now(), active_route = left(p_route, 120), visibility_state = p_focus
   where auth_user_id = auth.uid() and revoked_at is null;
  select id into v_device from devices
   where auth_user_id = auth.uid() and revoked_at is null
   order by last_seen_at desc nulls last limit 1;

  insert into kiosk_sessions (student_id, household_id, session_date, session_start, device_id)
  values (v_student, v_household, v_today, now(), v_device)
  on conflict (student_id, session_date) do nothing;

  select * into v_session from kiosk_sessions
   where student_id = v_student and session_date = v_today for update;

  select * into v_slot from public.current_slot(v_household);

  -- Idle: in a lesson-type period with no timer running.
  if v_slot.slot_id is not null and v_slot.slot_type in ('subject', 'revision', 'free_study') and not p_timer_running then
    v_new_idle := coalesce(v_session.idle_since, now());
  else
    v_new_idle := null;
  end if;

  update kiosk_sessions
     set household_id = v_household,
         device_id = coalesce(v_device, device_id),
         current_route = left(p_route, 120),
         current_item_id = p_item,
         focus_state = p_focus,
         timer_running = p_timer_running,
         last_heartbeat_at = now(),
         idle_since = v_new_idle,
         unfocused_count = unfocused_count + case when p_focus <> 'visible' and coalesce(focus_state, 'visible') = 'visible' then 1 else 0 end
   where id = v_session.id;

  if v_new_idle is not null
     and v_new_idle <= now() - interval '15 minutes'
     and (v_session.idle_alerted_at is null or v_session.idle_alerted_at < v_new_idle) then
    insert into notifications (household_id, recipient_profile_id, kind, title, body, link_url)
    select v_household, p.id, 'idle', 'No timer running',
           'Nothing has been started for 15 minutes in ' || coalesce(v_slot.title, 'a lesson period') || '.',
           '/parent/live'
      from profiles p
     where p.household_id = v_household and p.role <> 'student';
    update kiosk_sessions set idle_alerted_at = now() where id = v_session.id;
  end if;

  -- After the last slot of the day (or the term's school day end) the digest goes once.
  select coalesce(max(s.end_time), max(t.school_day_end)) into v_day_end
    from academic_terms t
    left join timetable_slots s on s.academic_term_id = t.id
      and s.day_of_week = extract(isodow from (now() at time zone v_tz))
   where t.household_id = v_household and t.status = 'active';
  if v_day_end is not null and (now() at time zone v_tz)::time >= v_day_end then
    perform public.send_digest(v_session.id);
  end if;

  return query
    select k.id, k.screen_message, k.screen_message_at, k.day_ended_at is not null
      from kiosk_sessions k where k.id = v_session.id;
end;
$$;

revoke all on function public.record_heartbeat(text, uuid, text, boolean) from public, anon;
grant execute on function public.record_heartbeat(text, uuid, text, boolean) to authenticated;
revoke all on function public.send_digest(uuid) from public, anon, authenticated;
revoke all on function public.current_slot(uuid) from public, anon, authenticated;
revoke all on function public.digest_body(uuid, date) from public, anon, authenticated;

-- Remote actions from the parent's phone.
create or replace function public.parent_live_action(
  p_action text,
  p_minutes int default null,
  p_message text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  v_student uuid;
  v_tz text;
  v_today date;
  v_session uuid;
begin
  if not public.is_household_staff() then
    raise exception 'Only a guardian can do that.' using errcode = '42501';
  end if;

  select id into v_student from profiles where household_id = v_household and role = 'student' order by created_at limit 1;
  if v_student is null then
    raise exception 'There is no learner in this household.' using errcode = 'P0002';
  end if;
  select coalesce(timezone, 'UTC') into v_tz from households where id = v_household;
  v_today := (now() at time zone v_tz)::date;

  insert into kiosk_sessions (student_id, household_id, session_date, session_start)
  values (v_student, v_household, v_today, now())
  on conflict (student_id, session_date) do nothing;
  select id into v_session from kiosk_sessions where student_id = v_student and session_date = v_today;

  insert into focus_policies (household_id) values (v_household) on conflict (household_id) do nothing;

  case p_action
    when 'end_break' then
      update requests set effect_until = now()
       where student_id = v_student and request_type = 'break' and status = 'approved' and effect_until > now();
      return 'Break ended.';
    when 'message' then
      if coalesce(trim(p_message), '') = '' then
        raise exception 'Write the message first.' using errcode = '22023';
      end if;
      update kiosk_sessions set screen_message = left(trim(p_message), 280), screen_message_at = now() where id = v_session;
      return 'Sent to the screen.';
    when 'unlock' then
      if p_minutes is null or p_minutes not between 5 and 120 then
        raise exception 'Unlock for 5 to 120 minutes.' using errcode = '22023';
      end if;
      update focus_policies set is_locked = false, lock_ends_at = now() + make_interval(mins => p_minutes),
             updated_by = public.current_profile_id(), updated_at = now()
       where household_id = v_household;
      return format('Unlocked for %s minutes.', p_minutes);
    when 'lock' then
      update focus_policies set is_locked = true, lock_ends_at = null,
             updated_by = public.current_profile_id(), updated_at = now()
       where household_id = v_household;
      update requests set effect_until = now()
       where student_id = v_student and request_type = 'unlock' and status = 'approved' and effect_until > now();
      return 'Locked.';
    when 'end_day' then
      update day_plan_items set status = 'deferred'
       where student_id = v_student and plan_date = v_today and status in ('planned', 'in_progress');
      update kiosk_sessions set day_ended_at = now(), session_end = now() where id = v_session;
      perform public.send_digest(v_session);
      return 'School day ended. The summary is in your notifications.';
    else
      raise exception 'Unknown action.' using errcode = '22023';
  end case;
end;
$$;

revoke all on function public.parent_live_action(text, int, text) from public, anon;
grant execute on function public.parent_live_action(text, int, text) to authenticated;

-- An unlock approved through a request also opens the focus policy until it runs out.
create or replace function public.apply_unlock_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.request_type = 'unlock' and new.status = 'approved' and old.status = 'pending' and new.effect_until is not null then
    insert into focus_policies (household_id) values (new.household_id) on conflict (household_id) do nothing;
    update focus_policies
       set is_locked = false, lock_ends_at = new.effect_until, updated_by = new.resolved_by, updated_at = now()
     where household_id = new.household_id;
  end if;
  return new;
end;
$$;

drop trigger if exists requests_apply_unlock on requests;
create trigger requests_apply_unlock after update on requests
  for each row execute function public.apply_unlock_request();
