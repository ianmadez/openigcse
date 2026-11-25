-- Phase 4, Task 0: RLS tightening before the learning loop is built on it.
--
-- 1. Student-owned tables (20261026000001) let the learner write ANY column of their own rows, so a
--    learner could edit scores, resolve mistakes or approve evidence directly. The `_write` policies
--    are split into a staff policy (same household) and a narrow learner policy.
-- 2. Learners no longer read question_templates directly: options_schema carries the answer key.
--    They read public.learner_questions (keys stripped, unsat paper questions hidden), and answer
--    through answer_checkpoint(), which computes the score itself.
-- 3. Learners can add only unscored events (lesson time, stuck) and their own notebook entries.
--    Scored events and resolving a mistake go through security definer functions.

-- ------------------------------------------------------------ helpers
create or replace function public.is_household_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = p_student and household_id = public.current_household_id()
  );
$$;

create or replace function public.is_current_learner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = public.current_profile_id() and role = 'student');
$$;

grant execute on function public.is_household_student(uuid), public.is_current_learner() to authenticated;

-- ------------------------------------------------------------ learning_events
drop policy if exists learning_events_read on learning_events;
drop policy if exists learning_events_write on learning_events;
drop policy if exists learning_events_staff on learning_events;
drop policy if exists learning_events_learner_insert on learning_events;

create policy learning_events_read on learning_events
  for select to authenticated
  using (
    student_id = public.current_profile_id()
    or (public.is_household_staff() and public.is_household_student(student_id))
  );

create policy learning_events_staff on learning_events
  for all to authenticated
  using (public.is_household_staff() and public.is_household_student(student_id))
  with check (public.is_household_staff() and public.is_household_student(student_id));

-- Learners may log time and ask for help; they cannot award themselves a score.
create policy learning_events_learner_insert on learning_events
  for insert to authenticated
  with check (
    student_id = public.current_profile_id()
    and public.is_current_learner()
    and term_assessment_id is null
    and coalesce(score_ratio, 0) = 0
    and (
      (event_type = 'Exposure_Lesson' and not coalesce(flagged_stuck, false))
      or (event_type = 'Application_Question' and coalesce(flagged_stuck, false))
    )
  );

-- ------------------------------------------------------------ mistake_notebook
alter table mistake_notebook add column if not exists correction_submitted_at timestamptz;
alter table mistake_notebook add column if not exists resolved_at timestamptz;

drop policy if exists mistake_notebook_read on mistake_notebook;
drop policy if exists mistake_notebook_write on mistake_notebook;
drop policy if exists mistake_notebook_staff on mistake_notebook;
drop policy if exists mistake_notebook_learner_insert on mistake_notebook;

create policy mistake_notebook_read on mistake_notebook
  for select to authenticated
  using (
    student_id = public.current_profile_id()
    or (public.is_household_staff() and public.is_household_student(student_id))
  );

create policy mistake_notebook_staff on mistake_notebook
  for all to authenticated
  using (public.is_household_staff() and public.is_household_student(student_id))
  with check (public.is_household_staff() and public.is_household_student(student_id));

create policy mistake_notebook_learner_insert on mistake_notebook
  for insert to authenticated
  with check (
    student_id = public.current_profile_id()
    and public.is_current_learner()
    and source = 'student'
    and not resolved
    and term_assessment_id is null
    and resolved_at is null
    and correction_submitted_at is null
  );

-- ------------------------------------------------------------ fsrs_retention_items
drop policy if exists fsrs_retention_items_read on fsrs_retention_items;
drop policy if exists fsrs_retention_items_write on fsrs_retention_items;
drop policy if exists fsrs_retention_items_staff on fsrs_retention_items;

create policy fsrs_retention_items_read on fsrs_retention_items
  for select to authenticated
  using (
    student_id = public.current_profile_id()
    or (public.is_household_staff() and public.is_household_student(student_id))
  );

create policy fsrs_retention_items_staff on fsrs_retention_items
  for all to authenticated
  using (public.is_household_staff() and public.is_household_student(student_id))
  with check (public.is_household_staff() and public.is_household_student(student_id));

-- ------------------------------------------------------------ kiosk_sessions
drop policy if exists kiosk_sessions_read on kiosk_sessions;
drop policy if exists kiosk_sessions_write on kiosk_sessions;
drop policy if exists kiosk_sessions_staff on kiosk_sessions;
drop policy if exists kiosk_sessions_learner_insert on kiosk_sessions;

create policy kiosk_sessions_read on kiosk_sessions
  for select to authenticated
  using (
    student_id = public.current_profile_id()
    or (public.is_household_staff() and public.is_household_student(student_id))
  );

create policy kiosk_sessions_staff on kiosk_sessions
  for all to authenticated
  using (public.is_household_staff() and public.is_household_student(student_id))
  with check (public.is_household_staff() and public.is_household_student(student_id));

create policy kiosk_sessions_learner_insert on kiosk_sessions
  for insert to authenticated
  with check (student_id = public.current_profile_id() and public.is_current_learner());

-- ------------------------------------------------------------ evidence_portfolio
-- The status guard trigger (Phase 3) still stops learners setting status or feedback.
drop policy if exists evidence_portfolio_read on evidence_portfolio;
drop policy if exists evidence_portfolio_write on evidence_portfolio;
drop policy if exists evidence_portfolio_staff on evidence_portfolio;
drop policy if exists evidence_portfolio_learner on evidence_portfolio;

create policy evidence_portfolio_read on evidence_portfolio
  for select to authenticated
  using (
    student_id = public.current_profile_id()
    or (public.is_household_staff() and public.is_household_student(student_id))
  );

create policy evidence_portfolio_staff on evidence_portfolio
  for all to authenticated
  using (public.is_household_staff() and public.is_household_student(student_id))
  with check (public.is_household_staff() and public.is_household_student(student_id));

create policy evidence_portfolio_learner on evidence_portfolio
  for all to authenticated
  using (student_id = public.current_profile_id() and public.is_current_learner())
  with check (
    student_id = public.current_profile_id()
    and public.is_current_learner()
    and household_id = public.current_household_id()
  );

-- ------------------------------------------------------------ answer keys
drop policy if exists question_templates_read on question_templates;
create policy question_templates_read on question_templates
  for select to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id());

-- Learner-safe questions: no `correct` flag, no rubric, no model answer. A question that sits on a
-- paper stays hidden until the learner has started that paper.
create or replace view public.learner_questions
with (security_barrier = true)
as
select
  q.id,
  q.household_id,
  q.objective_id,
  q.question_type,
  q.prompt_template,
  case
    when jsonb_typeof(q.options_schema) = 'array' then (
      select coalesce(jsonb_agg(case when jsonb_typeof(o) = 'object' then o - 'correct' else o end order by n), '[]'::jsonb)
      from jsonb_array_elements(q.options_schema) with ordinality as e(o, n)
    )
  end as options_schema,
  q.parts,
  q.image_paths,
  q.max_marks,
  q.tier
from question_templates q
where q.household_id = public.current_household_id()
  and (
    public.is_household_staff()
    or not exists (select 1 from assessment_items i where i.question_template_id = q.id)
    or exists (
      select 1
      from assessment_items i
      join assessment_sittings s on s.assessment_id = i.assessment_id
      where i.question_template_id = q.id and s.student_id = public.current_profile_id()
    )
  );

revoke all on public.learner_questions from anon, public;
grant select on public.learner_questions to authenticated;

-- ------------------------------------------------------------ answer_checkpoint
create or replace function public.answer_checkpoint(p_question_id uuid, p_option text, p_kind text default 'recall')
returns table (correct boolean, correct_option text, explanation text, event_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := public.current_profile_id();
  v_question question_templates%rowtype;
  v_key text;
  v_ok boolean;
  v_event uuid;
begin
  if v_student is null or not public.is_current_learner() then
    raise exception 'Only a learner can answer a checkpoint.' using errcode = '42501';
  end if;
  if p_kind not in ('recall', 'practice') then
    raise exception 'Unknown checkpoint kind.' using errcode = '22023';
  end if;

  select * into v_question
  from question_templates
  where id = p_question_id and household_id = public.current_household_id() and question_type = 'MCQ';
  if not found then
    raise exception 'That question is not available.' using errcode = 'P0002';
  end if;

  -- A question on a paper can be practised only after that paper is handed in.
  if exists (
    select 1 from assessment_items i
    where i.question_template_id = p_question_id
      and not exists (
        select 1 from assessment_sittings s
        where s.assessment_id = i.assessment_id and s.student_id = v_student and s.submitted_at is not null
      )
  ) then
    raise exception 'That question is on a paper you have not sat yet.' using errcode = '42501';
  end if;

  select o ->> 'letter' into v_key
  from jsonb_array_elements(v_question.options_schema) o
  where coalesce((o ->> 'correct')::boolean, false)
  limit 1;

  v_ok := v_key is not null and upper(trim(p_option)) = v_key;

  insert into learning_events (student_id, objective_id, event_type, score_ratio, actual_minutes_spent, flagged_stuck)
  values (
    v_student,
    v_question.objective_id,
    case p_kind when 'practice' then 'Application_Question' else 'Active_Recall' end,
    case when v_ok then 1 else 0 end,
    0,
    false
  )
  returning id into v_event;

  return query select v_ok, v_key, v_question.mark_scheme_rubric, v_event;
end;
$$;

revoke all on function public.answer_checkpoint(uuid, text, text) from public, anon;
grant execute on function public.answer_checkpoint(uuid, text, text) to authenticated;

-- ------------------------------------------------------------ resolve_mistake
-- A mistake with a stored multiple-choice question resolves only on a correct retry, logged as
-- Error_Correction. Without one, the learner writes a correction and a guardian approves it.
create or replace function public.resolve_mistake(p_mistake_id uuid, p_option text default null, p_correction text default null)
returns table (resolved boolean, awaiting_parent boolean, correct_option text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := public.current_profile_id();
  v_mistake mistake_notebook%rowtype;
  v_question question_templates%rowtype;
  v_key text;
  v_ok boolean;
begin
  if v_student is null or not public.is_current_learner() then
    raise exception 'Only the learner can resolve their own mistake.' using errcode = '42501';
  end if;

  select * into v_mistake from mistake_notebook where id = p_mistake_id and student_id = v_student;
  if not found then
    raise exception 'That mistake is not in your notebook.' using errcode = 'P0002';
  end if;

  if v_mistake.resolved then
    return query select true, false, null::text;
    return;
  end if;

  if v_mistake.question_template_id is not null then
    select * into v_question from question_templates where id = v_mistake.question_template_id and question_type = 'MCQ';
  end if;

  if v_question.id is not null then
    if p_option is null or trim(p_option) = '' then
      raise exception 'Answer the question again to resolve it.' using errcode = '22023';
    end if;

    select o ->> 'letter' into v_key
    from jsonb_array_elements(v_question.options_schema) o
    where coalesce((o ->> 'correct')::boolean, false)
    limit 1;
    v_ok := v_key is not null and upper(trim(p_option)) = v_key;

    insert into learning_events (student_id, objective_id, event_type, score_ratio, actual_minutes_spent, flagged_stuck)
    values (v_student, v_mistake.objective_id, 'Error_Correction', case when v_ok then 1 else 0 end, 0, false);

    if v_ok then
      update mistake_notebook set resolved = true, resolved_at = now() where id = p_mistake_id;
    end if;

    return query select v_ok, false, case when v_ok then v_key else null end;
    return;
  end if;

  if p_correction is null or length(trim(p_correction)) < 3 then
    raise exception 'Write what the right answer is, so a parent can check it.' using errcode = '22023';
  end if;

  update mistake_notebook
  set student_reflection = trim(p_correction), correction_submitted_at = now()
  where id = p_mistake_id;

  return query select false, true, null::text;
end;
$$;

revoke all on function public.resolve_mistake(uuid, text, text) from public, anon;
grant execute on function public.resolve_mistake(uuid, text, text) to authenticated;
