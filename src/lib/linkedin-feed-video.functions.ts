import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";
import { parseClientSocialProfile } from "./client-social-profiles";
import { extractLinkedInPosts } from "./personal-linkedin";

/** Resolve a fresh, short-lived public video URL only for a saved post in an accessible workspace. */
export const getLinkedInFeedVideo = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => z.object({ workspace_id: z.string().uuid(), post_url: z.string().url().max(1000) }).parse(value))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: data.workspace_id });
    if (access.error || !access.data) throw new Error("Forbidden");
    const [workspace, operation] = await Promise.all([
      admin.from("workspaces").select("social_profiles").eq("id", data.workspace_id).single(),
      admin.from("brand_work_operations").select("result").eq("workspace_id", data.workspace_id).eq("kind", "personal-discovery").eq("signature", "v1").maybeSingle(),
    ]);
    if (workspace.error || operation.error) throw new Error("Could not load the saved post");
    const content = (operation.data?.result as { content?: unknown } | null)?.content;
    if (typeof content !== "string" || !content.split("\n").some(line => /^- \S+ https:\/\/\S+$/.test(line) && line.endsWith(` ${data.post_url}`))) throw new Error("Post is not in this workspace");
    const profiles = Array.isArray(workspace.data?.social_profiles) ? workspace.data.social_profiles : [];
    const key = process.env["FIRECRAWL_API_KEY"];
    if (!key) throw new Error("Public profile collection is not configured");
    for (const item of profiles) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const profile = parseClientSocialProfile(String(row["url"] || row["handle"] || ""), row["platform"] as Parameters<typeof parseClientSocialProfile>[1]);
      if (profile?.platform !== "linkedin" || !profile.url) continue;
      const response = await fetch("https://api.firecrawl.dev/v2/scrape", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ alexandria: { provider: "harvestapi", capability: "linkedin/profile-posts", options: { profile: profile.url, scrapePostedLimit: "3months" } } }), signal: AbortSignal.timeout(50000), redirect: "error" });
      if (!response.ok) continue;
      const post = extractLinkedInPosts(profile.url, await response.json()).find(entry => entry.url === data.post_url);
      if (!post?.videoUrl) continue;
      try {
        const url = new URL(post.videoUrl);
        if (url.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname.endsWith(".licdn.com")) return { url: url.href };
      } catch { /* Invalid source URLs cannot be played. */ }
    }
    return { url: null };
  });
