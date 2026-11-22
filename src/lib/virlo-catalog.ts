import { z } from "zod";

// These are the only operations the application may send to Virlo. Paths and
// methods are derived here, never supplied by a browser or model.
const platform = z.enum(["tiktok", "instagram", "youtube"]);
const text = z.string().trim().min(2).max(200);
const handle = z
  .string()
  .trim()
  .regex(/^@?[A-Za-z0-9_.-]{1,100}$/);
const hashtag = z
  .string()
  .trim()
  .refine((value) => /^#?[\p{L}\p{N}_]{1,100}$/u.test(value), "Invalid hashtag");
const id = z.string().uuid();
const page = z.number().int().min(1).max(40).default(1);
const cursor = z.string().min(1).max(2048).optional();
const cadence = z.enum([
  "six_hours",
  "twelve_hours",
  "daily",
  "every_other_day",
  "weekly",
  "bi_weekly",
  "monthly",
]);
const videoUrl = z
  .string()
  .url()
  .max(2048)
  .superRefine((value, ctx) => {
    try {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        !/(^|\.)(tiktok\.com|instagram\.com|youtube\.com|youtu\.be)$/.test(
          url.hostname.toLowerCase(),
        )
      )
        throw new Error();
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use a public TikTok, Instagram or YouTube URL",
      });
    }
  });
const action = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

export const VirloOperationSchema = z.discriminatedUnion("operation", [
  action({
    operation: z.literal("videos"),
    scope: z.enum(["virlo_library", "agent"]).optional(),
    agent_id: z.string().uuid().optional(),
    query: text,
    platform: platform.optional(),
    looks_like: z.string().trim().min(1).max(300).optional(),
    posted_after: z.string().date().optional(),
    posted_before: z.string().date().optional(),
    creator_followers_min: z.number().int().nonnegative().optional(),
    creator_followers_max: z.number().int().nonnegative().optional(),
    views_min: z.number().int().nonnegative().optional(),
    views_max: z.number().int().nonnegative().optional(),
    likes_min: z.number().int().nonnegative().optional(),
    engagement_rate_min: z.number().nonnegative().optional(),
    engagement_rate_max: z.number().nonnegative().optional(),
    virality_min: z.number().nonnegative().optional(),
    outliers_only: z.boolean().optional(),
    regions: z.array(z.string().length(2)).max(10).optional(),
    languages: z.array(z.string().length(2)).max(10).optional(),
    creator_type: z.enum(["individual", "brand"]).optional(),
    sort: z.enum(["most_viral", "most_views", "newest", "rising"]).optional(),
    content_types: z.array(z.enum(["video", "slideshow"])).min(1).max(2).optional(),
    page,
  }),
  action({
    operation: z.literal("creators"),
    query: text,
    platform: platform.optional(),
    creator_followers_min: z.number().int().nonnegative().optional(),
    creator_followers_max: z.number().int().nonnegative().optional(),
    creator_type: z.enum(["individual", "brand"]).optional(),
    bio_keywords: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(["top_performing", "rising", "most_followers"]).optional(),
    page,
  }),
  action({
    operation: z.literal("hooks"),
    query: text,
    platform: platform.optional(),
    page,
  }),
  action({
    operation: z.literal("sounds"),
    view: z.enum(["trending", "breakout"]).optional(),
    platform: platform.optional(),
    page,
  }),
  action({
    operation: z.literal("topic_trends"),
    region: z.enum(["global", "gb", "us", "au", "sg"]).default("global"),
  }),
  action({
    operation: z.literal("content_trends"),
    platform: platform.optional(),
    page,
  }),
  action({
    operation: z.literal("hashtags"),
    platform: platform.optional(),
    page,
    start_date: z.string().date(),
    end_date: z.string().date(),
  }),
  action({
    operation: z.literal("ads"),
    query: text,
    country: z
      .string()
      .regex(/^[A-Z]{2}$|^ALL$/)
      .default("GB"),
    cursor,
  }),
  action({ operation: z.literal("recent_videos"), platform: platform.optional() }),
  action({ operation: z.literal("sound_search"), query: z.string().trim().min(3).max(200), platform: platform.optional(), page }),
  action({ operation: z.literal("sound_library"), sound_id: id, view: z.enum(["details", "videos", "usage-history"]), platform: platform.optional(), page }),
  action({ operation: z.literal("sounds_by_creator"), handle, platform, page }),
  action({ operation: z.literal("hook_browse"), view: z.enum(["types", "trending", "library", "library/categories"]), query: text.optional(), platform: platform.optional(), page }),
  action({ operation: z.literal("place_videos"), place_id: id, sort: z.enum(["newest", "most_views"]).optional(), page }),
  action({ operation: z.literal("meta_ad"), ad_id: z.string().regex(/^\d{1,40}$/) }),
  action({ operation: z.literal("meta_advertiser_search"), query: text, country: z.string().regex(/^[A-Z]{2}$|^ALL$/).optional() }),
  action({ operation: z.literal("meta_advertiser_ads"), page_id: z.string().regex(/^\d{1,40}$/), country: z.string().regex(/^[A-Z]{2}$|^ALL$/).optional(), cursor }),
  action({ operation: z.literal("places"), query: text, page }),
  action({ operation: z.literal("raw_search"), query: text, platform, cursor }),
  action({ operation: z.literal("raw_hashtag"), hashtag, platform, cursor }),
  action({ operation: z.literal("raw_creator"), handle, platform }),
  action({
    operation: z.literal("raw_creator_videos"),
    handle,
    platform,
    cursor,
  }),
  action({ operation: z.literal("raw_video"), url: videoUrl, platform }),
  action({
    operation: z.literal("raw_comments"),
    url: videoUrl,
    platform,
    cursor,
  }),
  action({
    operation: z.literal("raw_transcript"),
    url: videoUrl,
    platform: z.enum(["tiktok", "youtube"]),
  }),
  action({
    operation: z.literal("creator_lookup"),
    handle,
    platform,
    audience: z.boolean().default(false),
    trends: z.boolean().default(false),
    intelligence: z.boolean().default(false),
  }),
  action({ operation: z.literal("video_lookup"), url: videoUrl, platform }),
  action({
    operation: z.literal("hashtag_lookup"),
    hashtag,
    platform,
    trends: z.boolean().default(false),
  }),
  action({
    operation: z.literal("sound_lookup"),
    sound_id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    platform: z.enum(["tiktok", "instagram"]),
    trends: z.boolean().default(false),
  }),
  action({ operation: z.literal("place_lookup"), query: text }),
  action({
    operation: z.literal("lookup_status"),
    lookup: z.enum(["creator", "video", "hashtag", "sound", "place"]),
    id,
  }),
  action({
    operation: z.literal("research_start"),
    recurring: z.boolean().optional(),
    cadence: z.enum(["daily", "weekly", "monthly"]).optional(),
    intent: text,
    keywords: z.array(text).min(1).max(50),
    platforms: z.array(platform).min(1).max(3),
    intelligence: z.boolean().default(false),
    ads: z.boolean().default(false),
  }),
  action({ operation: z.literal("research_update"), id, active: z.boolean().optional(), name: text.optional(), intent: text.optional(), keywords: z.array(text).min(1).max(50).optional(), platforms: z.array(platform).min(1).max(3).optional(), cadence: z.enum(["daily", "weekly", "monthly"]).optional(), intelligence: z.boolean().optional(), autopilot: z.boolean().optional() }),
  action({ operation: z.literal("research_delete"), id }),
  action({ operation: z.literal("untrack"), kind: z.enum(["creators", "videos"]), id }),
  action({ operation: z.literal("research_status"), id }),
  action({
    operation: z.literal("research_data"),
    id,
    view: z.enum([
      "summary",
      "videos",
      "slideshows",
      "ads",
      "outliers",
      "hashtags",
      "benchmarks",
      "trends",
      "analysis",
      "sounds",
      "hooks",
      "affinity",
      "similar",
      "activity",
      "events",
    ]),
  }),
  action({ operation: z.literal("track_creator"), handle, platform, cadence, collection_depth: z.enum(["standard", "deep", "full"]).optional() }),
  action({
    operation: z.literal("track_video"),
    url: videoUrl,
    platform,
    cadence,
  }),
  action({
    operation: z.literal("tracking_data"),
    kind: z.enum(["creators", "videos"]),
    id,
    view: z.enum(["details", "report", "snapshots", "signals", "posts", "posting-cadence", "audience-demographics", "audience-geography"]),
  }),
  action({
    operation: z.literal("tracking_update"),
    kind: z.enum(["creators", "videos"]),
    id,
    status: z.enum(["active", "paused"]),
  }),
]);

export type VirloOperation = z.infer<typeof VirloOperationSchema>;
export type VirloRequest = {
  path: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  estimatedCostUsd: number;
  confirmation: "none" | "paid" | "recurring" | "destructive";
  recurring: boolean;
  resourceId?: string;
};

/** All prices are reference estimates; the response receipt is authoritative. */
export function buildVirloOperation(value: unknown): VirloRequest {
  const input = VirloOperationSchema.parse(value);
  const get = (
    path: string,
    estimatedCostUsd: number,
    query?: Record<string, string>,
  ): VirloRequest => ({
    method: "GET",
    path,
    estimatedCostUsd,
    confirmation: "none",
    recurring: false,
    ...(query ? { query } : {}),
  });
  const post = (
    path: string,
    estimatedCostUsd: number,
    body: Record<string, unknown>,
    recurring = false,
  ): VirloRequest => ({
    method: "POST",
    path,
    body,
    estimatedCostUsd,
    confirmation: recurring ? "recurring" : "none",
    recurring,
  });
  const platformQuery = (v?: string) => (v ? { platform: v } : {});
  switch (input.operation) {
    case "videos":
    case "creators": {
      if (input.operation === "videos" && ((input.scope === "agent") !== !!input.agent_id)) throw new Error("Choose a research agent belonging to this business.");
      const request = post(`/search/${input.operation}`, input.operation === "videos" && input.scope === "agent" ? 0 : 0.05, {
        scope: input.operation === "videos" ? input.scope ?? "virlo_library" : "virlo_library",
        topics: [input.query],
        ...(input.platform ? { platforms: [input.platform] } : {}),
        ...(input.operation === "videos" ? Object.fromEntries(Object.entries(input).filter(([key, value]) => !["operation", "query", "platform", "page", "scope", "agent_id"].includes(key) && value !== undefined)) : {}),
        ...(input.operation === "creators" ? { ...(input.creator_followers_min !== undefined ? { creator_followers_min: input.creator_followers_min } : {}), ...(input.creator_followers_max !== undefined ? { creator_followers_max: input.creator_followers_max } : {}), ...(input.creator_type ? { creator_type: input.creator_type } : {}), ...(input.bio_keywords ? { bio_keywords: input.bio_keywords } : {}), ...(input.sort ? { sort: input.sort } : {}) } : {}),
        ...(input.operation === "videos" && input.agent_id ? { agent_id: input.agent_id } : {}),
        page: input.page,
      });
      return input.operation === "videos" && input.scope === "agent" ? { ...request, resourceId: input.agent_id! } : request;
    }
    case "hooks":
      return get("/hooks/search", 0.25, {
        q: input.query,
        page: String(input.page),
        ...platformQuery(input.platform),
      });
    case "sounds":
      return get(`/sounds/${input.view ?? "trending"}`, 0.25, {
        page: String(input.page),
        ...platformQuery(input.platform),
      });
    case "topic_trends":
      return get("/topic-trends/today", 0.25, { region: input.region });
    case "content_trends":
      return get("/content-trends", 0.25, {
        page: String(input.page),
        ...platformQuery(input.platform),
      });
    case "hashtags": {
      const start = Date.parse(`${input.start_date}T00:00:00Z`),
        end = Date.parse(`${input.end_date}T00:00:00Z`);
      if (end < start || end - start > 90 * 86400_000)
        throw new Error("Choose a date range up to 90 days");
      return get(
        input.platform ? `/${input.platform}/hashtags` : "/hashtags",
        0.05,
        {
          page: String(input.page),
          start_date: input.start_date,
          end_date: input.end_date,
        },
      );
    }
    case "ads":
      return get("/raw/meta/ads/search", 0.01, {
        q: input.query,
        country: input.country,
        ...(input.cursor ? { cursor: input.cursor } : {}),
      });
    case "recent_videos":
      return get(input.platform ? `/${input.platform}/videos/digest` : "/videos/digest", 0.25);
    case "sound_search":
      return get("/sounds/search", 0.10, { q: input.query, page: String(input.page), ...platformQuery(input.platform) });
    case "sound_library":
      return get(`/sounds/${input.sound_id}${input.view === "details" ? "" : `/${input.view}`}`, input.view === "videos" ? 0.25 : 0.05, { ...(input.view === "videos" ? { page: String(input.page), ...platformQuery(input.platform) } : {}) });
    case "sounds_by_creator":
      return get(`/sounds/by-creator/${input.platform}/${encodeURIComponent(input.handle.replace(/^@/, ""))}`, 0.25, { page: String(input.page) });
    case "hook_browse":
      return get(`/hooks/${input.view}`, input.view === "types" || input.view === "library/categories" ? 0 : input.view === "trending" ? 0.25 : 0.10, { ...(input.query && input.view === "library" ? { q: input.query } : {}), ...(["types", "trending"].includes(input.view) ? platformQuery(input.platform) : {}), ...(["trending", "library"].includes(input.view) ? { page: String(input.page) } : {}) });
    case "place_videos":
      return get(`/places/${input.place_id}/videos`, 0.05, { page: String(input.page), ...(input.sort ? { sort: input.sort } : {}) });
    case "meta_ad":
      return get(`/raw/meta/ads/${input.ad_id}`, 0.01);
    case "meta_advertiser_search":
      return get("/raw/meta/advertisers/search", 0.01, { q: input.query, ...(input.country ? { country: input.country } : {}) });
    case "meta_advertiser_ads":
      return get(`/raw/meta/advertisers/${input.page_id}/ads`, 0.01, { ...(input.country ? { country: input.country } : {}), ...(input.cursor ? { cursor: input.cursor } : {}) });
    case "places":
      return get("/places", 0.05, { q: input.query, page: String(input.page) });
    case "raw_search":
      return get(`/raw/${input.platform}/search`, 0.01, {
        q: input.query,
        ...(input.cursor ? { cursor: input.cursor } : {}),
      });
    case "raw_hashtag":
      return get(
        `/raw/${input.platform}/hashtag/${encodeURIComponent(input.hashtag.replace(/^#/, ""))}`,
        0.01,
        input.cursor ? { cursor: input.cursor } : undefined,
      );
    case "raw_creator":
      return get(
        `/raw/${input.platform}/creator/${encodeURIComponent(input.handle.replace(/^@/, ""))}`,
        0.01,
      );
    case "raw_creator_videos":
      return get(
        `/raw/${input.platform}/creator/${encodeURIComponent(input.handle.replace(/^@/, ""))}/videos`,
        0.01,
        input.cursor ? { cursor: input.cursor } : undefined,
      );
    case "raw_video":
      return get(`/raw/${input.platform}/video`, 0.01, { url: input.url });
    case "raw_comments":
      return get(`/raw/${input.platform}/video/comments`, 0.01, {
        url: input.url,
        ...(input.cursor ? { cursor: input.cursor } : {}),
      });
    case "raw_transcript":
      return get(`/raw/${input.platform}/video/transcript`, 0.01, {
        url: input.url,
      });
    case "creator_lookup":
      return post(
        "/satellite/creator",
        0.5 +
          (input.audience ? 0.5 : 0) +
          (input.trends ? 0.5 : 0) +
          (input.intelligence ? 0.25 : 0),
        {
          platform: input.platform,
          handle: input.handle,
          include: "videos,outliers",
          audience_demographics: input.audience,
          audience_geography: input.audience,
          trend_analysis: input.trends,
          data_intelligence: input.intelligence,
        },
      );
    case "video_lookup":
      return post("/satellite/video", 0.5, {
        url: input.url,
        platform: input.platform,
      });
    case "hashtag_lookup":
      return post("/satellite/hashtag", input.trends ? 1 : 0.5, {
        platform: input.platform,
        hashtag: input.hashtag,
        trend_analysis: input.trends,
      });
    case "sound_lookup":
      return post("/satellite/sound", input.trends ? 1 : 0.5, {
        platform: input.platform,
        sound_id: input.sound_id,
        trend_analysis: input.trends,
      });
    case "place_lookup":
      return post("/satellite/place", 0.5, { query: input.query });
    case "lookup_status":
      return {
        ...get(
          `/satellite/${({ video: "video-outlier", creator: "creator", hashtag: "hashtags", sound: "sounds", place: "place" } as const)[input.lookup]}/status/${input.id}`,
          0,
        ),
        resourceId: input.id,
      };
    case "research_start":
      if (input.recurring && !input.cadence) throw new Error("Choose a recurring schedule.");
      return post("/agents", input.intelligence ? 1.5 : 0.5, {
        is_recurring: input.recurring ?? false,
        ...(input.recurring ? { cadence: input.cadence } : {}),
        intent: input.intent,
        keywords: input.keywords,
        platforms: input.platforms,
        data_intelligence_enabled: input.intelligence,
        meta_ads_enabled: input.ads,
      }, input.recurring ?? false);
    case "research_update": {
      const { operation, id: agentId, intelligence, ...fields } = input;
      const changes = { ...fields, ...(intelligence !== undefined ? { data_intelligence_enabled: intelligence } : {}) };
      if (!Object.values(changes).some((value) => value !== undefined)) throw new Error("Choose what to change.");
      return { method: "PUT", path: `/agents/${agentId}`, body: changes, estimatedCostUsd: 0, confirmation: "recurring", recurring: true, resourceId: agentId };
    }
    case "research_delete":
      return { method: "DELETE", path: `/agents/${input.id}`, estimatedCostUsd: 0, confirmation: "destructive", recurring: false, resourceId: input.id };
    case "untrack":
      return { method: "DELETE", path: `/tracking/${input.kind}/${input.id}`, estimatedCostUsd: 0, confirmation: "destructive", recurring: false, resourceId: input.id };
    case "research_status":
      return { ...get(`/agents/${input.id}`, 0), resourceId: input.id };
    case "research_data":
      return {
        ...get(
          `/agents/${input.id}/${({ outliers: "creators/outliers", trends: "trends/latest", analysis: "analysis/latest" } as Record<string, string>)[input.view] ?? input.view}`,
          input.view === "hooks" ? 0.25 : 0,
        ),
        resourceId: input.id,
      };
    case "track_creator":
      return post(
        "/tracking/creators",
        0.25 + (input.collection_depth === "full" ? 2 : input.collection_depth === "deep" ? 1 : input.collection_depth === "standard" ? 0.5 : 0),
        {
          platform: input.platform,
          handle: input.handle,
          scrape_cadence: input.cadence,
          ...(input.collection_depth ? { collection_depth: input.collection_depth } : {}),
        },
        true,
      );
    case "track_video":
      return post(
        "/tracking/videos",
        0.25,
        {
          platform: input.platform,
          url: input.url,
          scrape_cadence: input.cadence,
        },
        true,
      );
    case "tracking_data":
      if (input.kind === "videos" && !["details", "report", "snapshots"].includes(input.view)) throw new Error("That view is available only for tracked creators.");
      return {
        ...(input.view === "audience-demographics" || input.view === "audience-geography"
          ? { method: "GET" as const, path: `/tracking/${input.kind}/${input.id}/${input.view}`, estimatedCostUsd: 0.5, confirmation: "paid" as const, recurring: false }
          : get(`/tracking/${input.kind}/${input.id}${input.view === "details" ? "" : `/${input.view}`}`, 0)),
        resourceId: input.id,
      };
    case "tracking_update":
      return {
        method: "PATCH",
        path: `/tracking/${input.kind}/${input.id}`,
        body: { status: input.status },
        estimatedCostUsd: 0,
        confirmation: input.status === "active" ? "recurring" : "none",
        recurring: input.status === "active",
        resourceId: input.id,
      };
  }
}
