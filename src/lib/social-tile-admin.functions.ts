import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertGenerationAdmin } from "./generation-tracker.functions";
import { mergeSocialTileHistory } from "./social-tile-history";

export const listSocialTileHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ page: z.number().int().min(0).max(100000) }).parse(value))
  .handler(async ({ data, context }) => {
    await assertGenerationAdmin(context as any);
    const { getAdminClient } = await import("./supabase-admin.server");
    const db = getAdminClient() as any;
    // Include direct saves as well as operation records; neither source is filtered by provider.
    async function readAll(makeQuery: () => any) {
      const rows: any[] = [];
      for (let offset = 0;; offset += 1000) {
        const result = await makeQuery().range(offset, offset + 999);
        if (result.error) throw new Error("Social tile history is unavailable.");
        const batch = result.data ?? []; rows.push(...batch);
        if (batch.length < 1000) return rows;
      }
    }
    const [operations, files] = await Promise.all([
      readAll(() => db.from("brand_work_operations").select("workspace_id,signature,status,result,created_at").eq("kind", "postcard-social-tile").order("created_at", { ascending: false }).order("workspace_id", { ascending: false }).order("signature", { ascending: false })),
      readAll(() => db.from("brand_files").select("id,workspace_id,name,created_at").eq("source", "social_tile").eq("kind", "image").order("created_at", { ascending: false }).order("id", { ascending: false })),
    ]);
    const all = mergeSocialTileHistory(operations, files);
    const page = all.slice(data.page * 30, data.page * 30 + 30);
    const workspaceIds: string[] = [...new Set<string>(page.map(row => row.workspaceId))];
    const workspaces = workspaceIds.length ? await db.from("workspaces").select("id,name").in("id", workspaceIds) : { data: [], error: null };
    if (workspaces.error) throw new Error("Social tile history is unavailable.");
    const names = new Map<string, string>((workspaces.data ?? []).map((row: any) => [row.id, row.name]));
    return { total: all.length, rows: page.map(row => ({ ...row, workspace: names.get(row.workspaceId) ?? "Unknown workspace" })) };
  });
