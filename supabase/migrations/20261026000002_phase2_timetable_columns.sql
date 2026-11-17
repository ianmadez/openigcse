-- =====================================================================
-- Phase 2: timetable columns the editor and the generator need.
--
-- The Phase 0 migration already created timetable_slots, timetable_overrides
-- and day_plan_items with household_id and RLS. This file only adds the
-- columns later phases depend on, so nothing has to be recreated.
-- =====================================================================

-- The grid draws a colour per block; the palette picks one per subject.
alter table timetable_slots add column if not exists colour text;

-- School hours live on the term, because a family changes them per term.
alter table academic_terms add column if not exists school_day_start time not null default '08:00';
alter table academic_terms add column if not exists school_day_end time not null default '15:00';

-- A plan item is the materialisation of one slot on one date, which makes the
-- generator idempotent: re-running a day updates instead of duplicating.
alter table day_plan_items add column if not exists slot_id uuid references timetable_slots (id) on delete cascade;

-- The learner may reorder within a period. The parent sees that they did.
alter table day_plan_items add column if not exists student_reordered boolean not null default false;

-- One item per slot per day per learner.
create unique index if not exists day_plan_items_slot_day_idx
  on day_plan_items (student_id, plan_date, slot_id)
  where slot_id is not null;

create index if not exists timetable_slots_household_term_idx
  on timetable_slots (household_id, academic_term_id, day_of_week);

-- Overrides are read on every /today render, so keep the date lookup cheap.
create index if not exists timetable_overrides_household_date_idx
  on timetable_overrides (household_id, override_date);

-- A slot cannot end before it starts, and it has to sit on the day it claims.
alter table timetable_slots drop constraint if exists timetable_slots_time_order;
alter table timetable_slots
  add constraint timetable_slots_time_order check (end_time > start_time);

alter table day_plan_items drop constraint if exists day_plan_items_minutes_non_negative;
alter table day_plan_items
  add constraint day_plan_items_minutes_non_negative check (planned_minutes >= 0 and actual_minutes >= 0);

-- The parent editor and the student strip both read the weekly template live.
do $$
begin
  begin
    alter publication supabase_realtime add table timetable_slots;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table timetable_overrides;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
