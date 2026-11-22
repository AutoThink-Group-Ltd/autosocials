import { z } from "zod";
import { designSchema, quoteEvidenceSchema, defaultSocialDesign } from "./social-design";
export const campaignPostSchema = z.object({ id: z.string().uuid(), date: z.string().date(), platform: z.string().trim().min(1).transform(value => value.toLowerCase()), format: z.enum(["tiles","written","video","carousel"]), title: z.string().trim().min(1).max(160), caption: z.string().trim().min(1).max(3000), brief: z.string().trim().min(1).max(2000), design: designSchema.optional(), quote: quoteEvidenceSchema.optional(), quoteNotice: z.string().max(500).optional() });
export const campaignSchema = z.object({ dnaVersionId:z.string().uuid().nullable().optional(), id: z.string().uuid(), revision: z.string().uuid(), threadId: z.string().uuid(), title: z.string().trim().min(1).max(200), timezone: z.string(), contextUsed: z.array(z.string()), posts: z.array(campaignPostSchema).min(1).max(90) });
export type ContentCampaign = z.infer<typeof campaignSchema>;

export function campaignCalendarTitle(posts: ContentCampaign["posts"]) {
  const dates = posts.map(post => post.date).sort();
  const date = (value: string) => new Date(value + "T12:00:00Z");
  const range = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).formatRange(date(dates[0]!), date(dates[dates.length - 1]!));
  const platform = posts.every(post => post.platform.toLowerCase() === "linkedin") ? "LinkedIn" : "Content";
  return `${platform} calendar · ${range}`;
}

/** The exact reviewed tile is bound to its estimate and production request. */
export function campaignTile(post: ContentCampaign["posts"][number]) {
  const direction = post.brief.trim().slice(0, 220).trimEnd();
  return { headline: post.title.trim().slice(0, 80).trimEnd(), supporting: "", direction, design: post.design ?? defaultSocialDesign(direction), ...(post.quote ? { quote: post.quote } : {}), ...(post.quoteNotice ? { quoteNotice: post.quoteNotice } : {}) };
}
