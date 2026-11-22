import { downloadCreativeMedia } from "./creative-media.server";
import { getAdminClient } from "./supabase-admin.server";
import { runBrandOperation } from "./brand-assets.functions";
const API = "https://api.shutterstock.com/v2";
/** Match the observed subscriptions response; a saved token alone is not entitlement. */
export function selectImageSubscription(value: unknown, now = Date.now()): { id: string; expiration_time: string } | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item) => {
    if (!item || typeof item !== "object" || item.is_active === false || typeof item.id !== "string" || !item.id || item.asset_type !== "images" || typeof item.license !== "string" || !item.license) return false;
    const expiration = Date.parse(item.expiration_time), start = Date.parse(item.allotment?.start_time), end = Date.parse(item.allotment?.end_time);
    return expiration > now && start <= now && end > now && typeof item.allotment?.downloads_left === "number" && Number.isFinite(item.allotment.downloads_left) && item.allotment.downloads_left > 0
      && Array.isArray(item.formats) && item.formats.some((format: { size?: string; media_type?: string }) => format?.size === "huge" && format.media_type === "image");
  }).sort((a, b) => Date.parse(a.expiration_time) - Date.parse(b.expiration_time))[0] ?? null;
}
async function access(userId: string, workspaceId: string, requireConfiguration = true) {
  const admin = getAdminClient(); const check = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: workspaceId });
  if (check.error || !check.data) throw new Error("You do not have access to this business.");
  if (requireConfiguration && !process.env.SHUTTERSTOCK_USER_TOKEN?.trim()) throw new Error("Licensed stock is not connected for this workspace yet. Upload your own images or save this idea and return later."); return admin;
}
export async function stockStatusForUser(userId: string, workspaceId: string) {
  await access(userId, workspaceId, false);
  return { configured: !!process.env.SHUTTERSTOCK_USER_TOKEN?.trim(), entitlement_verified: false as const };
}
async function request(path: string, body?: unknown) {
  const response = await fetch(`${API}${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${process.env.SHUTTERSTOCK_USER_TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  if (response.status === 401 || response.status === 403) throw new Error("Shutterstock access needs reconnecting. Upload your own images or save this idea for later. No automatic retry was made.");
  if (!response.ok) throw new Error(`Shutterstock could not complete this request (${response.status}). No automatic retry was made.`); return response.json();
}
export function licensedStockUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !/(^|\.)(shutterstock\.com|shutterstock\.net)$/.test(url.hostname) || /\/preview\/|\/z\/|\bwm\b/i.test(url.pathname)) throw new Error("A clean licensed stock download was not provided."); return url.href;
}
export async function searchStockForUser(userId: string, workspaceId: string, query: string) {
  await access(userId, workspaceId);
  const result = await request(`/images/search?${new URLSearchParams({ query, per_page: "12", safe: "true", image_type: "photo", view: "minimal" })}`);
  return { illustrative: true, licence_confirmation_required: true, items: (result.data ?? []).slice(0, 12).map((item: any) => ({ id: String(item.id), description: String(item.description ?? ""), preview: item.assets?.preview?.url ?? null })) };
}
export async function licenseStockForUser(userId: string, workspaceId: string, imageId: string) {
  const admin = await access(userId, workspaceId);
  const saved = await runBrandOperation(admin, workspaceId, "stock-license", { image_id: imageId }, async () => {
    const subscriptions = await request("/user/subscriptions");
    const subscription = selectImageSubscription(subscriptions.data);
    if (!subscription?.id) throw new Error("No active Shutterstock subscription was confirmed. Upload an image or save this request for later.");
    const receipt = await request(`/images/licenses?subscription_id=${encodeURIComponent(subscription.id)}`, { images: [{ image_id: imageId, size: "huge" }] });
    const licensed = receipt.data?.[0]; const licenseId = licensed?.license_id ?? licensed?.id;
    if (!licenseId || !licensed?.download?.url) throw new Error("Stock licensing was submitted but its receipt is incomplete. Inspect the saved request before trying again.");
    const media = await downloadCreativeMedia(licensedStockUrl(licensed.download.url), { expected: "image", maxBytes: 25 * 1024 ** 2 });
    const bytes = media.bytes, length = bytes.byteLength, mime = media.contentType, ext = media.extension;
    const path = `${workspaceId}/stock/${imageId}-${licenseId}.${ext}`;
    const upload = await admin.storage.from("brand-assets-private").upload(path, bytes, { contentType: mime, upsert: false }); if (upload.error) throw new Error("The stock image was licensed but could not be stored. Inspect this request before retrying.");
    const file = await admin.from("brand_files").insert({ workspace_id: workspaceId, created_by: userId, name: `Shutterstock ${imageId}.${ext}`, kind: "image", mime, size_bytes: length, storage_path: path, source: "shutterstock", ai_label: "Licensed illustrative stock", extracted_text: `Illustrative stock, not business evidence. Shutterstock image ${imageId}; licence ${licenseId}; subscription ${subscription.id}; licensed ${new Date().toISOString()}.` }).select("id").single();
    if (file.error) throw new Error("The licensed file was stored but its library record could not be saved. Inspect this request before retrying.");
    return { file_id: file.data.id, image_id: imageId, license_id: String(licenseId), illustrative: true };
  });
  return { busy: saved.busy, ...saved.result };
}

