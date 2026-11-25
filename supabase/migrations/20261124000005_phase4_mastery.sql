-- Phase 4, Step 4.4: mastery and progress from events.
--
-- Mastery is never stored. objective_mastery() computes it on every read from learning_events,
-- recency-weighted, blended with the FSRS card:
--   event weight     Formal_Assessment 1.0, Application_Question 0.8, Active_Recall 0.6
--   recency          each event's weight halves every 30 days
--   event component  weighted mean of score_ratio
--   mastery          0.7 * event component + 0.3 * FSRS retrievability
-- Coverage counts any event with an objective, including a lesson, which adds no score.
--
-- fsrs_retrievability() is the same forgetting curve ts-fsrs uses (FSRS-6, decay -0.1542, elapsed
-- days floored), so the SQL and src/lib/retention/fsrs.ts cannot drift.
--
-- Review compliance needs the due date a review was answering. record_review() is replaced to keep
-- it, and fsrs_review_log gains previous_due_at / on_time.

alter table fsrs_review_log add column if not exists previous_due_at timestamptz;
alter table fsrs_review_log add column if not exists on_time boolean;

create or replace function public.record_review(p_event_id uuid, p_rating smallint, p_card jsonb)
returns table (applied boolean, due_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event learning_events%rowtype;
  v_due timestamptz := (p_card ->> 'dueAt')::timestamptz;
  v_stability numeric := (p_card ->> 'stability')::numeric;
  v_difficulty numeric := (p_card ->> 'difficulty')::numeric;
  v_retrievability numeric := coalesce((p_card ->> 'retrievability')::numeric, 0);
  v_status text := p_card ->> 'status';
  v_state smallint := coalesce((p_card ->> 'state')::smallint, 0);
  v_scheduled_days int := coalesce((p_card ->> 'scheduledDays')::int, 0);
  v_learning_steps int := coalesce((p_card ->> 'learningSteps')::int, 0);
  v_reps int := coalesce((p_card ->> 'reps')::int, 0);
  v_lapses int := coalesce((p_card ->> 'lapses')::int, 0);
  v_previous_due timestamptz;
begin
  if p_rating is null or p_rating not between 1 and 4 then
    raise exception 'A review rating is 1 to 4.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_card) is distinct from 'object'
     or v_due is null or v_stability is null or v_difficulty is null then
    raise exception 'The review card is incomplete.' using errcode = '22023';
  end if;

  select * into v_event from learning_events where id = p_event_id;
  if not found then
    raise exception 'That event is not in the log.' using errcode = 'P0002';
  end if;

  if not (
    v_event.student_id = public.current_profile_id()
    or (public.is_household_staff() and public.is_household_student(v_event.student_id))
  ) then
    raise exception 'Only the learner or their guardian can record a review.' using errcode = '42501';
  end if;

  if v_event.event_type not in ('Active_Recall', 'Application_Question', 'Formal_Assessment') then
    raise exception 'That event type does not drive retention.' using errcode = '22023';
  end if;

  if v_event.objective_id is null then
    return query select false, null::timestamptz;
    return;
  end if;

  select r.due_at into v_previous_due
  from fsrs_retention_items r
  where r.student_id = v_event.student_id and r.objective_id = v_event.objective_id;

  insert into fsrs_review_log (
    event_id, student_id, objective_id, score_ratio, event_type, rating,
    reviewed_at, due_at, stability, difficulty, previous_due_at, on_time
  )
  values (
    p_event_id,
    v_event.student_id,
    v_event.objective_id,
    v_event.score_ratio,
    v_event.event_type,
    p_rating,
    coalesce(v_event.created_at, now()),
    v_due,
    v_stability,
    v_difficulty,
    v_previous_due,
    case when v_previous_due is null then null
         else coalesce(v_event.created_at, now()) <= v_previous_due end
  )
  on conflict (event_id) do nothing;

  if not found then
    return query
      select false, r.due_at
      from fsrs_retention_items r
      where r.student_id = v_event.student_id and r.objective_id = v_event.objective_id;
    return;
  end if;

  insert into fsrs_retention_items as r (
    student_id, objective_id, stability, difficulty, retrievability,
    reps, lapses, last_reviewed_at, due_at, status, fsrs_state, scheduled_days, learning_steps
  )
  values (
    v_event.student_id, v_event.objective_id, v_stability, v_difficulty, v_retrievability,
    v_reps, v_lapses, coalesce(v_event.created_at, now()), v_due, v_status, v_state, v_scheduled_days, v_learning_steps
  )
  on conflict (student_id, objective_id) do update
    set stability = excluded.stability,
        difficulty = excluded.difficulty,
        retrievability = excluded.retrievability,
        reps = excluded.reps,
        lapses = excluded.lapses,
        last_reviewed_at = excluded.last_reviewed_at,
        due_at = excluded.due_at,
        status = excluded.status,
        fsrs_state = excluded.fsrs_state,
        scheduled_days = excluded.scheduled_days,
        learning_steps = excluded.learning_steps;

  return query select true, v_due;
end;
$$;

revoke all on function public.record_review(uuid, smallint, jsonb) from anon, public;
grant execute on function public.record_review(uuid, smallint, jsonb) to authenticated;

-- ------------------------------------------------------------ forgetting curve
create or replace function public.fsrs_retrievability(
  p_stability numeric,
  p_last_reviewed_at timestamptz,
  p_now timestamptz
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_stability is null or p_stability <= 0 or p_last_reviewed_at is null then 0::numeric
    else round(
      power(
        1
        + 0.9803464944134799 * floor(greatest(0, extract(epoch from (p_now - p_last_reviewed_at))) / 86400.0) / p_stability,
        -0.1542
      ),
      4
    )
  end;
$$;

revoke all on function public.fsrs_retrievability(numeric, timestamptz, timestamptz) from anon, public;
grant execute on function public.fsrs_retrievability(numeric, timestamptz, timestamptz) to authenticated;

-- ------------------------------------------------------------ objective_mastery
create or replace function public.objective_mastery(p_student uuid)
returns table (
  objective_id uuid,
  mastery numeric,
  event_mastery numeric,
  retrievability numeric,
  covered boolean,
  last_event_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with events as (
    select e.objective_id, e.event_type, e.score_ratio, e.created_at
    from learning_events e
    where e.student_id = p_student
      and e.objective_id is not null
  ),
  touched as (
    select objective_id, max(created_at) as last_event_at
    from events
    group by objective_id
  ),
  scored as (
    select
      objective_id,
      sum(
        case event_type
          when 'Formal_Assessment' then 1.0
          when 'Application_Question' then 0.8
          else 0.6
        end
        * score_ratio
        * power(0.5, extract(epoch from (now() - created_at)) / (30 * 86400.0))
      ) as weighted_score,
      sum(
        case event_type
          when 'Formal_Assessment' then 1.0
          when 'Application_Question' then 0.8
          else 0.6
        end
        * power(0.5, extract(epoch from (now() - created_at)) / (30 * 86400.0))
      ) as weight
    from events
    where event_type in ('Active_Recall', 'Application_Question', 'Formal_Assessment')
    group by objective_id
  ),
  cards as (
    select
      r.objective_id,
      public.fsrs_retrievability(r.stability, r.last_reviewed_at, now()) as retrievability
    from fsrs_retention_items r
    where r.student_id = p_student
  ),
  ids as (
    select objective_id from touched
    union
    select objective_id from cards
  )
  select
    i.objective_id,
    round(
      0.7 * coalesce(s.weighted_score / nullif(s.weight, 0), 0)
      + 0.3 * coalesce(c.retrievability, 0),
      4
    ) as mastery,
    round(coalesce(s.weighted_score / nullif(s.weight, 0), 0), 4) as event_mastery,
    round(coalesce(c.retrievability, 0), 4) as retrievability,
    t.objective_id is not null as covered,
    t.last_event_at
  from ids i
  left join scored s on s.objective_id = i.objective_id
  left join cards c on c.objective_id = i.objective_id
  left join touched t on t.objective_id = i.objective_id;
$$;

revoke all on function public.objective_mastery(uuid) from anon, public;
grant execute on function public.objective_mastery(uuid) to authenticated;

-- ------------------------------------------------------------ review_compliance
-- Reviews that answered a previous card only; the first review of an objective had no due date.
create or replace function public.review_compliance(p_student uuid)
returns table (reviews int, on_time int)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::int as reviews,
    (count(*) filter (where l.on_time))::int as on_time
  from fsrs_review_log l
  where l.student_id = p_student
    and l.previous_due_at is not null;
$$;

revoke all on function public.review_compliance(uuid) from anon, public;
grant execute on function public.review_compliance(uuid) to authenticated;
