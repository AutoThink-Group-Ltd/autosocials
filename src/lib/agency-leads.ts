import { z } from "zod";

export const leadIdSchema = z.object({ leadId: z.string().uuid() }).strict();
export const offerTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const offerDecisionSchema = z.enum(["accepted", "declined"]);
export const offerAssetSchema = z.object({
  type: z.enum(["tile", "video", "carousel", "written"]),
  id: z.string().uuid(),
}).strict();

export const leadInputSchema = z.object({
  leadId: z.string().uuid(),
  contact: z.string().trim().min(1, "Enter the contact’s name.").max(100),
  company: z.string().trim().max(100),
  website: z.string().trim().max(255),
  linkedin: z.string().trim().max(500),
}).strict().refine((input) => !!(input.website || input.linkedin), {
  message: "Enter a company website or a LinkedIn profile.",
  path: ["website"],
});

export const offerInputSchema = z.object({
  leadId: z.string().uuid(),
  offerId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4000),
  nextSteps: z.string().trim().max(1000),
  priceMinor: z.number().int().min(1).max(100_000_000),
  currency: z.enum(["GBP", "USD", "EUR"]),
  cadence: z.enum(["monthly", "one_off"]),
  assets: z.array(offerAssetSchema).min(1).max(20),
}).strict().refine((input) => new Set(input.assets.map(offerAssetKey)).size === input.assets.length, {
  message: "Select each sample only once.",
  path: ["assets"],
});

export type OfferAsset = z.infer<typeof offerAssetSchema>;
export const offerAssetKey = (asset: OfferAsset) => `${asset.type}:${asset.id}`;
export const offerAssetLabel = { tile: "Social tile", video: "Video", carousel: "LinkedIn carousel", written: "Written post" } as const;

export function offerPrice(minor: number, currency: string, cadence: string) {
  const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100);
  return cadence === "monthly" ? `${amount} per month` : `${amount} one-off`;
}

export function offerPriceMinor(value: string) {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return minor > 0 && minor <= 100_000_000 ? minor : null;
}
