// Public, citable AutoSocials facts. Single source for /api/public/facts and llms.txt. Never add customer data.
import { CONTENT_CREDIT_PLANS } from "@/config/contentCreditPlans";
import { SITE_URL } from "./seo-routes";

export function publicFacts() {
  return {
    name: "AutoSocials",
    url: SITE_URL,
    summary:
      "AutoSocials is an AI social growth workspace for brands and agencies. Its agent, Sam, plans and creates organic videos from the brand's own assets, helps schedule them and assess organic performance.",
    agent: {
      name: "Sam",
      role: "AI social growth agent inside every workspace",
    },
    stages: ["Create", "Schedule", "Winners", "Campaigns", "Learn"],
    platforms: ["TikTok", "Instagram", "Facebook Pages", "LinkedIn"],
    capabilities: [
      "Learns a brand from its website and uploaded brand files",
      "Plans marketing narratives and asset briefs, then makes motion-graphic videos with voiceover",
      "Sends approved videos to Publish as drafts; nothing is posted without approval",
      "Free search of TikTok and Instagram creators at " +
        `${SITE_URL}/discover`,
      "Agency partner programme with multi-client management and recurring commissions",
    ],
    plans: CONTENT_CREDIT_PLANS.map((p) => ({
      name: p.name,
      currency: "GBP",
      monthly: p.monthlyPricePence / 100,
      monthlyCredits: p.credits,
    })),
    safety:
      "Sam asks for confirmation before sending, publishing, charging or deleting. A separately authorised and gated LinkedIn agent pilot can operate under a bounded owner grant where enabled.",
    limitations: [
      "The paid ads module has not been built.",
      "Available connections, capture, scheduling and delivery vary by platform, account, permissions and format.",
      "Deleting a post in AutoSocials does not remove it from TikTok.",
    ],
    links: {
      developers: `${SITE_URL}/developers`,
      openapi: `${SITE_URL}/openapi.json`,
      mcpReference: `${SITE_URL}/mcp-tools.json`,
      pricing: `${SITE_URL}/pricing`,
      discover: `${SITE_URL}/discover`,
      agencies: `${SITE_URL}/agency-platform`,
      llms: `${SITE_URL}/llms.txt`,
      sitemap: `${SITE_URL}/sitemap.xml`,
    },
  };
}
