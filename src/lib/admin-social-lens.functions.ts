import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthContext = { supabase: { rpc: (name: string, args: Record<string, string>) => Promise<{ data: unknown; error: unknown }> }; userId: string };
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

async function superAdmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
  if (error || !data) throw new Error("Super admin access required.");
  const { getAdminClient } = await import("./supabase-admin.server");
  return getAdminClient();
}

export type AdminSocialLensRow = {
  id: string; workspaceId: string; workspaceName: string; creatorName: string;
  query: string; status: string; createdAt: string; postCount: number;
  activeShareCount: number; summary: string;
};

const ListInput = z.object({
  workspaceId: z.string().uuid().nullable().optional(),
  search: z.string().trim().max(120).optional().default(""),
  page: z.number().int().min(0).max(1000).optional().default(0),
});

export const listAdminSocialLensReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await superAdmin(context as AuthContext);
    const db = admin as any;
    const { data: workspaces, error: workspaceError } = await admin.from("workspaces").select("id,name").order("name").limit(1000);
    if (workspaceError) throw new Error("Couldn't load workspaces.");
    let query = db.from("research_runs").select("id,workspace_id,user_id,query,status,created_at,posts,analysis", { count: "exact" });
    if (data.workspaceId) query = query.eq("workspace_id", data.workspaceId);
    const search = data.search.replace(/[%_(),]/g, "").trim();
    if (search) query = query.ilike("query", `%${search}%`);
    const { data: records, error, count } = await query.order("created_at", { ascending: false }).range(data.page * 25, data.page * 25 + 24);
    if (error) throw new Error("Couldn't load Social Lens reports.");
    const rows = (records ?? []) as RecordValue[];
    const ids = rows.map((row) => String(row["id"]));
    const userIds = [...new Set(rows.map((row) => String(row["user_id"])))];
    const [{ data: shares, error: sharesError }, { data: profiles, error: profilesError }] = await Promise.all([
      ids.length ? db.from("research_report_shares").select("research_run_id").in("research_run_id", ids).is("revoked_at", null) : Promise.resolve({ data: [], error: null }),
      userIds.length ? admin.from("profiles").select("id,full_name").in("id", userIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (sharesError || profilesError) throw new Error("Couldn't load report details.");
    const workspaceNames = new Map((workspaces ?? []).map((row) => [row.id, row.name]));
    const creatorNames = new Map((profiles ?? []).map((row) => [row.id, row.full_name]));
    const shareCounts = new Map<string, number>();
    for (const share of (shares ?? []) as RecordValue[]) {
      const id = String(share["research_run_id"]);
      shareCounts.set(id, (shareCounts.get(id) ?? 0) + 1);
    }
    return {
      rows: rows.map((row): AdminSocialLensRow => {
        const id = String(row["id"]), workspaceId = String(row["workspace_id"]), userId = String(row["user_id"]);
        return {
          id, workspaceId, workspaceName: workspaceNames.get(workspaceId) ?? "Unknown workspace",
          creatorName: creatorNames.get(userId) ?? `User ${userId.slice(0, 8)}`,
          query: String(row["query"] ?? ""), status: String(row["status"] ?? ""), createdAt: String(row["created_at"] ?? ""),
          postCount: array(row["posts"]).length, activeShareCount: shareCounts.get(id) ?? 0,
          summary: String(object(row["analysis"])["summary"] ?? "").slice(0, 300),
        };
      }),
      total: count ?? 0,
      workspaces: (workspaces ?? []).map((row) => ({ id: row.id, name: row.name })),
    };
  });

export const getAdminSocialLensReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await superAdmin(context as AuthContext);
    const db = admin as any;
    const { data: run, error } = await db.from("research_runs")
      .select("id,workspace_id,query,question,status,created_at,targets,posts,analysis,reply")
      .eq("id", data.runId).maybeSingle();
    if (error || !run) throw new Error("Report not found.");
    const { data: workspace } = await admin.from("workspaces").select("name").eq("id", String(run.workspace_id)).maybeSingle();
    return {
      id: String(run.id), query: String(run.query ?? ""), question: String(run.question ?? ""),
      status: String(run.status ?? ""), createdAt: String(run.created_at ?? ""), workspaceName: workspace?.name ?? "Unknown workspace",
      targets: array(run.targets), posts: array(run.posts),
      analysis: run.analysis ?? null, reply: typeof run.reply === "string" ? run.reply : null,
    };
  });

export const moveAdminSocialLensReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    runId: z.string().uuid(), expectedWorkspaceId: z.string().uuid(), targetWorkspaceId: z.string().uuid(), revokeShares: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await superAdmin(context as AuthContext);
    const { data: result, error } = await (admin as any).rpc("admin_move_research_report", {
      _run_id: data.runId, _expected_workspace_id: data.expectedWorkspaceId,
      _target_workspace_id: data.targetWorkspaceId, _actor_user_id: (context as AuthContext).userId,
      _revoke_shares: data.revokeShares,
    });
    if (error) throw new Error(error.message || "Couldn't move the report.");
    return { ok: true as const, revokedShareCount: Number(object(result)["revokedShareCount"] ?? 0) };
  });
