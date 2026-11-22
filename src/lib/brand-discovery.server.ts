import { waitUntil } from "@vercel/functions";
import { isIP } from "node:net";
import { getAdminClient } from "./supabase-admin.server";
import { buildBrandProfileForWorkspace, runBrandOperation, scanBrandWebsite } from "./brand-assets.functions";
import { parseClientSocialProfile } from "./client-social-profiles";
import { normalizeApifyPosts, personalVideoInput, normalizeXProfilePosts, pollApifyRun, startApifyRun, startXProfileRun } from "./research-provider.server";
import { targetFromSocialUrl } from "./research";
import { personalMediaFingerprint, findCachedPersonalMedia, safePersonalCaption } from "./personal-brand-media-cache";
import { evidenceIsFresh } from "./brand-evidence";
import { extractSubstackNotes, recentPersonalNotes } from "./substack-notes";
import { personalLinkedIn } from "./profile-dna";

type Admin = ReturnType<typeof getAdminClient>;
const running = new Set<string>();
const safeCaption = safePersonalCaption;

export function publicBrandWebsite(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || !host.includes(".") ||
        isIP(host.replace(/^\[|\]$/g, "")) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

export function selectedProfiles(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const profile = parseClientSocialProfile(String(item["url"] || item["handle"] || ""), item["platform"] as Parameters<typeof parseClientSocialProfile>[1]);
    return profile ? [profile] : [];
  }).slice(0, limit);
}

export async function socialExcerpt(url: string, personal = false, previousContent = "", workspaceId?: string, leadLinkedIn = false): Promise<string> {
  const limit = personal ? 20 : 12;
  const cutoff = Date.now() - 90 * 24 * 60 * 60_000;
  const withinPeriod = (date: string | null) => !personal || (!!date && Number.isFinite(Date.parse(date)) && Date.parse(date) >= cutoff && Date.parse(date) <= Date.now());
  const recentFirst = <T extends { published_at: string | null }>(posts: T[]) => personal ? posts.sort((a, b) => Date.parse(b.published_at!) - Date.parse(a.published_at!)).slice(0, limit) : posts;
  const safePost = (raw: string, domains: string[]) => {
    if (/\s/.test(raw)) return false;
    try { const post = new URL(raw); return post.protocol === "https:" && !post.username && !post.password && !post.port && domains.some((domain) => post.hostname === domain || post.hostname.endsWith(`.${domain}`)); } catch { return false; }
  };
  const profile = parseClientSocialProfile(url);
  if (leadLinkedIn && profile?.platform === "linkedin" && profile.url && /^\/company\//i.test(new URL(profile.url).pathname)) {
    const key = process.env["FIRECRAWL_API_KEY"];
    if (!key) throw new Error("Public company page collection is not configured");
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ url: profile.url, formats: ["markdown"], onlyMainContent: true }), signal: AbortSignal.timeout(20000), redirect: "error" });
    if (!response.ok) throw new Error("Public company page could not be retrieved");
    const payload = await response.json();
    const page = parseClientSocialProfile(String(payload.data?.metadata?.sourceURL ?? ""));
    if (!page?.url || page.platform !== "linkedin" || !/^\/company\//i.test(new URL(page.url).pathname) || page.handle.toLowerCase() !== profile.handle.toLowerCase() || typeof payload.data?.markdown !== "string") throw new Error("Could not verify the LinkedIn company page");
    return `Profile: ${profile.url}\nPublic LinkedIn company page:\n${payload.data.markdown.slice(0, 6500)}`;
  }
  if (personal && profile?.platform === "linkedin" && profile.url) {
    const key = process.env["FIRECRAWL_API_KEY"];
    if (!key) throw new Error("Public profile collection is not configured");
    const { extractLinkedInPosts, extractLinkedInProfileContext } = await import("./personal-linkedin");
    let context: string | null = null;
    try {
      const response = await fetch("https://api.firecrawl.dev/v2/scrape", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ url: profile.url, formats: ["markdown"], onlyMainContent: false }), signal: AbortSignal.timeout(20000), redirect: "error" });
      if (response.ok) context = extractLinkedInProfileContext(profile.url, await response.json(), leadLinkedIn);
    } catch { /* Post collection can still succeed without profile text. */ }
    let posts: ReturnType<typeof extractLinkedInPosts> = [];
    let postsAvailable = false;
    try {
      const result = await fetch("https://api.firecrawl.dev/v2/scrape", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ alexandria: { provider: "harvestapi", capability: "linkedin/profile-posts", options: { profile: profile.url, scrapePostedLimit: "3months" } } }), signal: AbortSignal.timeout(50000), redirect: "error" });
      if (result.ok) {
        const payload = await result.json();
        postsAvailable = !!payload?.success && !payload?.data?.alexandria?.[0]?.error && !!payload?.data?.alexandria?.[0];
        if (postsAvailable) posts = extractLinkedInPosts(profile.url, payload);
      }
    } catch { /* Keep the profile context when the post provider is unavailable. */ }
    const visuals = new Map<string, { line: string; fingerprint: string }>();
    const mediaPosts = leadLinkedIn ? [] : [...posts.filter(post => post.videoUrl).slice(0, 3), ...posts.filter(post => !post.videoUrl && post.imageUrl).slice(0, 3)];
    if (mediaPosts.length) {
      const { inspectPersonalMedia } = await import("./personal-brand-media.server");
      await Promise.all(mediaPosts.map(async (post) => {
        const media = post.videoUrl ?? post.imageUrl;
        if (!media) return;
        const fingerprint = personalMediaFingerprint(profile.url!, post.url, post.date, post.caption, media, null);
        const cached = findCachedPersonalMedia(previousContent, profile.url!, post.url, fingerprint);
        if (cached?.visual) { visuals.set(post.url, { line: cached.visual, fingerprint }); return; }
        try {
          let observation = await inspectPersonalMedia(post.videoUrl ? { id: post.url, videoUrl: post.videoUrl } : { id: post.url, imageUrl: post.imageUrl });
          let cover = false;
          if (!observation && post.videoUrl && post.coverUrl) { observation = await inspectPersonalMedia({ id: post.url, imageUrl: post.coverUrl }); cover = !!observation; }
          if (observation) visuals.set(post.url, { line: `  Visual observation (${observation.basis === "frames" ? "sampled frames" : "image"}): ${cover ? "Video cover image: " : ""}${safeCaption(observation.description).slice(0, 1150)}`, fingerprint });
        } catch { /* Unavailable media is not treated as reviewed. */ }
      }));
    }
    const covers = new Map<string, string>();
    if (workspaceId) {
      const { cacheLinkedInCover } = await import('./personal-linkedin-covers.server');
      await Promise.all(posts.map(async post => {
        try { const path = await cacheLinkedInCover(workspaceId, post.imageUrl ?? post.coverUrl); if (path) covers.set(post.url, path); } catch { /* Posts remain usable when a cover cannot be cached. */ }
      }));
    }
    return `Profile: ${profile.url}\nEvidence: LinkedIn profile text is self-described; posts are matched to the profile author. Video frames are partial samples.\n${context ? `Profile context: ${context}\n` : ""}${posts.length ? posts.map(post => { const visual = visuals.get(post.url); const cover = covers.get(post.url); return `- ${post.date} ${post.url}\n${cover ? `  Cover storage: ${cover}\n` : ""}${post.videoUrl ? "  Media type: video\n" : ""}  Attribution: authored\n  ${post.caption}${visual ? `\n${visual.line}\n  Media cache v1: ${visual.fingerprint}` : ""}`; }).join("\n") : postsAvailable ? "No public posts returned." : "Public posts could not be retrieved."}`;
  }
  if (profile?.platform === "substack") {
    const key = process.env["FIRECRAWL_API_KEY"];
    if (!key) throw new Error("Public profile collection is not configured");
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: false }), signal: AbortSignal.timeout(20000), redirect: "error" });
    if (!response.ok) throw new Error("Substack profile could not be retrieved");
    const payload = await response.json() as { data?: { markdown?: string }; markdown?: string };
    const extracted = extractSubstackNotes(payload.data?.markdown ?? payload.markdown ?? "", profile.handle, personal ? 20 : 12);
    const notes = personal ? recentPersonalNotes(extracted) : extracted;
    return `Profile: ${url}\nEvidence: public notes visible on the saved profile; linked material may be a quotation.\n${notes.map(note => `- ${note.date ?? "Date unavailable"} ${note.url}\n  ${safeCaption(note.caption)}`).join("\n") || "No public posts returned."}`;
  }
  if (personal && profile?.platform === "youtube") {
    const { collectPersonalYouTube } = await import("./personal-youtube.server");
    return collectPersonalYouTube(url);
  }
  if (profile?.platform === "youtube") {
    const { youtubeRequest } = await import("./youtube.server");
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const lookup: Record<string, string> | null = parts[0] === "channel" ? { id: profile.handle } : parts[0] === "user" ? { forUsername: profile.handle } : parts[0]?.startsWith("@") ? { forHandle: profile.handle } : null;
    if (!lookup) return `Profile: ${url}\nPublic posts were not inspected for this platform.`;
    const channels = await youtubeRequest("channels", { part: "contentDetails", ...lookup }) as { items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] };
    const uploads = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) throw new Error("YouTube channel unavailable");
    const result = await youtubeRequest("playlistItems", { part: "snippet,contentDetails", playlistId: uploads, maxResults: "12" }) as { items?: { contentDetails?: { videoId?: string; videoPublishedAt?: string }; snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> } }[] };
    const posts = (result.items ?? []).flatMap((item) => {
      const id = item.contentDetails?.videoId;
      if (!id || !/^[\w-]{11}$/.test(id)) return [];
      const thumbnail = item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url;
      const caption = `${item.snippet?.title ?? ""}\n${item.snippet?.description ?? ""}`.trim().slice(0, 700);
      return [`- ${item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt ?? "Date unavailable"} https://www.youtube.com/watch?v=${id}\n${thumbnail ? `  Cover: ${thumbnail}\n` : ""}  ${caption}`];
    });
    return `Profile: ${url}\nEvidence: public video titles and descriptions; video footage was not reviewed.\n${posts.join("\n") || "No public posts returned."}`;
  }
  if (profile?.platform === "x") {
    const runId = await startXProfileRun(profile.handle, limit);
    const deadline = Date.now() + 50_000;
    while (Date.now() < deadline) {
      const result = await pollApifyRun(runId);
      if (result.status === "failed") throw new Error("X provider run failed");
      if (result.status === "complete") {
        const posts = recentFirst(normalizeXProfilePosts(profile.handle, result.posts || [], limit).filter((post) => withinPeriod(post.published_at) && (!personal || safePost(post.url, ["x.com", "twitter.com"]))));
        return `Profile: ${url}\nEvidence: public captions and post metadata; video footage was not reviewed.\n${posts.map((post) => `- ${post.published_at || "Date unavailable"} ${post.url}\n${!personal && !personal && post.thumbnail_url ? `  Cover: ${post.thumbnail_url}\n` : ""}  ${safeCaption(post.caption)}`).join("\n") || "No public posts returned."}`;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error("X provider run timed out");
  }
  const target = targetFromSocialUrl(url);
  if (!target) return `Profile: ${url}\nPublic posts were not inspected for this platform.`;
  const runId = await startApifyRun(target, personal ? 20 : 12);
  const deadline = Date.now() + 50_000;
  while (Date.now() < deadline) {
    const result = await pollApifyRun(runId);
    if (result.status === "failed") break;
    if (result.status === "complete") {
      const posts = recentFirst(normalizeApifyPosts(target.platform, target, result.posts || [], personal ? 20 : 12).filter((post) => withinPeriod(post.published_at) && (!personal || safePost(post.url, [`${target.platform}.com`])))).slice(0, limit);
      if (!posts.length && (result.posts || []).some((row) => row["error"] || row["errorMessage"])) throw new Error(`${target.platform} provider reported the profile unavailable`);
      const visuals = new Map<string, string>();
      const transcripts = new Map<string, string>();
      const fingerprints = new Map<string, string>();
      if (personal) {
        const { inspectPersonalMedia, transcribePersonalVideo } = await import("./personal-brand-media.server");
        const mediaCandidates = [...posts.filter((item) => item.media_type === "video").slice(0, 3), ...posts.filter((item) => item.media_type === "image" && item.thumbnail_url).slice(0, 3)];
        await Promise.all(mediaCandidates.map(async (post) => {
          const input = post.media_type === "video" ? personalVideoInput(target.platform, post, result.posts || []) : { id: post.id, imageUrl: post.thumbnail_url };
          if (!input) return;
          const mediaUrl = "videoUrl" in input ? input.videoUrl : input.imageUrl;
          if (!mediaUrl) return;
          const fingerprint = personalMediaFingerprint(target.url, post.url, post.published_at, safeCaption(post.caption), mediaUrl, "durationSeconds" in input ? input.durationSeconds : null);
          fingerprints.set(post.id, fingerprint);
          const cached = findCachedPersonalMedia(previousContent, target.url, post.url, fingerprint);
          if (cached?.visual) { const m = cached.visual.match(/^  Visual observation \((sampled frames|image)\): (.+)$/); if (m) visuals.set(post.id, JSON.stringify({ basis: m[1] === "image" ? "image" : "frames", description: m[2] })); }
          if (cached?.transcript) transcripts.set(post.id, cached.transcript.slice("  Transcript (audio sample): ".length));
          if (cached?.visual && (post.media_type !== "video" || cached.transcript)) return;
          try { const observation = await inspectPersonalMedia(input); if (observation && !cached?.visual) visuals.set(post.id, JSON.stringify({ basis: observation.basis, description: observation.description.replace(/\s+/g, " ").slice(0, 1200) })); } catch { /* Inaccessible media remains unreviewed. */ }
          if (!cached?.transcript && "videoUrl" in input && input.videoUrl && input.durationSeconds) {
            try { const transcript = await transcribePersonalVideo(input.videoUrl, input.durationSeconds); if (transcript) transcripts.set(post.id, transcript); } catch { /* Audio remains unreviewed. */ }
          }
        }));
      }
      return `Profile: ${target.url}\nEvidence: ${personal ? "public captions and post metadata; visual observations use sampled frames or still images; audio is reviewed only when a transcript is shown." : "public captions and post metadata; video footage was not reviewed."}\n${posts.map((post) => `- ${post.published_at || "Date unavailable"} ${post.url}\n${post.thumbnail_url ? `  Cover: ${post.thumbnail_url}\n` : ""}  ${safeCaption(post.caption)}${visuals.has(post.id) ? `\n  Visual observation (${JSON.parse(visuals.get(post.id)!).basis === "frames" ? "sampled frames" : "image"}): ${JSON.parse(visuals.get(post.id)!).description}` : ""}${transcripts.has(post.id) ? `\n  Transcript (audio sample): ${transcripts.get(post.id)}` : ""}${fingerprints.has(post.id) && (visuals.has(post.id) || transcripts.has(post.id)) ? `\n  Media cache v1: ${fingerprints.get(post.id)}` : ""}`).join("\n") || "No public posts returned."}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return `Profile: ${target.url}\nPublic posts could not be retrieved.`;
}

export async function runAutomaticBrandDiscovery(workspaceId: string, userId: string, refreshSocial = false): Promise<void> {
  const admin: Admin = getAdminClient();
  const kind = await admin.from("agency_clients").select("workspace_kind").eq("workspace_id", workspaceId).eq("status", "active").limit(1).maybeSingle();
  if (kind.error) throw new Error("Could not determine workspace type");
  if (kind.data?.workspace_kind === "personal") {
    const { runPersonalDiscovery } = await import("./personal-discovery.server");
    await runPersonalDiscovery(workspaceId, userId, refreshSocial);
    return;
  }
  if (running.has(workspaceId)) return;
  running.add(workspaceId);
  try {
    await runBrandOperation(admin, workspaceId, "discovery", null, async () => {
    const [{ data: workspace }, { data: files }, { data: socialDoc }, { data: profile }] = await Promise.all([
      admin.from("workspaces").select("website,social_profiles").eq("id", workspaceId).maybeSingle(),
      admin.from("brand_files").select("id,source,extracted_text,storage_path,created_at").eq("workspace_id", workspaceId).in("source", ["scan", "auto-scan"]).order("created_at", { ascending: false }).limit(30),
      admin.from("dossier_documents").select("id,content,updated_at").eq("workspace_id", workspaceId).eq("source", "auto-social").maybeSingle(),
      admin.from("brand_profiles").select("workspace_id").eq("workspace_id", workspaceId).maybeSingle(),
    ]);
    if (!workspace) return { ok: true };
    let changed = false;
    const website = publicBrandWebsite(workspace.website);
    if (website && !(files || []).some((file) => file.extracted_text?.includes(`Source: ${website}\n`) && evidenceIsFresh(file.created_at))) {
      try {
        const scan = await scanBrandWebsite(admin, workspaceId, userId, website, "auto-scan");
        if (scan.busy) return { ok: true };
        changed = true;
        // Read at most three relevant same-origin pages; individual failures
        // cannot discard the successful homepage evidence.
        const related = "related_urls" in scan && Array.isArray(scan.related_urls) ? scan.related_urls : [];
        for (const page of related.slice(0, 3)) {
          if (typeof page !== "string" || !publicBrandWebsite(page)) continue;
          try { await scanBrandWebsite(admin, workspaceId, userId, page, "auto-scan"); }
          catch { console.warn("A supporting brand page could not be inspected", workspaceId); }
        }
        // Keep manual scans; retire only evidence from an earlier automatic website.
        for (const old of (files || []).filter((file) => file.source === "auto-scan")) {
          await admin.from("brand_files").delete().eq("id", old.id).eq("workspace_id", workspaceId);
          await admin.storage.from("brand-assets-private").remove([old.storage_path]);
        }
      } catch (error) { console.warn("Automatic website scan failed", workspaceId, error instanceof Error ? error.message : "Unknown error"); }
    } else if (!website) {
      for (const old of (files || []).filter((file) => file.source === "auto-scan")) {
        const deleted = await admin.from("brand_files").delete().eq("id", old.id).eq("workspace_id", workspaceId);
        if (!deleted.error) {
          await admin.storage.from("brand-assets-private").remove([old.storage_path]);
          changed = true;
        }
      }
    }
    if (website) {
      try {
        const { importWebsiteImages } = await import("./website-images.server");
        const imageResult = await importWebsiteImages(admin, workspaceId, userId);
        if (imageResult.imported > 0) changed = true;
      } catch (error) { console.warn("Automatic website image import failed", workspaceId, error instanceof Error ? error.message : "Unknown error"); }
    }
    const { data: kindRow, error: kindError } = await admin.from("agency_clients").select("workspace_kind").eq("workspace_id", workspaceId).eq("status", "active").limit(1).maybeSingle();
    if (kindError) throw new Error("Could not determine workspace type");
    const personal = kindRow?.workspace_kind === "personal";
    const profiles = selectedProfiles(workspace.social_profiles, personal ? 20 : 12);
    const urls = profiles.map((item) => item.url || (["instagram", "facebook", "tiktok"].includes(item.platform)
      ? `https://www.${item.platform}.com/${item.platform === "tiktok" ? "@" : ""}${item.handle}`
      : `${item.platform}:@${item.handle}`));
    const personalProfile = personalLinkedIn(workspace.social_profiles);
    const signature = `Selected profiles: ${urls.filter((url) => url !== personalProfile).join(" | ")}`;
    if (personalProfile) {
      try {
        const { buildLeadProfileDna, readLeadProfileDna } = await import("./profile-dna.server");
        const existing = await readLeadProfileDna(admin, workspaceId, personalProfile);
        if (refreshSocial || (!existing.dna && existing.status !== "running")) {
          const excerpt = await socialExcerpt(personalProfile, true, "", undefined, true)
            .catch(() => `Profile: ${personalProfile}\nPublic posts could not be retrieved.`);
          await buildLeadProfileDna(admin, workspaceId, personalProfile, excerpt, refreshSocial);
        }
      } catch (error) { console.warn("Profile DNA could not be generated", workspaceId, error instanceof Error ? error.message : "Unknown error"); }
    }
    const brandUrls = urls.filter((url) => url !== personalProfile);
    if (brandUrls.length && (refreshSocial || !socialDoc?.content.startsWith(signature) || !evidenceIsFresh(socialDoc.updated_at))) {
      const previousSections = (socialDoc?.content ?? "").split(/\n\n(?=Profile: )/);
      const excerpts = await Promise.all(brandUrls.map(async (url) => {
        const companyLinkedIn = parseClientSocialProfile(url)?.platform === "linkedin" && /\/company\//i.test(url);
        const fresh = await socialExcerpt(url, personal, "", undefined, companyLinkedIn).catch((error) => {
          const platform = parseClientSocialProfile(url)?.platform ?? "unknown";
          console.warn("Public social collection failed", platform, error instanceof Error ? error.message : "Unknown error");
          return `Profile: ${url}\nPublic posts could not be retrieved.`;
        });
        if (personal || !refreshSocial || !/(?:could not be retrieved|No public posts returned)/.test(fresh)) return fresh;
        const selected = parseClientSocialProfile(url);
        const previous = previousSections.find((section) => {
          const match = section.match(/(?:^|\n)Profile: (.+)/);
          const old = match && parseClientSocialProfile(match[1]!);
          return old && selected && old.platform === selected.platform && old.handle.toLowerCase() === selected.handle.toLowerCase() && /\n- \S+ https:\/\//.test(section);
        });
        return previous ? previous.slice(previous.indexOf("Profile: ")) : fresh;
      }));
      const content = `${signature}\nChecked: ${new Date().toISOString()}\n${excerpts.join("\n\n")}`.slice(0, 120000);
      const saved = socialDoc
        ? await admin.from("dossier_documents").update({ content, updated_at: new Date().toISOString() }).eq("id", socialDoc.id).eq("workspace_id", workspaceId)
        : await admin.from("dossier_documents").insert({ workspace_id: workspaceId, source: "auto-social", title: "Saved social profiles", content, created_by: userId });
      if (saved.error) throw new Error("Could not save public social research.");
      changed = true;
    } else if (!brandUrls.length && socialDoc) {
      const deleted = await admin.from("dossier_documents").delete().eq("id", socialDoc.id).eq("workspace_id", workspaceId);
      if (deleted.error) throw new Error("Could not remove old social research.");
      changed = true;
    }
    if (personal && (changed || refreshSocial)) {
      try { const { runPersonalBrandReport } = await import("./personal-brand.functions"); await runPersonalBrandReport(workspaceId); }
      catch (error) { console.warn("Personal review generation failed", error instanceof Error ? error.message : "Unknown error"); }
    }
    if ((website || brandUrls.length || !personalProfile) && (changed || !profile)) {
      await buildBrandProfileForWorkspace(admin, workspaceId).catch((error) => console.warn("Automatic brand profile failed", workspaceId, error instanceof Error ? error.message : "Unknown error"));
    }
    return { ok: true };
    }, false);
  } finally { running.delete(workspaceId); }
}

export function queueAutomaticBrandDiscovery(workspaceId: string, userId: string, refreshSocial = false) {
  waitUntil(runAutomaticBrandDiscovery(workspaceId, userId, refreshSocial).catch((error) => {
    console.warn("Automatic brand discovery failed", workspaceId, error instanceof Error ? error.message : "Unknown error");
  }));
}
