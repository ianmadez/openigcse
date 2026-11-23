-- Phase 3: parent authoring and the marking desk (roadmap Steps 3.1-3.6).
--
-- Additive only. It also closes three cross-household write leaks left from
-- 20261021000001: question_templates, assessment_items and
-- assessment_item_marks accepted writes from staff of *any* household.

-- ------------------------------------------------------------ 3.1 terms

-- The term planner upserts terms by name within a household.
create unique index if not exists academic_terms_household_name_idx
  on academic_terms (household_id, name);

-- ------------------------------------------------------- 3.2 question bank

-- Questions are household content, not reference data. The table was empty
-- when this migration was written; `set not null` fails loudly rather than
-- orphaning a row if that is no longer true.
alter table question_templates
  add column if not exists household_id uuid references households (id) on delete cascade;
alter table question_templates alter column household_id set not null;

alter table question_templates add column if not exists tier text not null default 'Both';
alter table question_templates add column if not exists model_answer text;
alter table question_templates add column if not exists parts jsonb not null default '[]'::jsonb;
alter table question_templates add column if not exists image_paths text[] not null default '{}';
alter table question_templates add column if not exists updated_at timestamptz not null default now();

alter table question_templates drop constraint if exists question_templates_tier_check;
alter table question_templates add constraint question_templates_tier_check
  check (tier in ('Core', 'Extended', 'Both'));

alter table question_templates drop constraint if exists question_templates_question_type_check;
alter table question_templates add constraint question_templates_question_type_check
  check (question_type in (
    'MCQ', 'ShortAnswer', 'Structured', 'CalculationTemplate',
    'EssayRubric', 'PracticalSkill', 'CommandWordDrill'
  ));

create index if not exists question_templates_household_idx on question_templates (household_id, created_at desc);

drop policy if exists question_templates_read on question_templates;
create policy question_templates_read on question_templates
  for select to authenticated
  using (household_id = public.current_household_id());

drop policy if exists question_templates_write on question_templates;
create policy question_templates_write on question_templates
  for all to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id())
  with check (public.is_household_staff() and household_id = public.current_household_id());

-- ------------------------------------------------ 3.3 assessment builder

alter table term_assessments
  add column if not exists student_id uuid references profiles (id) on delete cascade;
alter table term_assessments add column if not exists paper_code text;
alter table term_assessments add column if not exists exam_series text;
alter table term_assessments add column if not exists paper_variant text;
alter table term_assessments add column if not exists paper_url text;
alter table term_assessments add column if not exists grade_thresholds jsonb not null default '[]'::jsonb;
alter table term_assessments add column if not exists marked_at timestamptz;

drop policy if exists term_assessments_write on term_assessments;
create policy term_assessments_write on term_assessments
  for all to authenticated
  using (
    public.is_household_staff()
    and exists (
      select 1 from academic_terms t
      where t.id = term_assessments.academic_term_id
        and t.household_id = public.current_household_id()
    )
  )
  with check (
    public.is_household_staff()
    and exists (
      select 1 from academic_terms t
      where t.id = term_assessments.academic_term_id
        and t.household_id = public.current_household_id()
    )
    and (
      term_assessments.student_id is null
      or exists (
        select 1 from profiles p
        where p.id = term_assessments.student_id
          and p.household_id = public.current_household_id()
      )
    )
  );

-- Items and marks: staff, and only on an assessment in their own household
-- using a question from their own bank.
drop policy if exists assessment_items_write on assessment_items;
create policy assessment_items_write on assessment_items
  for all to authenticated
  using (
    public.is_household_staff()
    and exists (
      select 1
      from term_assessments a
      join academic_terms t on t.id = a.academic_term_id
      where a.id = assessment_items.assessment_id
        and t.household_id = public.current_household_id()
    )
  )
  with check (
    public.is_household_staff()
    and exists (
      select 1
      from term_assessments a
      join academic_terms t on t.id = a.academic_term_id
      where a.id = assessment_items.assessment_id
        and t.household_id = public.current_household_id()
    )
    and exists (
      select 1 from question_templates q
      where q.id = assessment_items.question_template_id
        and q.household_id = public.current_household_id()
    )
  );

drop policy if exists assessment_item_marks_write on assessment_item_marks;
create policy assessment_item_marks_write on assessment_item_marks
  for all to authenticated
  using (
    public.is_household_staff()
    and exists (
      select 1
      from term_assessments a
      join academic_terms t on t.id = a.academic_term_id
      where a.id = assessment_item_marks.assessment_id
        and t.household_id = public.current_household_id()
    )
  )
  with check (
    public.is_household_staff()
    and exists (
      select 1
      from term_assessments a
      join academic_terms t on t.id = a.academic_term_id
      where a.id = assessment_item_marks.assessment_id
        and t.household_id = public.current_household_id()
    )
  );

-- ------------------------------------------------- 3.4 sitting screen

create table if not exists assessment_sittings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  assessment_id uuid not null references term_assessments (id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assessment_id, student_id)
);

create index if not exists assessment_sittings_household_idx on assessment_sittings (household_id, submitted_at);

-- The clock belongs to the server. Whatever a client sends, a sitting starts
-- now, keeps its start time, and records the moment it was handed in.
create or replace function public.assessment_sittings_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.started_at := now();
    new.submitted_at := null;
    return new;
  end if;

  new.started_at := old.started_at;
  new.household_id := old.household_id;
  new.student_id := old.student_id;
  new.assessment_id := old.assessment_id;

  if old.submitted_at is null and new.submitted_at is not null then
    new.submitted_at := now();
  elsif old.submitted_at is not null and not public.is_household_staff() then
    -- Only a guardian can reopen a handed-in sitting.
    new.submitted_at := old.submitted_at;
  end if;

  return new;
end;
$$;

drop trigger if exists assessment_sittings_guard on assessment_sittings;
create trigger assessment_sittings_guard
  before insert or update on assessment_sittings
  for each row execute function public.assessment_sittings_guard();

alter table assessment_sittings enable row level security;

drop policy if exists assessment_sittings_read on assessment_sittings;
create policy assessment_sittings_read on assessment_sittings
  for select to authenticated
  using (
    household_id = public.current_household_id()
    and (student_id = public.current_profile_id() or public.is_household_staff())
  );

drop policy if exists assessment_sittings_student_insert on assessment_sittings;
create policy assessment_sittings_student_insert on assessment_sittings
  for insert to authenticated
  with check (
    household_id = public.current_household_id()
    and student_id = public.current_profile_id()
    and exists (
      select 1
      from term_assessments a
      join academic_terms t on t.id = a.academic_term_id
      where a.id = assessment_sittings.assessment_id
        and t.household_id = public.current_household_id()
        and a.status = 'Scheduled'
        and (a.student_id is null or a.student_id = assessment_sittings.student_id)
    )
  );

drop policy if exists assessment_sittings_student_update on assessment_sittings;
create policy assessment_sittings_student_update on assessment_sittings
  for update to authenticated
  using (student_id = public.current_profile_id() and submitted_at is null)
  with check (student_id = public.current_profile_id() and household_id = public.current_household_id());

drop policy if exists assessment_sittings_staff on assessment_sittings;
create policy assessment_sittings_staff on assessment_sittings
  for all to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id())
  with check (public.is_household_staff() and household_id = public.current_household_id());

create table if not exists assessment_responses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  assessment_id uuid not null references term_assessments (id) on delete cascade,
  question_template_id uuid not null references question_templates (id) on delete cascade,
  selected_option text check (selected_option in ('A', 'B', 'C', 'D')),
  answer_text text check (char_length(answer_text) <= 20000),
  photo_paths text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (assessment_id, student_id, question_template_id)
);

create index if not exists assessment_responses_assessment_idx on assessment_responses (assessment_id, student_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists assessment_responses_touch on assessment_responses;
create trigger assessment_responses_touch
  before insert or update on assessment_responses
  for each row execute function public.touch_updated_at();

drop trigger if exists question_templates_touch on question_templates;
create trigger question_templates_touch
  before update on question_templates
  for each row execute function public.touch_updated_at();

-- True while the learner may still change an answer: their sitting is open,
-- not handed in, and inside the duration plus two minutes of grace for the
-- last autosave in flight.
create or replace function public.sitting_is_open(p_assessment_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from assessment_sittings s
    join term_assessments a on a.id = s.assessment_id
    where s.assessment_id = p_assessment_id
      and s.student_id = p_student_id
      and s.submitted_at is null
      and now() < s.started_at + make_interval(mins => a.duration_minutes + 2)
  );
$$;

alter table assessment_responses enable row level security;

drop policy if exists assessment_responses_read on assessment_responses;
create policy assessment_responses_read on assessment_responses
  for select to authenticated
  using (
    household_id = public.current_household_id()
    and (student_id = public.current_profile_id() or public.is_household_staff())
  );

drop policy if exists assessment_responses_student_insert on assessment_responses;
create policy assessment_responses_student_insert on assessment_responses
  for insert to authenticated
  with check (
    household_id = public.current_household_id()
    and student_id = public.current_profile_id()
    and public.sitting_is_open(assessment_id, student_id)
    and exists (
      select 1 from assessment_items i
      where i.assessment_id = assessment_responses.assessment_id
        and i.question_template_id = assessment_responses.question_template_id
    )
  );

drop policy if exists assessment_responses_student_update on assessment_responses;
create policy assessment_responses_student_update on assessment_responses
  for update to authenticated
  using (student_id = public.current_profile_id() and public.sitting_is_open(assessment_id, student_id))
  with check (
    student_id = public.current_profile_id()
    and household_id = public.current_household_id()
    and public.sitting_is_open(assessment_id, student_id)
  );

-- ------------------------------------------------- 3.5 marking desk

alter table mistake_notebook
  add column if not exists question_template_id uuid references question_templates (id) on delete set null;
alter table mistake_notebook add column if not exists source text not null default 'marking';
alter table mistake_notebook drop constraint if exists mistake_notebook_source_check;
alter table mistake_notebook add constraint mistake_notebook_source_check check (source in ('marking', 'student'));

-- Re-saving a marked paper updates its mistakes instead of adding new ones.
create unique index if not exists mistake_notebook_marking_key
  on mistake_notebook (student_id, term_assessment_id, question_template_id)
  where term_assessment_id is not null and question_template_id is not null;

alter table learning_events
  add column if not exists term_assessment_id uuid references term_assessments (id) on delete set null;

-- One Formal_Assessment event per objective per marked assessment.
create unique index if not exists learning_events_formal_key
  on learning_events (student_id, term_assessment_id, objective_id)
  where event_type = 'Formal_Assessment' and term_assessment_id is not null;

-- Marks, mistakes, events and the assessment total land together or not at
-- all. Security invoker: every statement below runs under the caller's RLS.
create or replace function public.save_assessment_marks(
  p_assessment_id uuid,
  p_student_id uuid,
  p_marks jsonb,
  p_feedback text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_assessment term_assessments%rowtype;
  v_household uuid := public.current_household_id();
  v_marker uuid := public.current_profile_id();
  v_item record;
  v_awarded numeric;
  v_category text;
  v_items int;
  v_matched int := 0;
  v_available_total int := 0;
  v_awarded_total numeric := 0;
  v_mistakes int := 0;
begin
  if not public.is_household_staff() then
    raise exception 'Only a guardian can save marks.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_marks) is distinct from 'array' then
    raise exception 'Marks must be a list.' using errcode = '22023';
  end if;

  select * into v_assessment from term_assessments where id = p_assessment_id;
  if not found then
    raise exception 'That assessment is not in this household.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from profiles p
    where p.id = p_student_id and p.household_id = v_household and p.role = 'student'
  ) then
    raise exception 'That learner is not in this household.' using errcode = '42501';
  end if;

  if v_assessment.student_id is not null and v_assessment.student_id <> p_student_id then
    raise exception 'This assessment was set for a different learner.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from assessment_sittings s
    where s.assessment_id = p_assessment_id
      and s.student_id = p_student_id
      and s.submitted_at is null
      and now() < s.started_at + make_interval(mins => v_assessment.duration_minutes)
  ) then
    raise exception 'The learner is still sitting this assessment.' using errcode = '55000';
  end if;

  select count(*) into v_items from assessment_items where assessment_id = p_assessment_id;
  if v_items = 0 then
    raise exception 'This assessment has no questions to mark.' using errcode = '22023';
  end if;

  if (select count(distinct e ->> 'questionId') from jsonb_array_elements(p_marks) e) <> jsonb_array_length(p_marks) then
    raise exception 'A question was marked twice.' using errcode = '22023';
  end if;

  for v_item in
    select
      i.question_template_id,
      i.marks_available,
      q.objective_id,
      q.prompt_template,
      coalesce(nullif(q.model_answer, ''), q.mark_scheme_rubric) as model_answer,
      coalesce(r.selected_option, r.answer_text) as student_answer,
      m.value as mark
    from assessment_items i
    join question_templates q on q.id = i.question_template_id
    left join assessment_responses r
      on r.assessment_id = i.assessment_id
     and r.question_template_id = i.question_template_id
     and r.student_id = p_student_id
    left join lateral (
      select e as value
      from jsonb_array_elements(p_marks) e
      where e ->> 'questionId' = i.question_template_id::text
      limit 1
    ) m on true
    where i.assessment_id = p_assessment_id
    order by i.sequence
  loop
    if v_item.mark is null then
      raise exception 'Every question needs a mark before saving.' using errcode = '22023';
    end if;

    v_matched := v_matched + 1;
    v_awarded := (v_item.mark ->> 'awarded')::numeric;

    if v_awarded is null or v_awarded <> trunc(v_awarded) or v_awarded < 0 or v_awarded > v_item.marks_available then
      raise exception 'A mark must be a whole number from 0 to %.', v_item.marks_available using errcode = '22023';
    end if;

    v_category := nullif(v_item.mark ->> 'errorCategory', '');

    if v_awarded < v_item.marks_available and v_category is null then
      raise exception 'Every dropped mark needs a reason.' using errcode = '22023';
    end if;

    insert into assessment_item_marks (assessment_id, question_template_id, marks_awarded, feedback, marked_by, marked_at)
    values (p_assessment_id, v_item.question_template_id, v_awarded, nullif(v_item.mark ->> 'feedback', ''), v_marker, now())
    on conflict (assessment_id, question_template_id) do update
      set marks_awarded = excluded.marks_awarded,
          feedback = excluded.feedback,
          marked_by = excluded.marked_by,
          marked_at = excluded.marked_at;

    if v_awarded < v_item.marks_available then
      insert into mistake_notebook (
        student_id, objective_id, term_assessment_id, question_template_id, error_category,
        question_snapshot, student_wrong_answer, correct_model_answer, source
      )
      values (
        p_student_id, v_item.objective_id, p_assessment_id, v_item.question_template_id, v_category,
        v_item.prompt_template, v_item.student_answer, v_item.model_answer, 'marking'
      )
      on conflict (student_id, term_assessment_id, question_template_id)
        where term_assessment_id is not null and question_template_id is not null
      do update
        set error_category = excluded.error_category,
            question_snapshot = excluded.question_snapshot,
            student_wrong_answer = excluded.student_wrong_answer,
            correct_model_answer = excluded.correct_model_answer;
      v_mistakes := v_mistakes + 1;
    else
      -- Marked back up to full: an open notebook entry from this paper goes.
      delete from mistake_notebook
      where student_id = p_student_id
        and term_assessment_id = p_assessment_id
        and question_template_id = v_item.question_template_id
        and source = 'marking'
        and resolved is not true;
    end if;

    v_available_total := v_available_total + v_item.marks_available;
    v_awarded_total := v_awarded_total + v_awarded;
  end loop;

  if v_matched <> jsonb_array_length(p_marks) then
    raise exception 'A mark was sent for a question that is not on this assessment.' using errcode = '22023';
  end if;

  insert into learning_events (student_id, objective_id, event_type, score_ratio, actual_minutes_spent, term_assessment_id)
  select
    p_student_id,
    q.objective_id,
    'Formal_Assessment',
    round(sum(m.marks_awarded) / sum(i.marks_available), 4),
    0,
    p_assessment_id
  from assessment_items i
  join question_templates q on q.id = i.question_template_id
  join assessment_item_marks m
    on m.assessment_id = i.assessment_id and m.question_template_id = i.question_template_id
  where i.assessment_id = p_assessment_id
    and q.objective_id is not null
  group by q.objective_id
  on conflict (student_id, term_assessment_id, objective_id)
    where event_type = 'Formal_Assessment' and term_assessment_id is not null
  do update set score_ratio = excluded.score_ratio;

  update term_assessments
  set status = 'Marked',
      student_id = p_student_id,
      student_score = round(100 * v_awarded_total / v_available_total, 2),
      marked_by = v_marker,
      marked_at = now(),
      parent_overall_feedback = nullif(p_feedback, '')
  where id = p_assessment_id;

  return jsonb_build_object(
    'awarded', v_awarded_total,
    'available', v_available_total,
    'mistakes', v_mistakes
  );
end;
$$;

revoke all on function public.save_assessment_marks(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.save_assessment_marks(uuid, uuid, jsonb, text) to authenticated;

-- ------------------------------------------------- 3.6 evidence review

alter table evidence_portfolio
  add column if not exists household_id uuid references households (id) on delete cascade;
alter table evidence_portfolio alter column household_id set not null;
alter table evidence_portfolio add column if not exists title text;
alter table evidence_portfolio add column if not exists mime_type text;
alter table evidence_portfolio add column if not exists byte_size int;
alter table evidence_portfolio add column if not exists reviewed_at timestamptz;

-- A learner submits; only a guardian decides. Without this a learner could
-- set their own row to Approved through the student-owned write policy.
create or replace function public.evidence_portfolio_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_household_staff() then
    if tg_op = 'UPDATE' and new.evaluation_status is distinct from old.evaluation_status then
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.evaluation_status := 'Submitted';
    new.parent_feedback := null;
    new.marked_by := null;
    new.reviewed_at := null;
  else
    new.evaluation_status := old.evaluation_status;
    new.parent_feedback := old.parent_feedback;
    new.marked_by := old.marked_by;
    new.reviewed_at := old.reviewed_at;
  end if;

  return new;
end;
$$;

drop trigger if exists evidence_portfolio_guard on evidence_portfolio;
create trigger evidence_portfolio_guard
  before insert or update on evidence_portfolio
  for each row execute function public.evidence_portfolio_guard();

-- ------------------------------------------------------------- storage

-- One private bucket. Paths are {household_id}/{kind}/{profile_id}/{file}, so
-- the first folder decides the household and the third the uploader.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'household-files', 'household-files', false, 15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists household_files_read on storage.objects;
create policy household_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'household-files'
    and (storage.foldername(name))[1] = public.current_household_id()::text
  );

drop policy if exists household_files_insert on storage.objects;
create policy household_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'household-files'
    and (storage.foldername(name))[1] = public.current_household_id()::text
    and (storage.foldername(name))[2] in ('questions', 'working', 'evidence')
    and (
      (storage.foldername(name))[3] = public.current_profile_id()::text
      or public.is_household_staff()
    )
  );

drop policy if exists household_files_delete on storage.objects;
create policy household_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'household-files'
    and (storage.foldername(name))[1] = public.current_household_id()::text
    and (owner_id = auth.uid()::text or public.is_household_staff())
  );
