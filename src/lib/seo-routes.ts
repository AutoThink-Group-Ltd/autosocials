/**
 * SEO Route Registry — Single source of truth for all public pages.
 * Used by src/lib/seo-head.ts to emit per-route head tags during server rendering.
 */

export const SITE_URL = "https://autosocials.com";
export const SITE_NAME = "AutoSocials";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.jpg`;

export interface SeoRoute {
  path: string;
  title: string;
  description: string;
  ogImage?: string;
  priority: number;
  changefreq:
    "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  bodyHeading: string;
  bodyContent: string[];
  jsonLd: Record<string, unknown>;
  noIndex?: boolean;
}

export const seoRoutes: SeoRoute[] = [
  {
    path: "/",
    title: "AutoSocials — Plan, create and publish social content",
    description:
      "Plan brand-aware social content, create posts and tiles with Sam, schedule to connected channels, and see which organic posts perform best.",
    priority: 1.0,
    changefreq: "daily",
    bodyHeading: "Plan, create and publish social content",
    bodyContent: [
      "AutoSocials is the AI-powered creator discovery and outreach platform that helps brands find the right social media creators, contact them at scale, and manage every collaboration in one place.",
      "Search millions of TikTok and Instagram creators by niche, location, follower count, engagement rate, and more. Our AI analyses content themes and audience quality so you connect with creators who actually move the needle.",
      "From discovery to outreach to deal tracking, AutoSocials replaces spreadsheets, manual DMs, and guesswork with a single streamlined workflow built for modern marketing teams.",
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      description:
        "AI-powered creator discovery and outreach platform for TikTok and Instagram.",
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/discover?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  },
  {
    path: "/discover",
    title: "Discover TikTok & Instagram Creators Free | AutoSocials",
    description:
      "Browse thousands of TikTok and Instagram creators by niche, location, and engagement. Filter, save, and start outreach — no sign-up required.",
    priority: 0.9,
    changefreq: "daily",
    bodyHeading: "Discover Social Media Creators",
    bodyContent: [
      "Search and filter thousands of TikTok and Instagram creators by niche, follower count, engagement rate, location, and content themes.",
      "Save creators to custom lists, explore trending niches, and start building your outreach pipeline — all without creating an account.",
      "AutoSocials continuously indexes new creators so you always have access to the freshest profiles and engagement data across platforms.",
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Discover Creators",
      url: `${SITE_URL}/discover`,
      description:
        "Browse and filter TikTok and Instagram creators by niche, engagement, and location.",
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    },
  },
  {
    path: "/pricing",
    title: "Monthly Credit Plans | AutoSocials",
    description:
      "Compare AutoSocials monthly credit plans, including a free plan, and estimate how much content you can create.",
    priority: 0.8,
    changefreq: "weekly",
    bodyHeading: "Simple, Transparent Pricing",
    bodyContent: [
      "Choose a monthly credit allowance for content production, from Free to Pro.",
      "Each engine has a credit price. Estimated output varies by engine and settings, and unused credits reset each month.",
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Pricing",
      url: `${SITE_URL}/pricing`,
      description:
        "AutoSocials pricing plans for creator discovery and outreach.",
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    },
  },
  {
    path: "/agency-platform",
    title: "Agency Partner Program — Earn Commissions | AutoSocials",
    description:
      "Manage influencer campaigns for multiple clients, earn recurring commissions, and scale your agency with AutoSocials' white-label platform.",
    priority: 0.7,
    changefreq: "weekly",
    bodyHeading: "Grow Your Agency with AutoSocials",
    bodyContent: [
      "The AutoSocials Agency Partner Program lets marketing agencies manage influencer campaigns for multiple clients from a single dashboard.",
      "Earn recurring commissions on every client subscription, generate branded performance reports, and operate within client workspaces while maintaining your agency identity.",
      "Leverage AI-powered creator discovery to find the perfect creators for every client campaign. White-label access means your clients see your brand, not ours.",
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Agency Partner Program",
      url: `${SITE_URL}/agency-platform`,
      description:
        "White-label influencer marketing platform for agencies with recurring commissions.",
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    },
  },
  {
    path: "/auth",
    title: "Sign In or Create Account | AutoSocials",
    description:
      "Sign in to AutoSocials or create an account. Sam plans, publishes and learns from your organic content, then turns winners into paid growth.",
    priority: 0.3,
    changefreq: "monthly",
    bodyHeading: "Sign In to AutoSocials",
    bodyContent: [
      "Access your creator lists, outreach campaigns, and collaboration pipeline by signing in to your AutoSocials account.",
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Sign In",
      url: `${SITE_URL}/auth`,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    },
    noIndex: true,
  },
  {
    path: "/agency-signup",
    title: "Register as an Agency Partner | AutoSocials",
    description:
      "Create your agency account on AutoSocials. Manage multiple clients, earn commissions, and access white-label influencer marketing tools.",
    priority: 0.5,
    changefreq: "monthly",
    bodyHeading: "Register as an Agency Partner",
    bodyContent: [
      "Join the AutoSocials Agency Partner Program. Set up your agency profile, invite clients, and start earning recurring commissions on every subscription.",
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Agency Sign Up",
      url: `${SITE_URL}/agency-signup`,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    },
  },
];
import { developerPages } from "@/features/developers/content";

// Documentation pages are public and have individually addressable canonical URLs.
seoRoutes.push(
  ...[
    {
      slug: "",
      title: "Developer documentation",
      description: "Guides and references for AutoSocials agent access.",
      sections: [],
    },
    ...developerPages,
  ].map((page) => {
    const path = `/developers${page.slug ? `/${page.slug}` : ""}`;
    return {
      path,
      title: `${page.title} | AutoSocials Developers`,
      description: page.description,
      priority: 0.6,
      changefreq: "monthly" as const,
      bodyHeading: page.title,
      bodyContent: page.sections.flatMap((section) => section.paragraphs),
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: page.title,
        url: `${SITE_URL}${path}`,
        description: page.description,
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      },
    };
  }),
);
