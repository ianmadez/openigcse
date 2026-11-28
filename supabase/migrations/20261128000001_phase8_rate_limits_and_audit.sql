-- Phase 8: rate limits before sign-in, and an audit log of parent actions.

-- Rate limits. Sign-in and pairing run before anyone has a session, so the check is a
-- security definer function callable by anon; the table itself has no policies and is
-- unreadable through the API. Keys are hashed by the caller (IP, IP + email).
create table if not exists auth_rate_limits (
  id bigint generated always as identity primary key,
  bucket text not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_rate_limits_lookup_idx on auth_rate_limits (bucket, key_hash, created_at desc);
alter table auth_rate_limits enable row level security;

-- Records one attempt and returns the seconds to wait, or 0 when the attempt is allowed.
create or replace function public.hit_rate_limit(p_bucket text, p_key text, p_max int, p_window_seconds int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_oldest timestamptz;
begin
  if p_bucket is null or p_key is null or p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments';
  end if;

  delete from auth_rate_limits where created_at < now() - interval '1 day';

  select count(*), min(created_at) into v_count, v_oldest
  from auth_rate_limits
  where bucket = p_bucket and key_hash = p_key
    and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max then
    return greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds) - now())))::int);
  end if;

  insert into auth_rate_limits (bucket, key_hash) values (p_bucket, p_key);
  return 0;
end;
$$;

revoke all on function public.hit_rate_limit(text, text, int, int) from public;
grant execute on function public.hit_rate_limit(text, text, int, int) to anon, authenticated;

-- Audit log: unlocks, approvals, mark changes and other parent actions.
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  actor_profile_id uuid references profiles (id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  target_type text,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_household_idx on audit_log (household_id, created_at desc);
alter table audit_log enable row level security;

-- Staff read their household's log. Inserts must name the caller and their household;
-- nobody updates or deletes through the API, so the log is append-only.
create policy audit_log_read on audit_log
  for select using (household_id = public.current_household_id() and public.is_household_staff());

create policy audit_log_insert on audit_log
  for insert with check (
    household_id = public.current_household_id()
    and public.is_household_staff()
    and actor_profile_id = public.current_profile_id()
  );
