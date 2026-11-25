-- Phase 5: devices count timed effects (a break, an unlock) against the database clock, not their
-- own. The exit-gate run found the study machine 26 seconds off the database, which showed a
-- 10-minute break as 10:26. Pages read seconds-left from here and count down locally.
create or replace function public.seconds_left(p_until timestamptz)
returns int
language sql
stable
as $$
  select greatest(0, ceil(extract(epoch from (p_until - now()))))::int;
$$;

grant execute on function public.seconds_left(timestamptz) to authenticated;
