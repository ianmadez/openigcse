-- Phase 6, Step 6.4: objective lineage.
--
-- When a package is regenerated or a new syllabus edition replaces an old one,
-- the replaced objectives are retired (kept, so history still resolves) and a
-- lineage row says which objective each one became. A guardian then moves the
-- household's progress along confirmed links with carry_over_objective_progress().

alter table learning_objectives add column if not exists retired_at timestamptz;
alter table topics add column if not exists retired_at timestamptz;

create table if not exists objective_lineage (
  id uuid primary key default gen_random_uuid(),
  from_objective_id uuid not null references learning_objectives(id) on delete cascade,
  to_objective_id uuid not null references learning_objectives(id) on delete cascade,
  method text not null check (method in ('unchanged', 'text-match', 'manual')),
  confirmed_by text,
  created_at timestamptz not null default now(),
  unique (from_objective_id),
  check (from_objective_id <> to_objective_id)
);

-- Reference data, like the rest of the curriculum: readable when signed in, written by staff.
alter table objective_lineage enable row level security;

drop policy if exists objective_lineage_read on objective_lineage;
create policy objective_lineage_read on objective_lineage
  for select to authenticated
  using (true);

drop policy if exists objective_lineage_write on objective_lineage;
create policy objective_lineage_write on objective_lineage
  for all to authenticated
  using (public.is_household_staff())
  with check (public.is_household_staff());

-- Moves the caller's household rows from retired objectives to their successors.
-- SECURITY DEFINER because fsrs_review_log has no update policy (it is written only
-- through functions); every statement is therefore scoped explicitly to the
-- caller's own household and refuses anyone who is not its guardian. A review
-- schedule already present on the successor is kept and the old one is left in
-- place (and counted), never merged.
create or replace function public.carry_over_objective_progress()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  moved jsonb := '{}'::jsonb;
  n integer;
  kept integer;
begin
  if v_household is null or not public.is_household_staff() then
    raise exception 'Only a guardian can move progress.' using errcode = '42501';
  end if;

  update learning_events e set objective_id = l.to_objective_id
    from objective_lineage l
   where e.objective_id = l.from_objective_id and public.is_household_student(e.student_id);
  get diagnostics n = row_count; moved := moved || jsonb_build_object('learning_events', n);

  update mistake_notebook m set objective_id = l.to_objective_id
    from objective_lineage l
   where m.objective_id = l.from_objective_id and public.is_household_student(m.student_id);
  get diagnostics n = row_count; moved := moved || jsonb_build_object('mistake_notebook', n);

  update question_templates q set objective_id = l.to_objective_id
    from objective_lineage l
   where q.objective_id = l.from_objective_id and q.household_id = v_household;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('question_templates', n);

  update evidence_portfolio p set objective_id = l.to_objective_id
    from objective_lineage l
   where p.objective_id = l.from_objective_id and public.is_household_student(p.student_id);
  get diagnostics n = row_count; moved := moved || jsonb_build_object('evidence_portfolio', n);

  update day_plan_items d set learning_objective_id = l.to_objective_id
    from objective_lineage l
   where d.learning_objective_id = l.from_objective_id and d.household_id = v_household;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('day_plan_items', n);

  update fsrs_review_log r set objective_id = l.to_objective_id
    from objective_lineage l
   where r.objective_id = l.from_objective_id and public.is_household_student(r.student_id);
  get diagnostics n = row_count; moved := moved || jsonb_build_object('fsrs_review_log', n);

  update fsrs_retention_items f set objective_id = l.to_objective_id
    from objective_lineage l
   where f.objective_id = l.from_objective_id
     and public.is_household_student(f.student_id)
     and not exists (
       select 1 from fsrs_retention_items t where t.student_id = f.student_id and t.objective_id = l.to_objective_id
     );
  get diagnostics n = row_count; moved := moved || jsonb_build_object('fsrs_retention_items', n);

  select count(*) into kept
    from fsrs_retention_items f join objective_lineage l on f.objective_id = l.from_objective_id
   where public.is_household_student(f.student_id);
  moved := moved || jsonb_build_object('schedules_left_on_retired', kept);

  return moved;
end;
$$;

revoke all on function public.carry_over_objective_progress() from public;
grant execute on function public.carry_over_objective_progress() to authenticated;
