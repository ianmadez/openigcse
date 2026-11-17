-- Onboarding state and the trivia centre.

-- A household is "set up" once the guardian has finished onboarding. The app
-- checks this before deciding between the demo workspace and real data.
alter table households add column if not exists onboarding_completed boolean not null default false;
alter table households add column if not exists guardian_pin_hash text;

-- Candidate route and target series belong to the learner, not the household.
alter table profiles add column if not exists candidate_type text
  check (candidate_type in ('Private Candidate', 'School Candidate'));
alter table profiles add column if not exists target_exam_series text;

-- Guardian relationship is a label the family chooses (Dad, Sister, Guardian).
alter table profiles add column if not exists relationship text;

-- Weekly rhythm captured during onboarding.
alter table academic_terms add column if not exists study_days text[] not null default '{}';
alter table academic_terms add column if not exists daily_minutes_cap int not null default 120;

-- ---------------------------------------------------------------- trivia

create table if not exists trivia_modules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic_area text not null check (topic_area in ('Science', 'History', 'Engineering', 'Nature')),
  provider text not null default '',
  youtube_video_id text not null check (youtube_video_id ~ '^[\w-]{11}$'),
  description text not null default '',
  duration_minutes int,
  is_published boolean not null default true,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists trivia_questions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references trivia_modules (id) on delete cascade,
  at_seconds int not null default 0 check (at_seconds >= 0),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_letter text not null check (correct_letter ~ '^[A-D]$'),
  explanation text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists trivia_questions_module_idx on trivia_questions (module_id, at_seconds);

alter table trivia_modules enable row level security;
alter table trivia_questions enable row level security;

drop policy if exists trivia_modules_read on trivia_modules;
create policy trivia_modules_read on trivia_modules
  for select to authenticated
  using (is_published or public.is_household_staff());

drop policy if exists trivia_modules_write on trivia_modules;
create policy trivia_modules_write on trivia_modules
  for all to authenticated
  using (public.is_household_staff())
  with check (public.is_household_staff());

drop policy if exists trivia_questions_read on trivia_questions;
create policy trivia_questions_read on trivia_questions
  for select to authenticated
  using (true);

drop policy if exists trivia_questions_write on trivia_questions;
create policy trivia_questions_write on trivia_questions
  for all to authenticated
  using (public.is_household_staff())
  with check (public.is_household_staff());

grant select on trivia_modules, trivia_questions to authenticated;
grant insert, update, delete on trivia_modules, trivia_questions to authenticated;