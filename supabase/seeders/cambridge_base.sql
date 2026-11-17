-- Reference catalogue only. Households, guardians and learners are created by
-- the onboarding wizard, never seeded here.

insert into awarding_bodies (code, name, website)
values ('CAIE', 'Cambridge Assessment International Education', 'https://www.cambridgeinternational.org')
on conflict (code) do nothing;

insert into qualifications (awarding_body_id, code, name)
select id, 'CAIE-IGCSE', 'Cambridge IGCSE'
from awarding_bodies
where code = 'CAIE'
on conflict (code) do nothing;