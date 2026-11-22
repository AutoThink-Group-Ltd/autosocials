// Registered tool descriptors for discovery + enrichment capabilities.
// Implementations live in their respective edge functions; these descriptors
// declare policy (permissions, confirmation) and exist for registry lookup.

import { registerTool } from "../registry.ts";
import type { RegisteredTool } from "../types.ts";

const passthrough = (raw: unknown) => raw;
const serverOnly = async () => ({
  ok: false as const,
  error: { code: "server_only", message: "Invoke the matching edge function." },
});

export const discoverCreatorsTool: RegisteredTool = {
  name: "discovery.search_creators",
  description: "Live search for creators on TikTok/Instagram by keyword or username (Firecrawl-backed).",
  permissions: ["read", "external"],
  requiresConfirmation: "none",
  parseInput: passthrough,
  handler: serverOnly,
};

export const enrichCreatorTool: RegisteredTool = {
  name: "discovery.enrich_creator",
  description: "Hydrate a creator profile (followers, bio, avatar, recent videos) via the 4-layer enrichment pipeline.",
  permissions: ["read", "write", "external"],
  requiresConfirmation: "none",
  parseInput: passthrough,
  handler: serverOnly,
};

export const bulkEnrichEmailsTool: RegisteredTool = {
  name: "discovery.bulk_enrich_emails",
  description: "Best-effort contact-email discovery for a batch of creator_ids. Sliced server-side to respect compute limits.",
  permissions: ["read", "write", "external"],
  requiresConfirmation: "none",
  parseInput: passthrough,
  handler: serverOnly,
};

export const phylloSearchTool: RegisteredTool = {
  name: "discovery.phyllo_search",
  description: "Phyllo-backed creator discovery (staging endpoint).",
  permissions: ["read", "external"],
  requiresConfirmation: "none",
  parseInput: passthrough,
  handler: serverOnly,
};

export const tiktokCommercialTool: RegisteredTool = {
  name: "discovery.tiktok_commercial",
  description: "TikTok Commercial Content API lookup for brand-intelligence signals.",
  permissions: ["read", "external"],
  requiresConfirmation: "none",
  parseInput: passthrough,
  handler: serverOnly,
};

for (const tool of [
  discoverCreatorsTool,
  enrichCreatorTool,
  bulkEnrichEmailsTool,
  phylloSearchTool,
  tiktokCommercialTool,
]) {
  registerTool(tool);
}