-- Phase 5: an approved "more time" request adds assessment_sittings.extra_minutes. The sitting
-- stays open for the extra minutes, and marking waits for them, so both functions add it.

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
      and now() < s.started_at + make_interval(mins => a.duration_minutes + s.extra_minutes + 2)
  );
$$;

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
      and now() < s.started_at + make_interval(mins => v_assessment.duration_minutes + s.extra_minutes)
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
