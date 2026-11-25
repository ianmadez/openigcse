-- Phase 5: one open ask of each type per learner, enforced by the database instead of a
-- read-then-insert in the app (which cost a round trip on the exit gate's critical path and could
-- race on two taps). A stale pending ask is expired by expire_stale_requests() before a retry.
create unique index if not exists requests_one_open_per_type
  on requests (student_id, request_type)
  where status = 'pending';
