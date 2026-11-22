import { z } from "zod";
import { parseClientSocialProfile } from "./client-social-profiles";

export function personalPostAttribution(caption: string): "repost" | "unknown" {
  return /^\s*RT\s+@[A-Za-z0-9_]+\s*:/i.test(caption) ? "repost" : "unknown";
}

/** X's authenticated user timeline is scoped to the connected account. */
export function connectedPostAttribution(platform: string, caption: string): "authored" | "repost" | "unknown" {
  const attribution = personalPostAttribution(caption);
  return attribution === "repost" ? attribution : platform === "x" ? "authored" : "unknown";
}

export function personalProfileEvidence(section: string, id: string) {
  const url = section.match(/(?:^|\n)Profile: (https:\/\/\S+)/)?.[1];
  const profile = url ? parseClientSocialProfile(url) : null;
  const text = section.match(/^Profile context: (.+)$/m)?.[1]?.trim().slice(0, 3000);
  return profile?.platform === "linkedin" && profile.url && text ? { id, platform: "linkedin", url: profile.url, date: null, caption: text, attribution: "self_description" as const, basis: ["profile" as const] } : null;
}

// A personal review is separate from the business brand profile. Citations point
// only to evidence collected in this workspace, never to model-invented URLs.
export const PersonalBrandEvidenceSchema = z.object({
  id: z.string().min(1), platform: z.string().min(1), url: z.string().url().refine((url) => url.startsWith("https://")),
  date: z.string().nullable(), caption: z.string().max(3000), attribution: z.enum(["authored", "repost", "unknown", "self_description"]), visualObservation: z.string().max(1200).optional(), transcript: z.string().max(3000).optional(),
  basis: z.array(z.enum(["caption", "image", "frames", "transcript", "profile"])).min(1),
});
const FindingSchema = z.object({ text: z.string().min(1).max(800), evidenceIds: z.array(z.string()).min(1).max(8) });
export const PersonalBrandReportSchema = z.object({
  version: z.literal(1), generatedAt: z.string(),
  impression: z.array(FindingSchema).max(5), themes: z.array(FindingSchema).max(5),
  strengths: z.array(FindingSchema).max(5), mixedSignals: z.array(FindingSchema).max(5),
  opportunities: z.array(FindingSchema).max(5),
  channels: z.array(z.object({ platform: z.string(), findings: z.array(FindingSchema).max(5) })),
  evidence: z.array(PersonalBrandEvidenceSchema),
});
export type PersonalBrandReport = z.infer<typeof PersonalBrandReportSchema>;

/** Bound long citation lists without making unknown citations valid. */
export function limitPersonalFindingCitations(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const root = value as Record<string, unknown>;
  const limit = (items: unknown) => Array.isArray(items) ? items.map((item) => item && typeof item === "object" && !Array.isArray(item) && Array.isArray((item as Record<string, unknown>).evidenceIds) ? { ...item, evidenceIds: (item as { evidenceIds: unknown[] }).evidenceIds.slice(0, 8) } : item) : items;
  return { ...root, ...Object.fromEntries(["impression", "themes", "strengths", "mixedSignals", "opportunities"].map((key) => [key, limit(root[key])])), channels: Array.isArray(root.channels) ? root.channels.map((channel) => channel && typeof channel === "object" && !Array.isArray(channel) ? { ...channel, findings: limit((channel as Record<string, unknown>).findings) } : channel) : root.channels };
}

/** Reject unsupported citations rather than presenting generated claims as fact. */
export function validatePersonalBrandReport(value: unknown): PersonalBrandReport {
  const report = PersonalBrandReportSchema.parse(value);
  const ids = new Set(report.evidence.map((item) => item.id));
  const findings = [...report.impression, ...report.themes, ...report.strengths, ...report.mixedSignals, ...report.opportunities, ...report.channels.flatMap((channel) => channel.findings)];
  if (findings.some((finding) => finding.evidenceIds.some((id) => !ids.has(id)))) throw new Error("Personal brand report contains an unknown evidence reference");
  return report;
}
