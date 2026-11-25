-- Phase 4, Step 4.2: checkpoints and practice write scored events, and trivia becomes household
-- content a parent authors.
--
-- 1. trivia_modules / trivia_questions had no household, so any signed-in person could read every
--    question key and any guardian could edit another family's modules. Both tables are now
--    household-scoped: learners read a key-free view, staff write only their own household.
-- 2. The four fixed topic areas were a check constraint. The authoring form lets a parent type
--    their own area, so the constraint goes and the column stays free text.
-- 3. answer_trivia_checkpoint() scores a documentary checkpoint in Postgres, like answer_checkpoint
--    does for the question bank, and writes the Active_Recall event.

-- ------------------------------------------------------------ trivia tables
alter table trivia_modules
  add column if not exists household_id uuid references households (id) on delete cascade;
alter table trivia_questions
  add column if not exists household_id uuid references households (id) on delete cascade;

alter table trivia_modules drop constraint if exists trivia_modules_topic_area_check;

create index if not exists trivia_modules_household_idx on trivia_modules (household_id, created_at);
create index if not exists trivia_questions_household_idx on trivia_questions (household_id, module_id);

drop policy if exists trivia_modules_read on trivia_modules;
drop policy if exists trivia_modules_write on trivia_modules;
drop policy if exists trivia_modules_staff on trivia_modules;

create policy trivia_modules_read on trivia_modules
  for select to authenticated
  using (household_id = public.current_household_id());

create policy trivia_modules_staff on trivia_modules
  for all to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id())
  with check (public.is_household_staff() and household_id = public.current_household_id());

-- Questions keep their keys, so only staff of the owning household may read the table itself.
drop policy if exists trivia_questions_read on trivia_questions;
drop policy if exists trivia_questions_write on trivia_questions;
drop policy if exists trivia_questions_staff on trivia_questions;

create policy trivia_questions_read on trivia_questions
  for select to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id());

create policy trivia_questions_staff on trivia_questions
  for all to authenticated
  using (public.is_household_staff() and household_id = public.current_household_id())
  with check (public.is_household_staff() and household_id = public.current_household_id());

-- ------------------------------------------------------------ learner-safe trivia
-- Owned by the migration role, so it reads the table without the caller's RLS, and exposes no
-- correct_letter or explanation until the checkpoint has been answered.
create or replace view public.learner_trivia_questions
with (security_barrier = true)
as
select
  q.id,
  q.module_id,
  q.at_seconds,
  q.prompt,
  q.options
from trivia_questions q
join trivia_modules m on m.id = q.module_id
where q.household_id = public.current_household_id()
  and m.household_id = public.current_household_id()
  and m.is_published;

revoke all on public.learner_trivia_questions from anon, public;
grant select on public.learner_trivia_questions to authenticated;

-- ------------------------------------------------------------ answer_trivia_checkpoint
create or replace function public.answer_trivia_checkpoint(p_question_id uuid, p_option text)
returns table (correct boolean, correct_option text, explanation text, event_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := public.current_profile_id();
  v_question trivia_questions%rowtype;
  v_ok boolean;
  v_event uuid;
begin
  if v_student is null or not public.is_current_learner() then
    raise exception 'Only a learner can answer a checkpoint.' using errcode = '42501';
  end if;

  select q.* into v_question
  from trivia_questions q
  join trivia_modules m on m.id = q.module_id
  where q.id = p_question_id
    and q.household_id = public.current_household_id()
    and m.household_id = public.current_household_id()
    and m.is_published;

  if not found then
    raise exception 'That checkpoint is not available.' using errcode = 'P0002';
  end if;

  v_ok := upper(trim(p_option)) = v_question.correct_letter;

  insert into learning_events (student_id, objective_id, event_type, score_ratio, actual_minutes_spent, flagged_stuck)
  values (v_student, null, 'Active_Recall', case when v_ok then 1 else 0 end, 0, false)
  returning id into v_event;

  return query select v_ok, v_question.correct_letter, v_question.explanation, v_event;
end;
$$;

revoke all on function public.answer_trivia_checkpoint(uuid, text) from public, anon;
grant execute on function public.answer_trivia_checkpoint(uuid, text) to authenticated;
