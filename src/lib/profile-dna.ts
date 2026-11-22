import { z } from "zod";
import { parseClientSocialProfile } from "./client-social-profiles";

export function personalLinkedIn(value: unknown) {
  if (!Array.isArray(value)) return null;
  for (const row of value) {
    const profile = parseClientSocialProfile(typeof row?.url === "string" ? row.url : "");
    if (profile?.platform === "linkedin" && profile.url && /^\/in\/[^/]+\/?$/i.test(new URL(profile.url).pathname)) return profile.url;
  }
  return null;
}

export const profilePalettes = {
  evergreen: { name: "Evergreen", background: "#103A31", ink: "#F6F8ED", accent: "#BBE685" },
  sand: { name: "Warm sand", background: "#F5EEE2", ink: "#302317", accent: "#7A4326" },
  ember: { name: "Burnt orange", background: "#A93716", ink: "#FFF6E8", accent: "#FFE0A1" },
  cobalt: { name: "Cobalt", background: "#213387", ink: "#F7F9FF", accent: "#BBD7FF" },
} as const;

const fact = z.object({ value: z.string().trim().min(1).max(160), quote: z.string().trim().min(1).max(400) }).strict().nullable();
const suggestedGoal = z.string().trim().min(1).max(500).nullable();
export const profileGoalsSchema = z.object({ knownFor: suggestedGoal, audience: suggestedGoal, goal: suggestedGoal }).strict();
export type ProfileGoals = z.infer<typeof profileGoalsSchema>;
export const profileDirectionSchema = z.object({
  role: fact,
  employer: fact,
  observedTopics: z.array(z.object({ topic: z.string().trim().min(1).max(120), post: z.number().int().min(1).max(20) }).strict()).max(5),
  voice: z.string().trim().min(1).max(500),
  positioning: z.string().trim().min(1).max(500),
  interpretation: profileGoalsSchema.optional(),
  palette: z.enum(["evergreen", "sand", "ember", "cobalt"]),
  tiles: z.array(z.object({ headline: z.string().trim().min(1).max(75), supporting: z.string().trim().min(1).max(160) }).strict()).length(3),
}).strict();
export const profileDnaSchema = z.object({
  sourceUrl: z.string().url(),
  name: z.string().min(1).max(100),
  companyWebsite: z.string().nullable(),
  role: z.string().nullable(),
  employer: z.string().nullable(),
  profileRead: z.boolean().optional(),
  postCount: z.number().int().min(0).max(20),
  topics: z.array(z.object({ topic: z.string(), url: z.string().url() })),
  voice: z.string(),
  positioning: z.string(),
  interpretation: profileGoalsSchema.optional(),
  palette: profileDirectionSchema.shape.palette,
  tiles: profileDirectionSchema.shape.tiles,
}).strict();
export type ProfileDna = z.infer<typeof profileDnaSchema>;

export const profileDesignBrief = (brief: string) => /\b(?:profile dna|personal (?:linkedin|profile|brand))\b/i.test(brief);
export const companyChannelBrief = (brief: string) => /\bcompany brand dna\b|^(?:company|business) linkedin\b|\b(?:for|on|to|from|as)\s+(?:(?:our|the|this|their|your|my)\s+)?(?:company|business|brand)\s+(?:linkedin\b|(?:page|channel|account)\b)/i.test(brief.trim());

export function profileGoalInterpretation(dna: ProfileDna): ProfileGoals {
  return dna.interpretation ?? { knownFor: dna.positioning, audience: null, goal: null };
}

export function profileDnaGuidelines(value: ProfileDna) {
  const palette = profilePalettes[value.palette];
  const goals = profileGoalInterpretation(value);
  return [
    `For content for ${value.name}’s personal LinkedIn profile only. Keep company-channel Brand DNA separate. For a personal tile, include “Profile DNA” in the saved creative direction so production keeps the chosen identity. Source: ${value.sourceUrl}.`,
    `Public profile evidence: role ${value.role || "not verified"}; employer ${value.employer || "not verified"}. Reviewed ${value.postCount} authored posts.`,
    ...value.topics.map(({ topic, url }) => `Observed topic: ${topic} (${url})`),
    `Suggested positioning: ${value.positioning}`,
    `Our Interpretation (provisional editorial direction, never a confirmed intention or fact; explicit goals take priority): ${JSON.stringify(goals)}`,
    `Voice guidance: ${value.voice}`,
    `Proposed visual direction: ${palette.name}, background ${palette.background}, text ${palette.ink}, accent ${palette.accent}. Use bold display typography, high contrast, and uncluttered composition. Avoid company logos, invented branding, and unsupported first-person claims for personal posts.`,
  ].join("\n");
}
