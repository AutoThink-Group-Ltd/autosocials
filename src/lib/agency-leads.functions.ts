import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { leadIdSchema, leadInputSchema, offerDecisionSchema, offerInputSchema, offerTokenSchema } from "./agency-leads";

export const listAgencyLeads = createServerFn({ method: "POST" }).handler(async () =>
  (await import("./agency-leads.server")).listLeads());

export const addAgencyLead = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => leadInputSchema.parse(input))
  .handler(async ({ data }) => (await import("./agency-leads.server")).addLead(data));

export const getAgencyLeadOffers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => leadIdSchema.parse(input))
  .handler(async ({ data }) => (await import("./agency-leads.server")).listOffers(data.leadId));

export const getAgencyLeadSamples = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => leadIdSchema.parse(input))
  .handler(async ({ data }) => (await import("./agency-leads.server")).listSamples(data.leadId));

export const shareAgencyLeadOffer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => offerInputSchema.parse(input))
  .handler(async ({ data }) => (await import("./agency-leads.server")).shareOffer(data));

export const revokeAgencyLeadOffer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => leadIdSchema.extend({ offerId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => (await import("./agency-leads.server")).revokeOffer(data.leadId, data.offerId));

export const readAgencyLeadOffer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: offerTokenSchema }).strict().parse(input))
  .handler(async ({ data }) => (await import("./agency-leads.server")).readOffer(data.token));

export const trackAgencyLeadOffer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({
    token: offerTokenSchema, visitId: z.string().uuid(), sampleKey: z.string().max(64).optional(),
  }).strict().parse(input))
  .handler(async ({ data }) => (await import("./agency-leads.server")).trackOffer(data.token, data.visitId, data.sampleKey));

export const respondToAgencyLeadOffer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: offerTokenSchema, decision: offerDecisionSchema }).strict().parse(input))
  .handler(async ({ data }) => (await import("./agency-leads.server")).respondToOffer(data.token, data.decision));
