-- Additive changes on top of the applied v2 schema.
-- Nothing here recreates a table that already exists: the curriculum tables came
-- in 20261020000001, so this migration only adds what the importer and marking
-- desk need, plus the row-level security the first migration left out.

-- ---------------------------------------------------------------- extensions

-- Route notes keep the private-candidate reasoning next to the route itself.
alter table entry_routes add column if not exists notes text;

-- A resource belongs to the objective it teaches. The activities table links
-- them for scheduling; this column answers "which objective is this video for".
alter table resources
  add column if not exists learning_objective_id uuid references learning_objectives (id) on delete cascade,
  add column if not exists provider text,
  add column if not exists citation text;

create unique index if not exists resources_objective_url_key
  on resources (learning_objective_id, external_url)
  where learning_objective_id is not null and external_url is not null;

-- ------------------------------------------------------------- marking desk

-- Which templates make up a paper, and how many marks each carries.
create table if not exists assessment_items (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references term_assessments (id) on delete cascade,
  question_template_id uuid not null references question_templates (id) on delete cascade,
  sequence int not null default 0,
  marks_available int not null default 1 check (marks_available between 1 and 50),
  unique (assessment_id, question_template_id)
);

-- One row per marked question, so a deduction can carry a tag and a note.
create table if not exists assessment_item_marks (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references term_assessments (id) on delete cascade,
  question_template_id uuid not null references question_templates (id) on delete cascade,
  marks_awarded numeric(5, 2) not null check (marks_awarded >= 0),
  feedback text,
  marked_by uuid references profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  unique (assessment_id, question_template_id)
);

-- ----------------------------------------------------------------- indexes

create index if not exists learning_events_student_created_idx
  on learning_events (student_id, created_at desc);

create index if not exists mistake_notebook_student_open_idx
  on mistake_notebook (student_id, resolved);

create index if not exists topics_version_sequence_idx
  on topics (syllabus_version_id, sequence);

create index if not exists objectives_topic_sequence_idx
  on learning_objectives (topic_id, sequence);

create index if not exists question_templates_objective_idx
  on question_templates (objective_id);

create index if not exists term_assessments_term_idx
  on term_assessments (academic_term_id, scheduled_date);

create index if not exists enrollment_term_idx
  on learner_term_enrollments (academic_term_id);

-- ------------------------------------------------------------ access helpers

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from profiles where id = auth.uid();
$$;

create or replace function public.is_household_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('developer_admin', 'parent_educator') from profiles where id = auth.uid()),
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
  select coalesce(
    (select household_id from profiles where id = auth.uid()) is not distinct from target,
    false
  );
$$;

-- ---------------------------------------------------------------------- RLS

alter table households enable row level security;
alter table profiles enable row level security;
alter table awarding_bodies enable row level security;
alter table qualifications enable row level security;
alter table subjects enable row level security;
alter table syllabus_versions enable row level security;
alter table components enable row level security;
alter table entry_routes enable row level security;
alter table entry_route_components enable row level security;
alter table assessment_objectives enable row level security;
alter table topics enable row level security;
alter table learning_objectives enable row level security;
alter table question_templates enable row level security;
alter table resources enable row level security;
alter table activities enable row level security;
alter table academic_terms enable row level security;
alter table learner_term_enrollments enable row level security;
alter table term_assessments enable row level security;
alter table assessment_items enable row level security;
alter table assessment_item_marks enable row level security;
alter table mistake_notebook enable row level security;
alter table learning_events enable row level security;
alter table fsrs_retention_items enable row level security;
alter table evidence_portfolio enable row level security;
alter table kiosk_sessions enable row level security;

-- Household and profiles.
drop policy if exists households_read on households;
create policy households_read on households
  for select to authenticated
  using (id = public.current_household_id());

drop policy if exists households_write on households;
create policy households_write on households
  for all to authenticated
  using (public.is_household_staff())
  with check (public.is_household_staff());

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select to authenticated
  using (id = auth.uid() or household_id = public.current_household_id());

drop policy if exists profiles_write on profiles;
create policy profiles_write on profiles
  for update to authenticated
  using (id = auth.uid() or public.is_household_staff())
  with check (id = auth.uid() or public.is_household_staff());

-- Syllabus content is reference data: readable by anyone signed in, written by staff.
do $$
declare
  target text;
begin
  foreach target in array array[
    'awarding_bodies', 'qualifications', 'subjects', 'syllabus_versions', 'components',
    'entry_routes', 'entry_route_components', 'assessment_objectives', 'topics',
    'learning_objectives', 'resources', 'activities'
  ]
  loop
    execute format('drop policy if exists %I_read on %I', target, target);
    execute format('create policy %I_read on %I for select to authenticated using (true)', target, target);

    execute format('drop policy if exists %I_write on %I', target, target);
    execute format(
      'create policy %I_write on %I for all to authenticated using (public.is_household_staff()) with check (public.is_household_staff())',
      target, target
    );
  end loop;
end $$;

-- Question templates: readable while reviewing a marked paper, written by staff.
drop policy if exists question_templates_read on question_templates;
create policy question_templates_read on question_templates
  for select to authenticated
  using (true);

drop policy if exists question_templates_write on question_templates;
create policy question_templates_write on question_templates
  for all to authenticated
  using (public.is_household_staff())
  with check (public.is_household_staff());

-- Terms belong to a household.
drop policy if exists academic_terms_read on academic_terms;
create policy academic_terms_read on academic_terms
  for select to authenticated
  using (household_id = public.current_household_id());

drop policy if exists academic_terms_write on academic_terms;
create policy academic_terms_write on academic_terms
  for all to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id())
  with check (public.is_household_staff() and household_id = public.current_household_id());

-- Enrolments, assessments and paper structure hang off a term.
drop policy if exists learner_term_enrollments_read on learner_term_enrollments;
create policy learner_term_enrollments_read on learner_term_enrollments
  for select to authenticated
  using (
    exists (
      select 1 from academic_terms t
      where t.id = learner_term_enrollments.academic_term_id
        and t.household_id = public.current_household_id()
    )
  );

drop policy if exists learner_term_enrollments_write on learner_term_enrollments;
create policy learner_term_enrollments_write on learner_term_enrollments
  for all to authenticated
  using (public.is_household_staff())
  with check (public.is_household_staff());

drop policy if exists term_assessments_read on term_assessments;
create policy term_assessments_read on term_assessments
  for select to authenticated
  using (
    exists (
      select 1 from academic_terms t
      where t.id = term_assessments.academic_term_id
        and t.household_id = public.current_household_id()
    )
  );

drop policy if exists term_assessments_write on term_assessments;
create policy term_assessments_write on term_assessments
  for all to authenticated
  using (public.is_household_staff())
  with check (public.is_household_staff());

drop policy if exists assessment_items_read on assessment_items;
create policy assessment_items_read on assessment_items
  for select to authenticated
  using (
    exists (
      select 1
      from term_assessments a
      join academic_terms t on t.id = a.academic_term_id
      where a.id = assessment_items.assessment_id
        and t.household_id = public.current_household_id()
    )
  );

drop policy if exists assessment_items_write on assessment_items;
create policy assessment_items_write on assessment_items
  for all to authenticated
  using (public.is_household_staff())
  with check (public.is_household_staff());

drop policy if exists assessment_item_marks_read on assessment_item_marks;
create policy assessment_item_marks_read on assessment_item_marks
  for select to authenticated
  using (
    exists (
      select 1
      from term_assessments a
      join academic_terms t on t.id = a.academic_term_id
      where a.id = assessment_item_marks.assessment_id
        and t.household_id = public.current_household_id()
    )
  );

drop policy if exists assessment_item_marks_write on assessment_item_marks;
create policy assessment_item_marks_write on assessment_item_marks
  for all to authenticated
  using (public.is_household_staff())
  with check (public.is_household_staff());

-- Student-owned rows: the student themselves, or staff in the same household.
drop policy if exists mistake_notebook_read on mistake_notebook;
create policy mistake_notebook_read on mistake_notebook
  for select to authenticated
  using (student_id = auth.uid() or public.is_household_staff());

drop policy if exists mistake_notebook_write on mistake_notebook;
create policy mistake_notebook_write on mistake_notebook
  for all to authenticated
  using (student_id = auth.uid() or public.is_household_staff())
  with check (student_id = auth.uid() or public.is_household_staff());

drop policy if exists learning_events_read on learning_events;
create policy learning_events_read on learning_events
  for select to authenticated
  using (student_id = auth.uid() or public.is_household_staff());

drop policy if exists learning_events_write on learning_events;
create policy learning_events_write on learning_events
  for all to authenticated
  using (student_id = auth.uid() or public.is_household_staff())
  with check (student_id = auth.uid() or public.is_household_staff());

drop policy if exists fsrs_retention_items_read on fsrs_retention_items;
create policy fsrs_retention_items_read on fsrs_retention_items
  for select to authenticated
  using (student_id = auth.uid() or public.is_household_staff());

drop policy if exists fsrs_retention_items_write on fsrs_retention_items;
create policy fsrs_retention_items_write on fsrs_retention_items
  for all to authenticated
  using (student_id = auth.uid() or public.is_household_staff())
  with check (student_id = auth.uid() or public.is_household_staff());

drop policy if exists evidence_portfolio_read on evidence_portfolio;
create policy evidence_portfolio_read on evidence_portfolio
  for select to authenticated
  using (student_id = auth.uid() or public.is_household_staff());

drop policy if exists evidence_portfolio_write on evidence_portfolio;
create policy evidence_portfolio_write on evidence_portfolio
  for all to authenticated
  using (student_id = auth.uid() or public.is_household_staff())
  with check (student_id = auth.uid() or public.is_household_staff());

drop policy if exists kiosk_sessions_read on kiosk_sessions;
create policy kiosk_sessions_read on kiosk_sessions
  for select to authenticated
  using (student_id = auth.uid() or public.is_household_staff());

drop policy if exists kiosk_sessions_write on kiosk_sessions;
create policy kiosk_sessions_write on kiosk_sessions
  for all to authenticated
  using (student_id = auth.uid() or public.is_household_staff())
  with check (student_id = auth.uid() or public.is_household_staff());

-- -------------------------------------------------------------------- grants

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on
  households, profiles, question_templates, academic_terms, learner_term_enrollments,
  term_assessments, assessment_items, assessment_item_marks, mistake_notebook,
  learning_events, fsrs_retention_items, evidence_portfolio, kiosk_sessions
to authenticated;