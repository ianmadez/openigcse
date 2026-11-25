-- Phase 4, Step 4.3: spaced review with FSRS.
--
-- The scheduler itself lives in TypeScript (`src/lib/retention/fsrs.ts`, using ts-fsrs). Postgres
-- stores the card, claims each learning event exactly once, and refuses a learner writing another
-- learner's card. A review is applied either by the learner who owns the event or by staff of their
-- household, so the marking action can fold the Formal_Assessment events it just wrote.
--
-- `fsrs_review_log` is the idempotency key: one row per learning event. Two devices answering the
-- same checkpoint therefore advance the card once, not twice.

alter table fsrs_retention_items
  add column if not exists fsrs_state smallint not null default 0 check (fsrs_state between 0 and 3);
alter table fsrs_retention_items
  add column if not exists scheduled_days int not null default 0;
alter table fsrs_retention_items
  add column if not exists learning_steps int not null default 0;
-- FSRS stability is a day count; the original numeric(8,4) tops out just under 10,000 days.
alter table fsrs_retention_items alter column stability type numeric(12,4);

create table if not exists fsrs_review_log (
  event_id uuid primary key references learning_events (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  objective_id uuid not null references learning_objectives (id) on delete cascade,
  score_ratio numeric(5,4) not null,
  event_type text not null,
  rating smallint not null check (rating between 1 and 4),
  reviewed_at timestamptz not null,
  due_at timestamptz not null,
  stability numeric(12,4) not null,
  difficulty numeric(5,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists fsrs_review_log_student_idx on fsrs_review_log (student_id, reviewed_at desc);

alter table fsrs_review_log enable row level security;

drop policy if exists fsrs_review_log_read on fsrs_review_log;
create policy fsrs_review_log_read on fsrs_review_log
  for select to authenticated
  using (
    student_id = public.current_profile_id()
    or (public.is_household_staff() and public.is_household_student(student_id))
  );

revoke all on fsrs_review_log from anon, public;
grant select on fsrs_review_log to authenticated;

-- ------------------------------------------------------------ pending events
-- Scored events (recall, application, assessment) that have an objective and no review row yet.
-- security invoker: the caller's RLS decides which events they can see.
create or replace function public.pending_review_events(p_student uuid, p_limit int default 200)
returns table (event_id uuid, objective_id uuid, event_type text, score_ratio numeric, event_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select e.id, e.objective_id, e.event_type, e.score_ratio, coalesce(e.created_at, now())
  from learning_events e
  where e.student_id = p_student
    and e.objective_id is not null
    and e.event_type in ('Active_Recall', 'Application_Question', 'Formal_Assessment')
    and not exists (select 1 from fsrs_review_log l where l.event_id = e.id)
  order by e.created_at asc
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

revoke all on function public.pending_review_events(uuid, int) from anon, public;
grant execute on function public.pending_review_events(uuid, int) to authenticated;

-- ------------------------------------------------------------ record_review
-- Applies one already-computed card. The caller validates the rating and the card shape; this
-- function validates the event, claims it, and upserts the card in one transaction.
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

  -- Trivia writes no objective, so there is no card to move.
  if v_event.objective_id is null then
    return query select false, null::timestamptz;
    return;
  end if;

  insert into fsrs_review_log (event_id, student_id, objective_id, score_ratio, event_type, rating, reviewed_at, due_at, stability, difficulty)
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
    v_difficulty
  )
  on conflict (event_id) do nothing;

  -- Already folded in by another device: say so instead of advancing the card twice.
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
