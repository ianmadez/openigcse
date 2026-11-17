-- The importer upserts activities on (objective_id, title), so the pair needs a
-- unique index to be a valid conflict target.
create unique index if not exists activities_objective_title_key
  on activities (objective_id, title);