import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertGenerationAdmin } from "./generation-tracker.functions";

export const engineIds = ["hyperframes", "golpo", "openai", "higgsfield", "ideogram", "recraft", "heygen", "kie"] as const;
export type EngineId = typeof engineIds[number];
const engine = z.enum(engineIds);
const videoProvider: Record<string, string> = { hyperframes: "autotoast", golpo: "golpo", higgsfield: "higgsfield", heygen: "heygen", kie: "kie" };
const validDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v))).optional();
const setup = () => {
  const env = process.env;
  const renderer = !!(env["RENDER_SERVER_URL"]?.trim() && env["RENDER_SERVER_SECRET"]?.trim());
  const openai = !!env["OPENAI_API_KEY"]?.trim();
  return {
    kie: { configured: !!env["KIE_API_KEY"]?.trim(), exposure: env["KIE_API_KEY"]?.trim() ? "Configured; customer credit rates required before generation" : "Unavailable: credentials missing" },
    hyperframes: { configured: renderer, exposure: renderer ? "Available for video production" : "Unavailable: renderer not configured" },
    golpo: { configured: !!env["GOLPO_API_KEY"]?.trim(), exposure: env["GOLPO_API_KEY"]?.trim() ? "Available for video production" : "Unavailable: credentials missing" },
    higgsfield: { configured: !!(env["HF_API_KEY_ID"]?.trim() && env["HF_API_KEY_SECRET"]?.trim()), exposure: env["HF_API_KEY_ID"]?.trim() && env["HF_API_KEY_SECRET"]?.trim() ? "Available for video production" : "Unavailable: credentials missing" },
    heygen: { configured: !!env["HEYGEN_API_KEY"]?.trim() && renderer, exposure: env["HEYGEN_API_KEY"]?.trim() && renderer ? "Available for avatar video production" : "Unavailable: credentials or renderer missing" },
    openai: { configured: openai && renderer, exposure: openai && renderer ? "Primary social-image route" : "Unavailable: credentials or renderer missing" },
    ideogram: { configured: !!env["IDEOGRAM_API_KEY"]?.trim() && renderer, exposure: !renderer || !env["IDEOGRAM_API_KEY"]?.trim() ? "Unavailable: credentials or renderer missing" : openai ? "Fallback when OpenAI is unavailable" : "Available as a social-image fallback" },
    recraft: { configured: !!env["RECRAFT_API_KEY"]?.trim() && renderer, exposure: !renderer || !env["RECRAFT_API_KEY"]?.trim() ? "Unavailable: credentials or renderer missing" : openai ? "Fallback when OpenAI is unavailable" : "Available as a social-image fallback" },
  };
};
async function authorized(context: any) {
  await assertGenerationAdmin(context);
  const { getAdminClient } = await import("./supabase-admin.server");
  return getAdminClient() as any;
}
export const getEngineOverview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await authorized(context);
  const states = setup();
  const results = await Promise.all(engineIds.map(async id => {
    if (videoProvider[id]) {
      const [total, completed, failed] = await Promise.all([undefined, "completed", "failed"].map(status => {
        let q = db.from("generation_steps").select("id", { count: "exact", head: true }).eq("provider", videoProvider[id]);
        if (status) q = q.eq("status", status);
        return q;
      }));
      if (total.error || completed.error || failed.error) throw new Error("Engine usage unavailable.");
      let credits = 0, creditRecords = 0;
      if (id === "kie") {
        for (let offset = 0; ; offset += 1000) {
          const result = await db.from("generation_steps").select("usage").eq("provider", "kie").order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 999);
          if (result.error) throw new Error("Engine usage unavailable.");
          for (const row of result.data ?? []) {
            const value = row.usage?.credits;
            if (typeof value === "number" && Number.isFinite(value) && value >= 0) { credits += value; creditRecords++; }
          }
          if ((result.data ?? []).length < 1000) break;
        }
      }
      return { id, ...states[id], total: total.count ?? 0, completed: completed.count ?? 0, failed: failed.count ?? 0, credits: creditRecords ? credits : null, creditRecords };
    }
    // Sum provider-reported credits across all recorded image operations, not just one API page.
    let offset = 0, total = 0, completed = 0, failed = 0, credits = 0, creditRecords = 0;
    for (;;) {
      const res = await db.from("brand_work_operations").select("status,result").eq("kind", "postcard-social-tile").eq("result->>provider", id).order("created_at", { ascending: false }).order("signature", { ascending: false }).range(offset, offset + 999);
      if (res.error) throw new Error("Engine usage unavailable.");
      const rows = res.data ?? [];
      for (const row of rows) { total++; if (row.status === "complete") completed++; if (row.status === "failed") failed++; const c = row.result?.credits; if (typeof c === "number" && Number.isFinite(c) && c >= 0) { credits += c; creditRecords++; } }
      if (rows.length < 1000) break;
      offset += rows.length;
    }
    return { id, ...states[id], total, completed, failed, credits: creditRecords ? credits : null, creditRecords };
  }));
  return results;
});

export const listEngineGallery = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: engine, page: z.number().int().min(0).max(100000), search: z.string().trim().max(100), from: validDate, to: validDate }).strict().refine(v => !v.from || !v.to || v.from <= v.to).parse(v))
  .handler(async ({ data, context }) => {
    const db = await authorized(context);
    const search = data.search.replace(/[^\p{L}\p{N} _.-]/gu, "").trim();
    const end = data.to ? new Date(Date.parse(`${data.to}T00:00:00Z`) + 86400000).toISOString() : null;
    if (videoProvider[data.id]) {
      let q = db.from("generation_steps").select("id,render_job_id,workspace_id,model,brief_summary,created_at,output_storage_path", { count: "exact" }).eq("provider", videoProvider[data.id]).eq("status", "completed").not("output_storage_path", "is", null);
      if (search) q = q.or(`model.ilike.%${search}%,brief_summary.ilike.%${search}%`);
      if (data.from) q = q.gte("created_at", `${data.from}T00:00:00Z`);
      if (end) q = q.lt("created_at", end);
      const res = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(data.page * 24, data.page * 24 + 23);
      if (res.error) throw new Error("Gallery unavailable.");
      return { total: res.count ?? 0, rows: (res.data ?? []).map((r: any) => ({ id: r.id, renderId: r.render_job_id, title: r.brief_summary || r.model, model: r.model, createdAt: r.created_at, kind: "step" as const })) };
    }
    let fileIds: string[] | null = null;
    if (search) {
      const files = await db.from("brand_files").select("id").eq("source", "social_tile").ilike("name", `%${search}%`).limit(1000);
      if (files.error) throw new Error("Gallery search unavailable.");
      fileIds = (files.data ?? []).map((f: any) => f.id);
      if (!fileIds.length) return { total: 0, rows: [] };
    }
    let q = db.from("brand_work_operations").select("signature,workspace_id,result,created_at", { count: "exact" }).eq("kind", "postcard-social-tile").eq("status", "complete").eq("result->>provider", data.id).not("result->>file_id", "is", null);
    if (fileIds) q = q.in("result->>file_id", fileIds);
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00Z`);
    if (end) q = q.lt("created_at", end);
    const res = await q.order("created_at", { ascending: false }).order("signature", { ascending: false }).range(data.page * 24, data.page * 24 + 23);
    if (res.error) throw new Error("Gallery unavailable.");
    const ids = (res.data ?? []).map((r: any) => r.result.file_id);
    const files = ids.length ? await db.from("brand_files").select("id,name").in("id", ids) : { data: [], error: null };
    if (files.error) throw new Error("Gallery unavailable.");
    const names = new Map((files.data ?? []).map((f: any) => [f.id, f.name]));
    return { total: res.count ?? 0, rows: (res.data ?? []).map((r: any) => ({ id: r.result.file_id as string, renderId: null, title: String(names.get(r.result.file_id) ?? "Social image"), model: String(r.result.model ?? "Unknown model"), createdAt: r.created_at, kind: "image" as const })) };
  });

export const engineImageLink = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    const db = await authorized(context);
    const file = await db.from("brand_files").select("workspace_id,storage_path,source").eq("id", data.id).eq("source", "social_tile").single();
    const path = file.data?.storage_path;
    if (file.error || !path || !path.startsWith(`${file.data.workspace_id}/social-tiles/`) || /[\\?#]/.test(path) || path.split("/").some((s: string) => !s || s === "." || s === "..")) throw new Error("Image unavailable.");
    const signed = await db.storage.from("brand-assets-private").createSignedUrl(path, 900);
    if (signed.error || !signed.data?.signedUrl) throw new Error("Image unavailable.");
    return signed.data.signedUrl as string;
  });

