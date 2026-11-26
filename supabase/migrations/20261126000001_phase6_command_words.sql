-- Phase 6, Step 6.2: each syllabus's command-word glossary.
-- Reference data like the rest of the curriculum tables: no household_id, readable by
-- anyone signed in, written by household staff (the importer uses the service role).

create table if not exists command_words (
  id uuid primary key default gen_random_uuid(),
  syllabus_version_id uuid not null references syllabus_versions(id) on delete cascade,
  word text not null check (length(trim(word)) > 0),
  meaning text not null check (length(trim(meaning)) > 0),
  created_at timestamptz not null default now(),
  unique (syllabus_version_id, word)
);

alter table command_words enable row level security;

drop policy if exists command_words_read on command_words;
create policy command_words_read on command_words
  for select to authenticated
  using (true);

drop policy if exists command_words_write on command_words;
create policy command_words_write on command_words
  for all to authenticated
  using (public.is_household_staff())
  with check (public.is_household_staff());
