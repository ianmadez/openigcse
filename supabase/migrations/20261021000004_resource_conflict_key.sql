-- A partial index cannot be an ON CONFLICT target, and the importer needs the
-- pair to be a conflict target so re-runs update rather than duplicate.
drop index if exists resources_objective_url_key;

create unique index if not exists resources_objective_url_key
  on resources (learning_objective_id, external_url);