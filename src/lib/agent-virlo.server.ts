import { z } from "zod";
import {
  agentVirloSearchInput,
  agentVirloSearchOutput,
  type AgentVirloSearchRequest,
} from "./agent-virlo-contract";
type Dependencies = {
  access: (userId: string, workspaceId: string) => Promise<boolean>;
  available: () => boolean;
  execute: (
    data: Parameters<
      typeof import("./virlo-execute.server").executeVirloOperation
    >[0],
    userId: string,
  ) => Promise<{ id: string; data: unknown }>;
};
async function defaults(): Promise<Dependencies> {
  const [{ getAdminClient }, { virloAvailable }, { executeVirloOperation }] =
    await Promise.all([
      import("./supabase-admin.server"),
      import("./virlo.server"),
      import("./virlo-execute.server"),
    ]);
  return {
    access: async (userId, workspaceId) => {
      const { data, error } = await getAdminClient().rpc(
        "can_access_workspace",
        { _user_id: userId, _workspace_id: workspaceId },
      );
      return !error && data === true;
    },
    available: virloAvailable,
    execute: executeVirloOperation,
  };
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const metric = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
function publicSource(
  value: unknown,
): { url: string; platform: "instagram" | "tiktok" | "youtube" } | null {
  try {
    const u = new URL(String(value));
    const h = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    let platform: "instagram" | "tiktok" | "youtube";
    if (
      ["instagram.com", "www.instagram.com"].includes(h) &&
      /^\/(?:p|reel|reels)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)
    )
      platform = "instagram";
    else if (
      ["tiktok.com", "www.tiktok.com"].includes(h) &&
      /^\/@[A-Za-z0-9_.-]+\/(?:video|photo)\/\d+\/?$/.test(u.pathname)
    )
      platform = "tiktok";
    else if (
      ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(h) &&
      (/^\/shorts\/[A-Za-z0-9_-]{11}\/?$/.test(u.pathname) ||
        (u.pathname === "/watch" &&
          /^[A-Za-z0-9_-]{11}$/.test(u.searchParams.get("v") ?? "")))
    )
      platform = "youtube";
    else if (h === "youtu.be" && /^\/[A-Za-z0-9_-]{11}\/?$/.test(u.pathname))
      platform = "youtube";
    else return null;
    const youtubeId =
      platform === "youtube" && u.pathname === "/watch"
        ? u.searchParams.get("v")
        : null;
    u.search = "";
    u.hash = "";
    if (youtubeId) u.searchParams.set("v", youtubeId);
    return { url: u.toString(), platform };
  } catch {
    return null;
  }
}
function items(value: unknown): unknown[] {
  const data = object(value),
    nested = object(data["result"]);
  const candidates = [
    Array.isArray(value) ? value : null,
    data["videos"],
    data["results"],
    data["items"],
    data["posts"],
    data["trends"],
    nested["videos"],
    nested["posts"],
    object(data["slideshows"])["items"],
  ];
  return (candidates.find((v) => Array.isArray(v) && v.length > 0) ??
    candidates.find(Array.isArray) ??
    []) as unknown[];
}
/** Caller must supply verified user/workspace and a stable UUID request ID for retries. */
export async function searchShortFormTrends(
  request: AgentVirloSearchRequest,
  dependencies?: Dependencies,
) {
  const input = agentVirloSearchInput.parse(request.input);
  for (const value of [request.workspaceId, request.userId, request.requestId])
    if (!z.string().uuid().safeParse(value).success)
      throw new Error("Invalid research identity");
  const deps = dependencies ?? (await defaults());
  if (!(await deps.access(request.userId, request.workspaceId)))
    throw new Error("Workspace access denied");
  if (!deps.available()) throw new Error("Research is unavailable or disabled");
  const response = await deps.execute(
    {
      workspace_id: request.workspaceId,
      request_id: request.requestId,
      confirmed: input.allowMeteredSearch,
      operation: {
        operation: "videos",
        scope: "virlo_library",
        query: input.query,
        page: input.page,
        ...(input.platform ? { platform: input.platform } : {}),
      },
    },
    request.userId,
  );
  const results = items(response.data)
    .flatMap((raw) => {
      const post = object(raw),
        source = publicSource(
          post["url"] ?? post["video_url"] ?? post["share_url"],
        );
      if (!source || (input.platform && source.platform !== input.platform))
        return [];
      const caption =
        typeof post["caption"] === "string"
          ? post["caption"]
          : typeof post["description"] === "string"
            ? post["description"]
            : typeof post["title"] === "string"
              ? post["title"]
              : "";
      return [
        {
          ...source,
          caption: caption.slice(0, 800),
          views: metric(post["views"] ?? post["view_count"]),
          likes: metric(post["likes"] ?? post["like_count"]),
          comments: metric(post["comments"] ?? post["comment_count"]),
          publishedAt:
            typeof post["published_at"] === "string"
              ? post["published_at"].slice(0, 40)
              : null,
        },
      ];
    })
    .slice(0, 20);
  return agentVirloSearchOutput.parse({ resultId: response.id, results });
}
