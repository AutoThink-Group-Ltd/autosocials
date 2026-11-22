import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, getAdminClient } from "./supabase-admin.server";
import { encrypt, resolveElevenLabsKey, elevenFetch } from "./integrations.server";
import { normaliseVoices, VIDEO_SIZES, BUILTIN_VOICES, BUILTIN_PREFIX } from "./integrations";

const wsId = z.string().uuid().nullable();

async function assertCanManage(userId: string, workspaceId: string | null) {
  const admin = getAdminClient();
  if (!workspaceId) {
    const { data } = await admin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!data) throw new Error("Only super admins can change the platform key.");
    return admin;
  }
  const [{ data: owner }, { data: agency }] = await Promise.all([
    admin.rpc("is_workspace_owner", { _user_id: userId, _workspace_id: workspaceId }),
    admin.rpc("is_workspace_agency", { _user_id: userId, _workspace_id: workspaceId }),
  ]);
  if (!owner && !agency) throw new Error("Only the workspace owner or its agency can change integrations.");
  return admin;
}

async function assertCanView(userId: string, workspaceId: string | null) {
  const admin = getAdminClient();
  if (!workspaceId) return assertCanManage(userId, null);
  const { data } = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: workspaceId });
  if (!data) throw new Error("Forbidden");
  return admin;
}

export const getIntegrationStatus = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: wsId }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertCanView(user.id, data.workspace_id);
    const { data: rows } = await admin.from("integration_credentials").select("workspace_id,last4,verified_at,updated_at").eq("provider", "elevenlabs");
    const platform = rows?.find((r) => !r.workspace_id) ?? null;
    const own = data.workspace_id ? rows?.find((r) => r.workspace_id === data.workspace_id) ?? null : null;
    const settings = data.workspace_id
      ? (await admin.from("workspace_voice_settings").select("*").eq("workspace_id", data.workspace_id).maybeSingle()).data : null;
    let render: null | { ok: boolean; concurrency?: number; sizes?: string[] } = null;
    if (!data.workspace_id && process.env["RENDER_SERVER_URL"]) {
      try {
        const r = await fetch(`${process.env["RENDER_SERVER_URL"]!.replace(/\/$/, "")}/v1/health`, { headers: { Authorization: `Bearer ${process.env["RENDER_SERVER_SECRET"] ?? ""}` } });
        const j = (await r.json()) as { authenticated?: boolean; concurrency?: number };
        render = { ok: !!j.authenticated, concurrency: j.concurrency ?? 0, sizes: [...VIDEO_SIZES] };
      } catch { render = { ok: false }; }
    }
    return {
      platform: platform ? { last4: platform.last4, verified_at: platform.verified_at } : null,
      own: own ? { last4: own.last4, verified_at: own.verified_at } : null,
      settings, render,
    };
  });

export const saveElevenLabsKey = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: wsId, key: z.string().trim().min(20).max(200) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertCanManage(user.id, data.workspace_id);
    await elevenFetch(data.key, "/v1/user/subscription"); // verify before storing
    const enc = await encrypt(data.key);
    const row = { scope: data.workspace_id ? "workspace" : "platform", workspace_id: data.workspace_id, provider: "elevenlabs", ...enc, last4: data.key.slice(-4), verified_at: new Date().toISOString(), updated_by: user.id, updated_at: new Date().toISOString() };
    const del = admin.from("integration_credentials").delete().eq("provider", "elevenlabs");
    await (data.workspace_id ? del.eq("workspace_id", data.workspace_id) : del.is("workspace_id", null));
    const { error } = await admin.from("integration_credentials").insert(row);
    if (error) throw new Error(error.message);
    if (data.workspace_id) await admin.from("workspace_voice_settings").upsert({ workspace_id: data.workspace_id, use_own_key: true, updated_at: new Date().toISOString() });
    await admin.from("integration_events").insert({ provider: "elevenlabs", workspace_id: data.workspace_id, action: "key_saved", user_id: user.id });
    return { ok: true };
  });

export const removeElevenLabsKey = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: wsId }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertCanManage(user.id, data.workspace_id);
    const del = admin.from("integration_credentials").delete().eq("provider", "elevenlabs");
    await (data.workspace_id ? del.eq("workspace_id", data.workspace_id) : del.is("workspace_id", null));
    if (data.workspace_id) await admin.from("workspace_voice_settings").upsert({ workspace_id: data.workspace_id, use_own_key: false, updated_at: new Date().toISOString() });
    await admin.from("integration_events").insert({ provider: "elevenlabs", workspace_id: data.workspace_id, action: "key_removed", user_id: user.id });
    return { ok: true };
  });

export const setUseOwnKey = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid(), use_own_key: z.boolean() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertCanManage(user.id, data.workspace_id);
    await admin.from("workspace_voice_settings").upsert({ workspace_id: data.workspace_id, use_own_key: data.use_own_key, updated_at: new Date().toISOString() });
    return { ok: true };
  });

export const testElevenLabs = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: wsId }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await assertCanView(user.id, data.workspace_id);
    const k = await resolveElevenLabsKey(data.workspace_id);
    if (!k) throw new Error("No ElevenLabs key is set yet.");
    const s = (await elevenFetch(k.key, "/v1/user/subscription")) as { tier?: string; character_count?: number; character_limit?: number };
    return { source: k.source, tier: s.tier ?? "unknown", used: s.character_count ?? 0, limit: s.character_limit ?? 0 };
  });

export type Voice = { id: string; name: string; preview_url: string | null; labels: Record<string, string>; category: string; builtin?: boolean };

export const listVoices = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: wsId }).parse(i))
  .handler(async ({ data }): Promise<{ source: string; voices: Voice[] }> => {
    const user = await requireUser();
    await assertCanView(user.id, data.workspace_id);
    const builtin: Voice[] = BUILTIN_VOICES.map((v) => ({ id: BUILTIN_PREFIX + v.name, name: v.name, preview_url: null, labels: v.labels, category: "AutoSocials", builtin: true }));
    const k = await resolveElevenLabsKey(data.workspace_id);
    if (!k) return { source: "none", voices: builtin };
    const j = (await elevenFetch(k.key, "/v2/voices?page_size=100")) as { voices?: { voice_id: string; name: string; preview_url?: string; labels?: Record<string, string>; category?: string }[] };
    return {
      source: k.source,
      voices: [...builtin, ...(j.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, preview_url: v.preview_url ?? null, labels: v.labels ?? {}, category: v.category ?? "" }))],
    };
  });

/** Short sample of a built-in voice, as a data URL. */
export const previewBuiltInVoice = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ voice: z.enum(BUILTIN_VOICES.map((v) => v.name) as [string, ...string[]]) }).parse(i))
  .handler(async ({ data }) => {
    await requireUser();
    const { synthesiseBuiltInVoice } = await import("./render.server");
    const buf = new Uint8Array(await synthesiseBuiltInVoice(data.voice, `Say warmly: Hi, I'm ${data.voice}. I can narrate your brand's videos.`));
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { url: `data:audio/wav;base64,${btoa(s)}` };
  });

export const setAutoPick = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid(), auto_pick: z.boolean() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertCanManage(user.id, data.workspace_id);
    const { error } = await admin.from("workspace_voice_settings").upsert({ workspace_id: data.workspace_id, auto_pick: data.auto_pick, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const pick = z.object({ id: z.string().min(1).max(80), name: z.string().max(120), labels: z.record(z.string(), z.string()).optional() });
export const saveVoiceSettings = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid(), brand: pick.nullable(), allowed: z.array(pick).max(50) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertCanManage(user.id, data.workspace_id);
    const n = normaliseVoices(data.brand, data.allowed);
    const { error } = await admin.from("workspace_voice_settings").upsert({
      workspace_id: data.workspace_id, brand_voice_id: n.brand?.id ?? null, brand_voice_name: n.brand?.name ?? null,
      allowed: n.allowed, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
