import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";

const pageStatus = z.enum(["planned", "in_progress", "live"]);
const batchStatus = z.enum(["planned", "in_progress", "done"]);
const id = z.string().uuid();

async function dbForSuperAdmin() {
  const user = await requireUser();
  const db = getAdminClient();
  const { data, error } = await db.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
  if (error || !data) throw new Error("Forbidden");
  return db;
}

export type SeoPlanPage = { id: string; path: string; title: string; cluster_slug: string; target_keyword: string | null; status: "planned" | "in_progress" | "live"; batch_id: string | null };
export type SeoPlanBatch = { id: string; cluster_slug: string; cluster_name: string; name: string; angle: string; prompt: string; status: "planned" | "in_progress" | "done"; sort_order: number };

export const getSeoPlan = createServerFn({ method: "GET" }).handler(async () => {
  const db = (await dbForSuperAdmin()) as any;
  const [batchResult, pageResult] = await Promise.all([
    db.from("seo_batches").select("id,cluster_slug,cluster_name,name,angle,prompt,status,sort_order").order("sort_order"),
    db.from("seo_pages").select("id,path,title,cluster_slug,target_keyword,status,batch_id").order("path").range(0, 999),
  ]);
  if (batchResult.error) throw new Error(batchResult.error.message);
  if (pageResult.error) throw new Error(pageResult.error.message);
  return { batches: batchResult.data as unknown as SeoPlanBatch[], pages: pageResult.data as unknown as SeoPlanPage[] };
});

export const updateSeoPage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id, status: pageStatus }).parse(input))
  .handler(async ({ data }) => {
    const db = (await dbForSuperAdmin()) as any;
    const { error, data: row } = await db.from("seo_pages").update({ status: data.status }).eq("id", data.id).select("id").single();
    if (error || !row) throw new Error(error?.message ?? "Page not found");
    return { ok: true };
  });

export const updateSeoBatch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id, status: batchStatus }).parse(input))
  .handler(async ({ data }) => {
    const db = (await dbForSuperAdmin()) as any;
    const { error, data: row } = await db.from("seo_batches").update({ status: data.status }).eq("id", data.id).select("id").single();
    if (error || !row) throw new Error(error?.message ?? "Batch not found");
    return { ok: true };
  });
