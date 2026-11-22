import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AssetChannelStatus = {
  postId: string;
  postStatus: string;
  accountId: string;
  platform: string;
  account: string;
  status: string;
  date: string | null;
  platformPostId?: string | null;
  permalink?: string | null;
};

/** Publishing history for creations with an identifiable source in AutoSocials. */
export function useAssetPublishingStatus(workspaceId: string, tileIds: string[], videoIds: string[] = [], writtenIds: string[] = [], carouselIds: string[] = []) {
  return useQuery({
    queryKey: ["asset-publishing-status", workspaceId, tileIds, videoIds, writtenIds, carouselIds],
    enabled: !!workspaceId && (tileIds.length > 0 || videoIds.length > 0 || writtenIds.length > 0 || carouselIds.length > 0),
    refetchInterval: 30_000,
    queryFn: async () => {
      const select = "id,created_via,variant_id,status,scheduled_at,published_at,post_targets(social_account_id,platform,status,published_at,platform_post_id,permalink,social_accounts(display_name,handle))";
      const sources = [...tileIds.map(id => `social_tile:${id}`), ...writtenIds.map(id => `written_post:${id}`), ...carouselIds.map(id => `linkedin_carousel:${id}`)];
      // Keep URLs bounded and page each query so large workspaces retain every receipt.
      const load = async (column: "created_via" | "variant_id" | "id", ids: string[]) => {
        const rows: NonNullable<Awaited<ReturnType<typeof query>>["data"]> = [];
        for (let start = 0; start < ids.length; start += 100) {
          for (let offset = 0; ; offset += 1000) {
            const response = await query(column, ids.slice(start, start + 100), offset);
            if (response.error) throw response.error;
            rows.push(...(response.data ?? []));
            if ((response.data?.length ?? 0) < 1000) break;
          }
        }
        return rows;
      };
      function query(column: "created_via" | "variant_id" | "id", ids: string[], offset: number) {
        return supabase.from("posts").select(select).eq("workspace_id", workspaceId).in(column, ids).order("id").range(offset, offset + 999);
      }
      const [tiles, videos, written] = await Promise.all([load("created_via", sources), load("variant_id", videoIds), load("id", writtenIds)]);
      const data = [...new Map([...tiles, ...videos, ...written].map(post => [post.id, post])).values()];
      const result: Record<string, AssetChannelStatus[]> = {};
      for (const post of data ?? []) {
        const id = post.created_via?.startsWith("social_tile:") ? post.created_via.slice("social_tile:".length) : post.created_via?.startsWith("written_post:") ? post.created_via.slice("written_post:".length) : post.created_via?.startsWith("linkedin_carousel:") ? post.created_via.slice("linkedin_carousel:".length) : post.variant_id ?? (writtenIds.includes(post.id) ? post.id : null);
        if (!id) continue;
        let hasActiveTarget = false;
        for (const target of post.post_targets ?? []) {
          if (target.status === "skipped" || (target.status === "pending" && post.status === "draft")) continue;
          if (!["failed", "skipped"].includes(target.status)) hasActiveTarget = true;
          const account = target.social_accounts;
          (result[id] ??= []).push({
            postId: post.id,
            postStatus: post.status,
            accountId: target.social_account_id,
            platform: target.platform,
            account: account?.display_name || account?.handle || "Account",
            status: target.status === "pending" && post.status === "awaiting_approval" ? "awaiting_approval" : target.status,
            date: target.status === "published" ? target.published_at : post.scheduled_at,
            platformPostId: target.platform_post_id,
            permalink: target.permalink,
          });
        }
        if (writtenIds.includes(post.id) && !hasActiveTarget && ["published", "partially_published", "scheduled", "publishing"].includes(post.status)) {
          (result[id] ??= []).push({ postId: post.id, postStatus: post.status, accountId: "", platform: "post", account: "Channel history unavailable", status: post.status === "partially_published" ? "published" : post.status === "scheduled" ? "pending" : post.status, date: post.published_at ?? post.scheduled_at });
        }
      }
      return result;
    },
  });
}

function httpsUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

export function publishedPostLink(status: AssetChannelStatus): string | null {
  if (status.status !== "published") return null;

  const safeLink = httpsUrl(status.permalink);
  const facebookId = status.platform === "facebook" ? /^(\d+)_(\d+)$/.exec(status.platformPostId ?? "") : null;
  if (facebookId) {
    const [, pageId, postId] = facebookId;
    // Older Facebook feed receipts store the Graph object ID as a URL path.
    const legacy = safeLink && ["facebook.com", "www.facebook.com"].includes(safeLink.hostname) &&
      safeLink.pathname.replace(/\/$/, "") === `/${status.platformPostId}`;
    if (!safeLink || legacy) return `https://www.facebook.com/permalink.php?story_fbid=${postId}&id=${pageId}`;
  }
  return safeLink?.href ?? null;
}

export function channelStatusLabel(status: AssetChannelStatus): string {
  const label = status.status === "published" ? "Published" : status.status === "awaiting_approval" ? "Awaiting approval" : status.status === "failed" ? "Failed" : status.status === "publishing" ? "Publishing" : status.status === "retrying" ? "Retrying" : "Scheduled";
  const date = status.date ? ` · ${new Date(status.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "";
  return `${status.platform.charAt(0).toUpperCase()}${status.platform.slice(1)} · ${status.account}: ${label}${date}`;
}
