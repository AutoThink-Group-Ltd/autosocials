import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";
import { parseClientSocialProfile } from "./client-social-profiles";
import { isWorkspaceLinkedInCover } from "./personal-linkedin-covers";
import type { SupabaseClient } from "@supabase/supabase-js";

const inputSchema = z.object({ workspace_id: z.string().uuid() });
const watchedKinds = ["discovery", "website", "profile", "personal-discovery", "personal-brand-report"] as const;
const staleAfterMs = 20 * 60_000;
type StepStatus = "not_requested" | "queued" | "running" | "complete" | "needs_attention";

function latestByKind(rows: { kind: string; status: string; updated_at: string }[]) {
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latest.has(row.kind)) latest.set(row.kind, row);
  return latest;
}

export const getAgencyClientDiscoveryProgress = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: data.workspace_id });
    if (access.error || !access.data) throw new Error("Forbidden");

    const client = admin as unknown as SupabaseClient;
    const [kindResult, workspaceResult, operationsResult, socialResult, profileResult] = await Promise.all([
      client.from("agency_clients").select("workspace_kind").eq("workspace_id", data.workspace_id).eq("status", "active").limit(1).maybeSingle(),
      client.from("workspaces").select("name,website,social_profiles,created_at").eq("id", data.workspace_id).maybeSingle(),
      client.from("brand_work_operations").select("kind,status,updated_at,result").eq("workspace_id", data.workspace_id).in("kind", [...watchedKinds]).order("updated_at", { ascending: false }).limit(30),
      client.from("dossier_documents").select("content").eq("workspace_id", data.workspace_id).eq("source", "auto-social").maybeSingle(),
      client.from("brand_profiles").select("profile,suggestions,updated_at").eq("workspace_id", data.workspace_id).maybeSingle(),
    ]);
    if (workspaceResult.error || !workspaceResult.data) throw new Error("Could not load the client workspace.");
    if (operationsResult.error || socialResult.error || profileResult.error) throw new Error("Could not check Sam’s brand review progress.");

    if (kindResult.error) throw new Error("Could not determine workspace type.");
    const personal = kindResult.data?.workspace_kind === "personal";
    const workspace = workspaceResult.data as { name: string; website: string | null; social_profiles: unknown; created_at: string };
    const profiles = Array.isArray(workspace.social_profiles) ? workspace.social_profiles.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const profile = parseClientSocialProfile(String(item["url"] || item["handle"] || ""), item["platform"] as Parameters<typeof parseClientSocialProfile>[1]);
      return profile ? [profile] : [];
    }) : [];
    const profileUrls = profiles.slice(0, personal ? 20 : 12).map((item) => item.url || (["instagram", "facebook", "tiktok"].includes(item.platform)

      ? `https://www.${item.platform}.com/${item.platform === "tiktok" ? "@" : ""}${item.handle}`
      : `${item.platform}:@${item.handle}`));
    const socialSignature = `Selected profiles: ${profileUrls.join(" | ")}`;
    const personalOperation = (operationsResult.data ?? []).find((row: any) => row.kind === "personal-discovery");
    const personalContent = personalOperation?.result && typeof personalOperation.result === "object" ? (personalOperation.result as { content?: unknown }).content : null;
    const content = personal ? (typeof personalContent === "string" ? personalContent : "") : (typeof socialResult.data?.content === "string" ? socialResult.data.content : "");
    const socialComplete = profileUrls.length > 0 && content.startsWith(socialSignature);
    const socialIncomplete = socialComplete && /(?:Public posts (?:could not be retrieved|were not inspected)|No public posts returned)/.test(content);
    const sections = content.split(/\n\n(?=Profile: )/);
    const socialPosts = await Promise.all(profiles.map(async (profile) => {
      const section = sections.find((part) => {
        const match = part.match(/(?:^|\n)Profile: (.+)/);
        const found = match && parseClientSocialProfile(match[1]!, profile.platform);
        return found?.platform === profile.platform && found.handle.toLowerCase() === profile.handle.toLowerCase();
      }) ?? "";
      const parsedPosts = [...section.matchAll(/^- (\S+|Date unavailable) (https:\/\/\S+)\n([\s\S]*?)(?=\n- (?:\S+|Date unavailable) https:\/\/|(?![\s\S]))/gm)].flatMap((match) => {
        try {
          const url = new URL(match[2]!);
          const host = url.hostname.toLowerCase();
          const allowed = profile.platform === "instagram" ? ["instagram.com"] : profile.platform === "facebook" ? ["facebook.com"] : profile.platform === "tiktok" ? ["tiktok.com"] : profile.platform === "x" ? ["x.com", "twitter.com"] : profile.platform === "youtube" ? ["youtube.com", "youtu.be"] : profile.platform === "substack" ? ["substack.com"] : profile.platform === "linkedin" ? ["linkedin.com"] : [];
          if (!allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) return [];
          const body = match[3]!.trim();
          const coverMatch = body.match(/^\s*Cover: (https:\/\/\S+)(?:\n|$)/);
          const storageMatch = body.match(/^Cover storage: (\S+)(?:\n|$)/);
          const hasVideo = profile.platform === "linkedin" && /^\s*Media type: video$/m.test(body);
          const caption = body.replace(/^(?:\s*(?:Cover: https:\/\/\S+|Cover storage: \S+|Media type: video)\n)+/, "").replace(/^\s*Attribution: authored\s*\n/, "").replace(/^\s*(?:Visual observation \((?:sampled frames|image)\)|Transcript \(audio sample\)|Media cache v1):.*$/gm, "").trim().slice(0, 3000);
          return [{ url: url.href, date: match[1] === "Date unavailable" ? null : match[1] ?? null, caption, cover: coverMatch?.[1] ?? null, coverPath: storageMatch?.[1] ?? null, hasVideo }];
        } catch { return []; }
      }).slice(0, personal ? 20 : 12);
      const posts = await Promise.all(parsedPosts.map(async ({ coverPath, ...post }) => {
        if (!coverPath || profile.platform !== 'linkedin' || !isWorkspaceLinkedInCover(data.workspace_id, coverPath)) return post;
        const { data: signed } = await admin.storage.from('brand-assets-private').createSignedUrl(coverPath, 3600);
        return { ...post, cover: signed?.signedUrl ?? null };
      }));
      return { platform: profile.platform, handle: profile.handle, url: profile.url, posts, status: posts.length ? "available" : /not inspected/.test(section) || profile.platform === "reddit" ? "unsupported" : /could not be retrieved/.test(section) ? "unavailable" : section ? "empty" : "pending" };

    }));
    const ops = latestByKind((operationsResult.data ?? []) as { kind: string; status: string; updated_at: string }[]);
    const operation = ops.get(personal ? "personal-discovery" : "discovery");
    const discoveryStale = operation?.status === "running" && Date.now() - Date.parse(operation.updated_at) > staleAfterMs;
    const discoveryFailed = operation?.status === "failed" || discoveryStale || (!operation && Date.now() - Date.parse(workspace.created_at) > 60_000);
    const reportOp = ops.get("personal-brand-report");
    const reportRunning = personal && reportOp?.status === "running" && Date.now() - Date.parse(reportOp.updated_at) < staleAfterMs;
    const discoveryRunning = (operation?.status === "running" && !discoveryStale) || reportRunning;
    const discoveryComplete = operation?.status === "complete";
    const hasSources = (!personal && !!workspace.website) || profileUrls.length > 0;
    const websiteOperation = ops.get("website");
    const profileOperation = ops.get(personal ? "personal-brand-report" : "profile");

    let website: StepStatus = "not_requested";
    if (!personal && workspace.website) {
      if (websiteOperation?.status === "complete") website = "complete";
      else if (websiteOperation?.status === "failed" || discoveryFailed || (discoveryComplete && !websiteOperation)) website = "needs_attention";
      else if (websiteOperation?.status === "running") website = "running";
      else website = "queued";
    }

    let social: StepStatus = "not_requested";
    if (profileUrls.length) {
      if (socialIncomplete) social = "needs_attention";
      else if (socialComplete) social = "complete";
      else if (discoveryFailed || discoveryComplete) social = "needs_attention";
      else if (discoveryRunning && website !== "running" && website !== "queued") social = "running";
      else social = "queued";
    }

    let brand: StepStatus = "not_requested";
    if (hasSources) {
      if (profileOperation?.status === "complete" || (!personal && discoveryComplete && !!profileResult.data)) brand = "complete";
      else if (profileOperation?.status === "failed" || discoveryFailed || (discoveryComplete && !profileOperation)) brand = "needs_attention";
      else if (profileOperation?.status === "running") brand = "running";
      else if (discoveryRunning && (personal || website === "complete") && (!profileUrls.length || socialComplete)) brand = "running";
      else brand = "queued";
    }

    const steps = { website, social, brand };
    const hasAttention = Object.values(steps).includes("needs_attention");
    const profileRecord = profileResult.data?.profile && typeof profileResult.data.profile === "object" && !Array.isArray(profileResult.data.profile)
      ? profileResult.data.profile as Record<string, unknown>
      : null;
    const safeText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
    const themes = Array.isArray(profileRecord?.["themes"]) ? profileRecord["themes"].flatMap((theme) => {
      if (!theme || typeof theme !== "object" || Array.isArray(theme)) return [];
      const item = theme as Record<string, unknown>;
      const title = safeText(item["title"], 100);
      const evidence = safeText(item["evidence"], 280);
      return title && evidence ? [{ title, evidence }] : [];
    }).slice(0, 5) : [];
    const suggestions = Array.isArray(profileResult.data?.suggestions) ? profileResult.data.suggestions.flatMap((suggestion) => {
      if (!suggestion || typeof suggestion !== "object" || Array.isArray(suggestion)) return [];
      const item = suggestion as Record<string, unknown>;
      const title = safeText(item["title"], 120);
      const why = safeText(item["why"], 320);
      const format = item["format"] === "image" ? "image" : item["format"] === "video" ? "video" : null;
      return title && why && format ? [{ title, why, format }] : [];
    }).slice(0, 5) : [];
    const brandSummary = profileRecord && !personal ? {
      name: safeText(profileRecord["name"], 100) || workspace.name,
      whatItIs: safeText(profileRecord["what_it_is"], 600),
      audience: safeText(profileRecord["audience"], 280),
      tone: safeText(profileRecord["tone"], 180),
      themes,
      suggestions,
      updatedAt: profileResult.data?.updated_at ?? null,
    } : null;
    return {
      status: !hasSources ? "not_started" : discoveryRunning ? "running" : discoveryComplete ? (hasAttention ? "needs_attention" : "complete") : discoveryFailed ? "needs_attention" : "queued",
      canRetry: !operation || operation.status === "failed",
      steps,
      updatedAt: operation?.updated_at ?? null,
      brandSummary,
      socialPosts,
    };
  });
