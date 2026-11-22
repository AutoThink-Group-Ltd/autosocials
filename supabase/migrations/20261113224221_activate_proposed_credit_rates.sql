-- The owner approved activating the proposed rates while provider costs are
-- still being checked. Do not represent this approval as verified cost evidence.
update public.content_credit_rates
set active = true, activation_approved = true,
    evidence_note = coalesce(evidence_note, '') || '; owner approved activation while provider cost verification continues'
where capability_id in ('autotoast-hyperframes', 'golpo-canvas', 'golpo-sketch', 'heygen-avatar', 'openai-image', 'ideogram-image', 'recraft-image')
  and active = false and activation_approved = false and provider_cost_verified = false;
