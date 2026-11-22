import { getAdminClient } from "./supabase-admin.server";
import { pickKeySource } from "./integrations";

const b64 = (u: Uint8Array) => { let s = ""; for (const c of u) s += String.fromCharCode(c); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey() {
  const raw = process.env["INTEGRATIONS_ENC_KEY"];
  if (!raw) throw new Error("Integrations encryption is not configured");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain));
  return { ciphertext: b64(new Uint8Array(ct)), iv: b64(iv) };
}

export async function decrypt(ciphertext: string, iv: string) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(), unb64(ciphertext));
  return new TextDecoder().decode(pt);
}

async function readKey(provider: string, workspaceId: string | null) {
  const q = getAdminClient().from("integration_credentials").select("ciphertext,iv").eq("provider", provider);
  const { data } = await (workspaceId ? q.eq("workspace_id", workspaceId) : q.is("workspace_id", null)).maybeSingle();
  return data ? decrypt(data.ciphertext, data.iv) : null;
}

/** The one place the ElevenLabs key is resolved for a workspace (workspace → platform). */
export async function resolveElevenLabsKey(workspaceId: string | null): Promise<{ key: string; source: "workspace" | "platform" } | null> {
  const admin = getAdminClient();
  const settings = workspaceId ? (await admin.from("workspace_voice_settings").select("use_own_key").eq("workspace_id", workspaceId).maybeSingle()).data : null;
  const [ws, platform] = await Promise.all([workspaceId ? readKey("elevenlabs", workspaceId) : null, readKey("elevenlabs", null)]);
  const source = pickKeySource({ useOwnKey: !!settings?.use_own_key, hasWorkspaceKey: !!ws, hasPlatformKey: !!platform });
  if (source === "workspace") return { key: ws!, source };
  if (source === "platform") return { key: platform!, source };
  return null;
}

export async function elevenFetch(key: string, path: string) {
  const r = await fetch(`https://api.elevenlabs.io${path}`, { headers: { "xi-api-key": key } });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(r.status === 401 ? "ElevenLabs rejected this key." : `ElevenLabs ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json();
}
