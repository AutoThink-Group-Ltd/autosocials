import { getAdminClient } from "./supabase-admin.server";
import { runBrandOperation } from "./brand-assets.functions";
import { publicBrandWebsite } from "./brand-discovery.server";
import { downloadCreativeMedia } from "./creative-media.server";
export async function capturePublicAppForUser(userId: string, workspaceId: string, rawUrl: string) {
  const admin = getAdminClient(); const access = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: workspaceId });
  if (access.error || !access.data) throw new Error("You do not have access to this business.");
  const url = publicBrandWebsite(rawUrl); if (!url) throw new Error("Provide a public HTTPS app page. Private addresses and login credentials are not accepted.");
  const key = process.env.FIRECRAWL_API_KEY; if (!key) throw new Error("Public page capture is not connected. Upload screenshots or save this request for later.");
  const work = await runBrandOperation(admin, workspaceId, "public-app-capture", { url }, async () => {
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ url, formats: ["screenshot"], onlyMainContent: false, timeout: 30000 }), signal: AbortSignal.timeout(40000) });
    if (!response.ok) throw new Error("This public page could not be captured. Upload a screenshot or return later; no automatic retry was made.");
    const raw = await response.json(); const screenshot = raw.data?.screenshot;
    if (typeof screenshot !== "string") throw new Error("The capture service returned no screenshot. An authenticated workflow recording is not available.");
    const image = await downloadCreativeMedia(screenshot, { expected: "image", maxBytes: 15 * 1024 ** 2 });
    const path = `${workspaceId}/captures/${crypto.randomUUID()}.${image.extension}`;
    const upload = await admin.storage.from("brand-assets-private").upload(path, image.bytes, { contentType: image.contentType, upsert: false });
    if (upload.error) throw new Error("The screenshot could not be saved. Your creation request is still available.");
    const file = await admin.from("brand_files").insert({ workspace_id: workspaceId, created_by: userId, name: `${new URL(url).hostname} public screenshot.${image.extension}`, kind: "image", mime: image.contentType, size_bytes: image.bytes.byteLength, storage_path: path, source: "capture", ai_label: "Public app screenshot", extracted_text: `Source: ${url}\nCaptured: ${new Date().toISOString()}\nPublic screenshot only. No authenticated workflow or video demonstration was recorded; inspect before use.` }).select("id").single();
    if (file.error) throw new Error("The screenshot was saved but its asset record could not be created. Inspect this request before retrying.");
    return { state: "captured" as const, file_id: file.data.id, source_url: url, kind: "screenshot" as const, authenticated: false };
  });
  return { busy: work.busy, ...work.result };
}
