// Server-only: look at each brand image once (pixels + header) and save how it may be used.
import { imageHeader, type Manifest, type MediaRole } from "./film-qa";
import type { getAdminClient } from "./supabase-admin.server";
import { fetchOpenAI } from "./openai-quota.server";

type Admin = ReturnType<typeof getAdminClient>;
const ROLES: MediaRole[] = ["logo", "portrait", "product_ui", "scene", "other"];

export async function inspectImage(admin: Admin, fileId: string, kind: string, mime: string, buf: ArrayBuffer): Promise<Manifest> {
  const h = imageHeader(buf);
  const m: Manifest = { width: h?.width ?? null, height: h?.height ?? null, has_alpha: h?.hasAlpha ?? null, bg_tone: null, media_role: kind === "logo" ? "logo" : null, subject: null };
  const key = process.env["OPENAI_API_KEY"];
  if (key && buf.byteLength < 4_000_000) {
    try {
      let s = ""; const b = new Uint8Array(buf);
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      const r = await fetchOpenAI("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.4-mini",
          messages: [{ role: "user", content: [
            { type: "text", text: `Classify this brand image for a motion designer.${h?.hasAlpha ? " The file has an alpha channel." : ""} Return JSON {"role": one of ${ROLES.join("|")} (portrait = a person is the subject), "bg_tone": "transparent"|"light"|"dark"|"busy" (the background around the subject as it would appear on screen), "subject": max 14 words}.` },
            { type: "image_url", image_url: { url: `data:${mime || "image/png"};base64,${btoa(s)}` } },
          ] }],
          response_format: { type: "json_object" },
        }),
      });
      if (r.ok) {
        const j = JSON.parse(((await r.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "{}") as { role?: string; bg_tone?: string; subject?: string };
        if (!m.media_role && ROLES.includes(j.role as MediaRole)) m.media_role = j.role as MediaRole;
        if (["transparent", "light", "dark", "busy"].includes(j.bg_tone ?? "")) m.bg_tone = j.bg_tone as Manifest["bg_tone"];
        m.subject = (j.subject ?? "").slice(0, 140) || null;
      }
    } catch (e) { console.warn("[inspect] vision failed", e); }
  }
  m.media_role ??= "other";
  await admin.from("brand_files").update({ ...m, inspected_at: new Date().toISOString() }).eq("id", fileId);
  return m;
}

