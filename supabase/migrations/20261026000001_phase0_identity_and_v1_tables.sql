-- =====================================================================
-- Phase 0: real identity, enforced multi-tenant RLS and the V1 tables.
--
-- Three things happen here, in one transaction:
--   1. profiles gain a real auth link (auth.users) plus helpers that resolve
--      both legacy profile-id logins and paired student devices.
--   2. The tenant leaks on the original tables are closed: staff checks are
--      always paired with a household membership check.
--   3. The V1 tables (devices, plan, requests, messages, notifications,
--      push, focus policy, timetable, PIN attempts) are created together
--      with their RLS, grants and realtime membership.
-- =====================================================================

-- ------------------------------------------------------- 1.1 identity link

alter table profiles
  add column if not exists auth_user_id uuid unique references auth.users (id) on delete set null;

create index if not exists profiles_auth_user_idx on profiles (auth_user_id);

-- Existing household-scoped rows for these tables carry only a student_id, so
-- the household has to come from the profile. Keep the lookup cheap.
create index if not exists profiles_household_idx on profiles (household_id);

-- ------------------------------------------------------- 1.1 auth helpers

-- A signed-in user is either a profile row keyed by auth.uid() (legacy rows
-- created before Supabase Auth) or a profile paired to an auth user.
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles where id = auth.uid() or auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from profiles where id = auth.uid() or auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_household_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('developer_admin', 'parent_educator') from profiles where id = auth.uid() or auth_user_id = auth.uid() limit 1),
    false
  );
$$;

create or replace function public.is_household_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_household_id() is not distinct from target, false);
$$;

-- ------------------------------------- 1.2 tighten existing tenant policies

-- households: a staff member only ever sees and edits their own household.
drop policy if exists households_read on households;
create policy households_read on households
  for select to authenticated
  using (id = public.current_household_id());

drop policy if exists households_write on households;
create policy households_write on households
  for all to authenticated
  using (public.is_household_staff() and id = public.current_household_id())
  with check (public.is_household_staff() and id = public.current_household_id());

-- profiles: you see yourself and your own household, nothing else.
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select to authenticated
  using (
    id = public.current_profile_id()
    or (household_id is not null and household_id = public.current_household_id())
  );

drop policy if exists profiles_write on profiles;
create policy profiles_write on profiles
  for update to authenticated
  using (
    id = public.current_profile_id()
    or (public.is_household_staff() and household_id = public.current_household_id())
  )
  with check (
    id = public.current_profile_id()
    or (public.is_household_staff() and household_id = public.current_household_id())
  );

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles
  for insert to authenticated
  with check (public.is_household_staff() and household_id = public.current_household_id());

-- Student-owned rows: the learner themselves, or staff in the same household.
do $$
declare
  target text;
begin
  foreach target in array array[
    'mistake_notebook', 'learning_events', 'fsrs_retention_items', 'evidence_portfolio', 'kiosk_sessions'
  ]
  loop
    execute format('drop policy if exists %I_read on %I', target, target);
    execute format(
      'create policy %I_read on %I for select to authenticated using (
         student_id = public.current_profile_id()
         or (
           public.is_household_staff()
           and exists (
             select 1 from profiles p
             where p.id = %I.student_id and p.household_id = public.current_household_id()
           )
         )
       )',
      target, target, target
    );

    execute format('drop policy if exists %I_write on %I', target, target);
    execute format(
      'create policy %I_write on %I for all to authenticated using (
         student_id = public.current_profile_id()
         or (
           public.is_household_staff()
           and exists (
             select 1 from profiles p
             where p.id = %I.student_id and p.household_id = public.current_household_id()
           )
         )
       ) with check (
         student_id = public.current_profile_id()
         or (
           public.is_household_staff()
           and exists (
             select 1 from profiles p
             where p.id = %I.student_id and p.household_id = public.current_household_id()
           )
         )
       )',
      target, target, target, target
    );
  end loop;
end $$;

-- Term-scoped writes carried the same leak: staff in Household A could write
-- Household B's plans simply because is_household_staff() was true.
do $$
declare
  target text;
begin
  foreach target in array array[
    'academic_terms', 'learner_term_enrollments', 'term_assessments'
  ]
  loop
    execute format('drop policy if exists %I_write on %I', target, target);
  end loop;

  foreach target in array array['learner_term_enrollments', 'term_assessments']
  loop
    execute format(
      'create policy %I_write on %I for all to authenticated using (
         public.is_household_staff()
         and exists (
           select 1 from academic_terms t
           where t.id = %I.academic_term_id
             and t.household_id = public.current_household_id()
         )
       ) with check (
         public.is_household_staff()
         and exists (
           select 1 from academic_terms t
           where t.id = %I.academic_term_id
             and t.household_id = public.current_household_id()
         )
       )',
      target, target, target, target
    );
  end loop;
end $$;

drop policy if exists academic_terms_write on academic_terms;
create policy academic_terms_write on academic_terms
  for all to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id())
  with check (public.is_household_staff() and household_id = public.current_household_id());

-- ------------------------------------------------------- 1.3 V1 tables

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  auth_user_id uuid references auth.users (id) on delete set null,
  device_name text not null,
  device_type text not null default 'web'
    check (device_type in ('windows', 'ipad', 'android', 'chromebook', 'web')),
  pairing_code_hash text,
  pairing_code_expires_at timestamptz,
  paired_at timestamptz,
  last_seen_at timestamptz,
  active_route text,
  visibility_state text check (visibility_state in ('visible', 'hidden', 'blurred')),
  revoked_at timestamptz,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists devices_household_idx on devices (household_id);
create index if not exists devices_auth_user_idx on devices (auth_user_id);
create index if not exists devices_pairing_code_idx on devices (pairing_code_hash);

-- Middleware asks this on every request from a paired device: 'revoked' means
-- the parent has cut the device off and the session must be dropped at once.
create or replace function public.device_session_state()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from devices d where d.auth_user_id = auth.uid() and d.revoked_at is not null
    ) then 'revoked'
    when exists (select 1 from profiles p where p.auth_user_id = auth.uid()) then 'active'
    when exists (select 1 from devices d where d.auth_user_id = auth.uid()) then 'active'
    else 'unlinked'
  end;
$$;

create table if not exists pin_attempt_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  device_id uuid references devices (id) on delete cascade,
  actor_profile_id uuid references profiles (id) on delete set null,
  succeeded boolean not null default false,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists pin_attempt_logs_household_idx on pin_attempt_logs (household_id, created_at desc);

create table if not exists timetable_slots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  academic_term_id uuid not null references academic_terms (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  slot_type text not null check (slot_type in ('subject', 'break', 'revision', 'assessment', 'free_study')),
  subject_id uuid references subjects (id) on delete set null,
  title text,
  created_at timestamptz not null default now()
);

create index if not exists timetable_slots_term_idx on timetable_slots (academic_term_id, day_of_week, start_time);
create index if not exists timetable_slots_household_idx on timetable_slots (household_id);

create table if not exists timetable_overrides (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  override_date date not null,
  override_type text not null
    check (override_type in ('holiday', 'sick_day', 'half_day', 'ramadan_schedule', 'exam_day', 'custom')),
  reason text not null default '',
  preserve_streak boolean not null default true,
  custom_minutes_cap int,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, override_date)
);

create table if not exists day_plan_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  plan_date date not null,
  sequence int not null default 0,
  item_type text not null
    check (item_type in ('lesson', 'review', 'mistake_fix', 'assessment', 'past_paper', 'break')),
  subject_id uuid references subjects (id) on delete set null,
  learning_objective_id uuid references learning_objectives (id) on delete set null,
  activity_id uuid references activities (id) on delete set null,
  term_assessment_id uuid references term_assessments (id) on delete set null,
  title text not null,
  reasons jsonb not null default '[]'::jsonb,
  planned_minutes int not null default 30,
  actual_minutes int not null default 0,
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'done', 'deferred', 'skipped')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists day_plan_items_student_date_idx on day_plan_items (student_id, plan_date, sequence);
create index if not exists day_plan_items_household_idx on day_plan_items (household_id);

create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  request_type text not null
    check (request_type in ('stuck', 'break', 'done_early', 'reschedule', 'unlock', 'mark_my_work')),
  learning_objective_id uuid references learning_objectives (id) on delete set null,
  day_plan_item_id uuid references day_plan_items (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  student_note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'resolved')),
  resolution_action text,
  parent_reply text,
  resolved_by uuid references profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists requests_household_status_idx on requests (household_id, status, created_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  sender_profile_id uuid not null references profiles (id) on delete cascade,
  request_id uuid references requests (id) on delete set null,
  learning_objective_id uuid references learning_objectives (id) on delete set null,
  term_assessment_id uuid references term_assessments (id) on delete set null,
  body text not null check (char_length(body) between 1 and 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_household_idx on messages (household_id, created_at desc);
create index if not exists messages_request_idx on messages (request_id);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  recipient_profile_id uuid not null references profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  link_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on notifications (recipient_profile_id, read_at, created_at desc);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists focus_policies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references households (id) on delete cascade,
  is_locked boolean not null default false,
  allowed_routes text[] not null default array['/today', '/review', '/subjects', '/plan', '/progress'],
  scheduled_windows jsonb not null default '[]'::jsonb,
  lock_ends_at timestamptz,
  updated_by uuid references profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------- 1.3 RLS + grants

alter table devices enable row level security;
alter table pin_attempt_logs enable row level security;
alter table timetable_slots enable row level security;
alter table timetable_overrides enable row level security;
alter table day_plan_items enable row level security;
alter table requests enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table push_subscriptions enable row level security;
alter table focus_policies enable row level security;

-- devices: the household can see its devices; only staff manage them. A paired
-- device can always read its own row (middleware needs revoked_at).
drop policy if exists devices_read on devices;
create policy devices_read on devices
  for select to authenticated
  using (auth_user_id = auth.uid() or household_id = public.current_household_id());

drop policy if exists devices_manage on devices;
create policy devices_manage on devices
  for all to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id())
  with check (public.is_household_staff() and household_id = public.current_household_id());

-- PIN attempts are written by the server action (service role) and read by
-- staff only: a student must not be able to see the lockout state.
drop policy if exists pin_attempt_logs_read on pin_attempt_logs;
create policy pin_attempt_logs_read on pin_attempt_logs
  for select to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id());

drop policy if exists pin_attempt_logs_write on pin_attempt_logs;
create policy pin_attempt_logs_write on pin_attempt_logs
  for all to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id())
  with check (public.is_household_staff() and household_id = public.current_household_id());

-- Timetable: everyone in the household reads, staff edits.
drop policy if exists timetable_slots_read on timetable_slots;
create policy timetable_slots_read on timetable_slots
  for select to authenticated
  using (household_id = public.current_household_id());

drop policy if exists timetable_slots_write on timetable_slots;
create policy timetable_slots_write on timetable_slots
  for all to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id())
  with check (public.is_household_staff() and household_id = public.current_household_id());

drop policy if exists timetable_overrides_read on timetable_overrides;
create policy timetable_overrides_read on timetable_overrides
  for select to authenticated
  using (household_id = public.current_household_id());

drop policy if exists timetable_overrides_write on timetable_overrides;
create policy timetable_overrides_write on timetable_overrides
  for all to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id())
  with check (public.is_household_staff() and household_id = public.current_household_id());

-- Day plan: staff build the plan, the learner reports progress on their own rows.
drop policy if exists day_plan_items_read on day_plan_items;
create policy day_plan_items_read on day_plan_items
  for select to authenticated
  using (household_id = public.current_household_id());

drop policy if exists day_plan_items_write on day_plan_items;
create policy day_plan_items_write on day_plan_items
  for all to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id())
  with check (public.is_household_staff() and household_id = public.current_household_id());

drop policy if exists day_plan_items_student_insert on day_plan_items;
create policy day_plan_items_student_insert on day_plan_items
  for insert to authenticated
  with check (
    student_id = public.current_profile_id()
    and household_id = public.current_household_id()
  );

drop policy if exists day_plan_items_student_update on day_plan_items;
create policy day_plan_items_student_update on day_plan_items
  for update to authenticated
  using (student_id = public.current_profile_id() and household_id = public.current_household_id())
  with check (student_id = public.current_profile_id() and household_id = public.current_household_id());

-- Requests: the learner raises them, staff resolve them.
drop policy if exists requests_read on requests;
create policy requests_read on requests
  for select to authenticated
  using (household_id = public.current_household_id());

drop policy if exists requests_student_insert on requests;
create policy requests_student_insert on requests
  for insert to authenticated
  with check (
    student_id = public.current_profile_id()
    and household_id = public.current_household_id()
  );

drop policy if exists requests_student_update on requests;
create policy requests_student_update on requests
  for update to authenticated
  using (student_id = public.current_profile_id() and household_id = public.current_household_id())
  with check (student_id = public.current_profile_id() and household_id = public.current_household_id());

drop policy if exists requests_staff_write on requests;
create policy requests_staff_write on requests
  for update to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id())
  with check (public.is_household_staff() and household_id = public.current_household_id());

drop policy if exists requests_staff_insert on requests;
create policy requests_staff_insert on requests
  for insert to authenticated
  with check (public.is_household_staff() and household_id = public.current_household_id());

-- Messages: household-readable, authored by the signed-in profile.
drop policy if exists messages_read on messages;
create policy messages_read on messages
  for select to authenticated
  using (household_id = public.current_household_id());

drop policy if exists messages_insert on messages;
create policy messages_insert on messages
  for insert to authenticated
  with check (
    sender_profile_id = public.current_profile_id()
    and household_id = public.current_household_id()
  );

drop policy if exists messages_update on messages;
create policy messages_update on messages
  for update to authenticated
  using (
    household_id = public.current_household_id()
    and (sender_profile_id = public.current_profile_id() or public.is_household_staff())
  )
  with check (
    household_id = public.current_household_id()
    and (sender_profile_id = public.current_profile_id() or public.is_household_staff())
  );

-- Notifications: the recipient reads and marks their own.
drop policy if exists notifications_read on notifications;
create policy notifications_read on notifications
  for select to authenticated
  using (
    household_id = public.current_household_id()
    and (recipient_profile_id = public.current_profile_id() or public.is_household_staff())
  );

drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications
  for update to authenticated
  using (
    household_id = public.current_household_id()
    and (recipient_profile_id = public.current_profile_id() or public.is_household_staff())
  )
  with check (
    household_id = public.current_household_id()
    and (recipient_profile_id = public.current_profile_id() or public.is_household_staff())
  );

drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications
  for insert to authenticated
  with check (public.is_household_staff() and household_id = public.current_household_id());

-- Push subscriptions belong to the profile that registered them.
drop policy if exists push_subscriptions_read on push_subscriptions;
create policy push_subscriptions_read on push_subscriptions
  for select to authenticated
  using (
    household_id = public.current_household_id()
    and (profile_id = public.current_profile_id() or public.is_household_staff())
  );

drop policy if exists push_subscriptions_write on push_subscriptions;
create policy push_subscriptions_write on push_subscriptions
  for all to authenticated
  using (
    household_id = public.current_household_id()
    and (profile_id = public.current_profile_id() or public.is_household_staff())
  )
  with check (
    household_id = public.current_household_id()
    and (profile_id = public.current_profile_id() or public.is_household_staff())
  );

-- Focus policy: the learner reads it (the kiosk enforces it), staff write it.
drop policy if exists focus_policies_read on focus_policies;
create policy focus_policies_read on focus_policies
  for select to authenticated
  using (household_id = public.current_household_id());

drop policy if exists focus_policies_write on focus_policies;
create policy focus_policies_write on focus_policies
  for all to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id())
  with check (public.is_household_staff() and household_id = public.current_household_id());

grant select, insert, update, delete on
  devices, pin_attempt_logs, timetable_slots, timetable_overrides, day_plan_items,
  requests, messages, notifications, push_subscriptions, focus_policies
to authenticated;

-- ------------------------------------------------------------ realtime

do $$
declare
  target text;
begin
  foreach target in array array['devices', 'requests', 'messages', 'notifications', 'focus_policies', 'day_plan_items']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', target);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;
