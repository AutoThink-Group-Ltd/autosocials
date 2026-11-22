import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getAdminClient, requireUser, supabaseUrl } from "./supabase-admin.server";
import { accountsForWorkspace, normalizeConnectedPosts } from "./personal-connected-feeds";

const feeds: Record<string, string> = { facebook: "meta-fetch-feed", instagram: "meta-fetch-feed", x: "x-fetch-feed", youtube: "youtube-fetch-feed", tiktok: "tiktok-fetch-feed" };
/** Call existing user-authorized endpoints while the user session is present. Never persist bearer or provider tokens. */
export const collectConnectedPersonalFeeds = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => z.object({ workspace_id: z.string().uuid(), force: z.boolean().optional() }).parse(value))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: data.workspace_id });
    if (access.error || !access.data) throw new Error("Forbidden");
    const [owner, agency, member, kind] = await Promise.all([
      admin.rpc("is_workspace_owner", { _user_id: user.id, _workspace_id: data.workspace_id }),
      admin.from("agency_client_links").select("id").eq("agency_user_id", user.id).eq("workspace_id", data.workspace_id).eq("status", "active").limit(1),
      admin.from("workspace_members").select("role").eq("workspace_id", data.workspace_id).eq("user_id", user.id).maybeSingle(),
      admin.from("agency_clients").select("id").eq("workspace_id", data.workspace_id).eq("workspace_kind", "personal").eq("status", "active").limit(1),
    ]);
    const [staffOwner, staffRole] = await Promise.all([admin.rpc("agency_staff_owner", { _user_id: user.id }), admin.rpc("agency_staff_role", { _user_id: user.id })]);
    let staffCanEdit = false;
    if (staffOwner.data && ["owner", "admin"].includes(String(staffRole.data))) {
      const linked = await admin.from("agency_clients").select("id").eq("agency_user_id", staffOwner.data).eq("workspace_id", data.workspace_id).eq("status", "active").limit(1);
      staffCanEdit = !linked.error && !!linked.data?.length;
    }
    if (!kind.data?.length || !(owner.data || (!agency.error && agency.data?.length) || member.data?.role === "admin" || staffCanEdit)) throw new Error("Only personal workspace managers can refresh connected feeds");
    const accounts = await admin.from("social_accounts").select("id,platform,handle,workspace_id").eq("workspace_id", data.workspace_id).eq("status", "connected").eq("is_enabled", true);
    if (accounts.error) throw new Error("Could not load connected accounts");
    const title = "Personal brand connected feeds";
    const existing = await admin.from("dossier_documents").select("id,content,updated_at").eq("workspace_id", data.workspace_id).eq("source", "paste").eq("title", title).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (existing.error) throw new Error("Could not load connected feed coverage");
    if (!data.force && existing.data?.content && Date.now() - Date.parse(existing.data.updated_at ?? "") < 7 * 86400000) {
      try { const prior = JSON.parse(existing.data.content); const oldIds = (prior.channels ?? []).map((row: { accountId: string; platform: string }) => `${row.accountId}:${row.platform}`).sort(); const ids = (accounts.data ?? []).map((row) => `${row.id}:${row.platform}`).sort(); if (JSON.stringify(oldIds) === JSON.stringify(ids)) return { ...prior, changed: false }; } catch { /* Refresh invalid snapshots. */ }
    }
    const auth = getRequestHeader("authorization") ?? "";
    const key = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!auth.startsWith("Bearer ") || !key) throw new Error("Session unavailable");
    const results = await Promise.all(accountsForWorkspace(data.workspace_id, accounts.data ?? []).map(async (account) => {
      if (!feeds[account.platform]) return { accountId: account.id, platform: account.platform, handle: account.handle, status: "unsupported", posts: [] };
      try {
        const response = await fetch(`${supabaseUrl()}/functions/v1/${feeds[account.platform]}`, { method: "POST", headers: { authorization: auth, apikey: key, "content-type": "application/json" }, body: JSON.stringify({ social_account_id: account.id }), signal: AbortSignal.timeout(20000) });
        if (!response.ok) return { accountId: account.id, platform: account.platform, handle: account.handle, status: "unavailable", posts: [] };
        const result = await response.json() as { posts?: Array<Record<string, unknown>> };
        const posts = normalizeConnectedPosts(account.platform, result.posts);
        return { accountId: account.id, platform: account.platform, handle: account.handle, status: posts.length ? "available" : "empty", posts };
      } catch { return { accountId: account.id, platform: account.platform, handle: account.handle, status: "unavailable", posts: [] }; }
    }));
    results.sort((a, b) => a.accountId.localeCompare(b.accountId));
    const snapshot = { fetchedAt: new Date().toISOString(), channels: results };
    const content = JSON.stringify(snapshot);
    if (existing.data?.content) {
      try { const previous = JSON.parse(existing.data.content); if (JSON.stringify(previous?.channels) === JSON.stringify(snapshot.channels)) return { ...previous, changed: false }; } catch { /* Replace invalid snapshot. */ }
    }
    const saved = existing.data ? await admin.from("dossier_documents").update({ content, updated_at: snapshot.fetchedAt }).eq("workspace_id", data.workspace_id).eq("id", existing.data.id) : await admin.from("dossier_documents").insert({ workspace_id: data.workspace_id, source: "paste", title, content, created_by: user.id });
    if (saved.error) throw new Error("Could not save connected feed coverage");
    return { ...snapshot, changed: true };
  });

/** Per-account coverage contains no credentials or raw feed text. */
export const getConnectedPersonalFeedCoverage = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const user = await requireUser(); const admin = getAdminClient();
    const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: data.workspace_id });
    if (access.error || !access.data) throw new Error("Forbidden");
    const [accounts, saved] = await Promise.all([
      admin.from("social_accounts").select("id,platform,handle").eq("workspace_id", data.workspace_id).eq("status", "connected").eq("is_enabled", true),
      admin.from("dossier_documents").select("content,updated_at").eq("workspace_id", data.workspace_id).eq("source", "paste").eq("title", "Personal brand connected feeds").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (accounts.error || saved.error) throw new Error("Could not load connected feed coverage");
    let channels: Array<{ accountId: string; status: string; posts: unknown[] }> = [];
    try { const parsed = JSON.parse(saved.data?.content ?? "null"); if (Array.isArray(parsed?.channels)) channels = parsed.channels; } catch { /* Invalid snapshots have no coverage. */ }
    return { updatedAt: saved.data?.updated_at ?? null, accounts: (accounts.data ?? []).map((account) => { const row = channels.find((item) => item?.accountId === account.id); const allowed = ["available", "empty", "unsupported", "unavailable"]; return { id: account.id, platform: account.platform, handle: account.handle, status: row && allowed.includes(row.status) ? row.status : "pending", count: row && Array.isArray(row.posts) ? Math.min(row.posts.length, 20) : 0 }; }) };
  });
