-- Makes room for values the extraction pipeline genuinely does not know yet.
-- Writing a placeholder would be worse than leaving the column empty: an empty
-- max_marks says "not extracted", while 0 says "worth nothing".

alter table components alter column max_marks drop not null;
alter table entry_route_components alter column weighting_percent drop not null;

-- A route may be listed with its papers before the weightings are parsed.
alter table components add column if not exists notes text;

-- Extended-tier wording that the PDF prints beside the Core objective.
alter table learning_objectives add column if not exists supplement_text text;

-- Assessment-objective descriptors, used by the skill-rubric subjects.
alter table assessment_objectives add column if not exists rubric jsonb not null default '[]'::jsonb;

-- The exam series a version is examined in, e.g. {June,November}.
alter table syllabus_versions add column if not exists exam_series text[] not null default '{}';

-- Stable URL slug for the subject, kept out of subject_name so renaming is safe.
alter table subjects add column if not exists slug text;

create unique index if not exists subjects_slug_key on subjects (slug) where slug is not null;