-- Apply the same proportional duration convention to the approved engine rates.
-- These are customer credit prices; the provider cost has not been verified.
insert into public.content_credit_rates(capability_id, duration_s, credits, active, activation_approved, evidence_note)
select engine.capability, duration.seconds,
  ceil(engine.minute_credits::numeric * duration.seconds / 60)::integer,
  true, true, 'Proportional launch rate based on the owner-approved 60-second rate; provider cost remains unverified'
from (values ('autotoast-hyperframes',50),('golpo-canvas',150),('golpo-sketch',150),('heygen-avatar',200)) as engine(capability,minute_credits)
cross join (values (15),(30)) as duration(seconds)
where not exists (select 1 from public.content_credit_rates r where r.capability_id = engine.capability and r.duration_s = duration.seconds and r.active);

-- Higgsfield's available models support individual clips shorter than 15s.
insert into public.content_credit_rates(capability_id, duration_s, credits, active, activation_approved, evidence_note)
select 'higgsfield-video', seconds, ceil(400::numeric * seconds / 60)::integer, true, true,
  'Proportional launch rate based on owner-approved Higgsfield rates despite known cost evidence'
from pg_catalog.generate_series(1,30) as seconds
where seconds not in (15,30) and not exists (select 1 from public.content_credit_rates r where r.capability_id = 'higgsfield-video' and r.duration_s = seconds and r.active);
