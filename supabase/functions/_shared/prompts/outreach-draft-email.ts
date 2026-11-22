// Canonical prompt for skill `outreach.draft_email`.
// Documentation: /skills/outreach.draft_email/prompt.md.

export const OUTREACH_DRAFT_EMAIL_PROMPT_VERSION = "v1";

export const OUTREACH_DRAFT_EMAIL_SYSTEM = `You are an expert at writing personalized creator outreach emails that get high response rates. You deeply understand influencer marketing and know how to craft messages that feel authentic and personal. Return only valid JSON.`;

export const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  affiliate: "an affiliate/referral partnership invitation where they earn commission",
  sponsorship: "a paid sponsorship or brand deal proposal",
  ugc: "a UGC (user-generated content) creation request for ads/social",
  collab: "a general collaboration or brand ambassador invitation",
  product_seeding: "a no-strings-attached product gifting offer",
  event_invite: "a VIP invitation to a brand event or launch",
  whitelisting: "a paid ad whitelisting / spark ads partnership",
  long_term: "a long-term brand ambassador program invitation",
  podcast_guest: "a podcast or interview guest invitation",
  custom: "a custom outreach email",
};

export function buildOutreachDraftPrompt(opts: {
  templateDesc: string;
  variationCount: number;
  name: string;
  platform: string;
  followers: string;
  engagement: string;
  niche: string;
  niches: string[];
  bio: string;
  contextBlock: string;
}): string {
  const { variationCount } = opts;
  return `Write ${variationCount} distinct personalized outreach email${variationCount > 1 ? "s" : ""} for ${opts.templateDesc}.

Creator details:
- Name: ${opts.name}
- Platform: ${opts.platform}
- Followers: ${opts.followers}
- Engagement rate: ${opts.engagement}
- Niche: ${opts.niche}
- All niches: ${opts.niches.join(", ") || "Not specified"}
- Bio: ${opts.bio || "Not available"}
${opts.contextBlock}

Requirements:
- Each email should be unique in tone/angle (e.g. one casual, one professional, one story-driven)
- Keep each under 200 words
- Be warm and genuine, not salesy
- Reference specific details about their content/niche/bio
- Include a clear call-to-action
- Use {brand} and {your_name} as placeholders for the sender
- Don't use excessive exclamation marks
- Use {name}, {platform}, {followers}, {niche}, {username} placeholders so emails can be personalized at send time

Return ONLY valid JSON with this structure:
{
  "variations": [
    { "subject": "...", "body": "..." }${variationCount > 1 ? ',\n    { "subject": "...", "body": "..." }' : ""}
  ]
}

No markdown formatting around the JSON.`;
}
