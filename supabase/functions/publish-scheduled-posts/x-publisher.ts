import { ProviderError } from "./delivery.ts";
type DeliveryContext = { checkpoint: (patch: Record<string, unknown>) => Promise<void> };
export async function publishX(account: any, post: any, media: any[], context: DeliveryContext, supabaseUrl: string): Promise<{id: string; permalink: string}> {
  const text = String(post.caption ?? "");
  if (!text.trim() && !media.length) throw new ProviderError("Add text or media to publish on X.");
  if (media.length > 4 || (media.some(m => m.kind === "video") && (media.length !== 1 || media[0].kind !== "video")))
    throw new ProviderError("X supports up to four images or one video per post.");
  const ids: string[] = [];
  const auth = { Authorization: `Bearer ${account.access_token}` };
  for (const asset of media) {
    const allowed = asset.kind === "video" ? ["video/mp4"] : asset.kind === "image" ? ["image/jpeg", "image/png", "image/webp"] : [];
    if (!allowed.includes(asset.mime)) throw new ProviderError("X supports JPEG, PNG, WebP images and MP4 video.");
    const sourceUrl = new URL(asset.url);
    if (sourceUrl.origin !== new URL(supabaseUrl).origin || !sourceUrl.pathname.startsWith("/storage/v1/object/sign/post-media/"))
      throw new ProviderError("X accepts only assets from this workspace's private media storage.");
    const head = await fetch(sourceUrl, { method: "HEAD", signal: AbortSignal.timeout(30_000) });
    const total = Number(head.headers.get("content-length"));
    const max = asset.kind === "video" ? 512 * 1024 * 1024 : 5 * 1024 * 1024;
    if (!head.ok || !Number.isSafeInteger(total) || total <= 0 || total > max) throw new ProviderError("X media is missing or exceeds the supported size limit.");
    const init = await fetch("https://api.x.com/2/media/upload/initialize", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ media_type: asset.mime, total_bytes: total, media_category: asset.kind === "video" ? "tweet_video" : "tweet_image" }), signal: AbortSignal.timeout(30_000) });
    const initialized = await init.json().catch(() => ({}));
    const id = initialized.data?.id;
    if (!init.ok || typeof id !== "string" || !/^\d+$/.test(id)) throw new ProviderError(`X media upload could not be initialized (${init.status}).`, init.status === 429 || init.status >= 500);
    const chunkSize = 4 * 1024 * 1024;
    for (let offset = 0, segment = 0; offset < total; offset += chunkSize, segment++) {
      const end = Math.min(offset + chunkSize, total) - 1;
      const source = await fetch(sourceUrl, { headers: { Range: `bytes=${offset}-${end}` }, signal: AbortSignal.timeout(60_000) });
      if (source.status !== 206 && !(offset === 0 && total <= chunkSize && source.status === 200)) { await source.body?.cancel(); throw new ProviderError("Private media storage could not provide a bounded chunk."); }
      const lengthHeader = source.headers.get("content-length");
      const length = Number(lengthHeader);
      const expectedRange = `bytes ${offset}-${end}/${total}`;
      if (!lengthHeader || length !== end - offset + 1 || (source.status === 206 && source.headers.get("content-range") !== expectedRange)) { await source.body?.cancel(); throw new ProviderError("Private media storage returned an invalid chunk size."); }
      const bytes = new Uint8Array(await source.arrayBuffer());
      if (bytes.byteLength !== end - offset + 1) throw new ProviderError("Private media storage returned an incomplete chunk.");
      const form = new FormData();
      form.set("segment_index", String(segment));
      form.set("media", new Blob([bytes], { type: asset.mime }), "media");
      const append = await fetch(`https://api.x.com/2/media/upload/${id}/append`, { method: "POST", headers: auth, body: form, signal: AbortSignal.timeout(60_000) });
      if (!append.ok) throw new ProviderError(`X media upload failed (${append.status}).`, append.status === 429 || append.status >= 500);
    }
    const finalize = await fetch(`https://api.x.com/2/media/upload/${id}/finalize`, { method: "POST", headers: auth, signal: AbortSignal.timeout(30_000) });
    let data = await finalize.json().catch(() => ({}));
    if (!finalize.ok || data.data?.id !== id) throw new ProviderError(`X media processing could not start (${finalize.status}).`, finalize.status === 429 || finalize.status >= 500);
    for (let i = 0; data.data?.processing_info && data.data.processing_info.state !== "succeeded"; i++) {
      const info = data.data.processing_info;
      if (info.state === "failed") throw new ProviderError("X could not process this media.");
      if (i >= 10) throw new ProviderError("X media is still processing. Retry shortly.", true);
      await new Promise(resolve => setTimeout(resolve, Math.min(10, Math.max(1, Number(info.check_after_secs) || 1)) * 1000));
      const status = await fetch(`https://api.x.com/2/media/upload?command=STATUS&media_id=${id}`, { headers: auth, signal: AbortSignal.timeout(30_000) });
      data = await status.json().catch(() => ({}));
      if (!status.ok || !data.data?.processing_info) throw new ProviderError(`X media status could not be checked (${status.status}).`, status.status === 429 || status.status >= 500);
    }
    ids.push(id);
  }
  await context.checkpoint({ submission_started_at: new Date().toISOString() });
  const response = await fetch("https://api.x.com/2/tweets", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ ...(text.trim() ? { text } : {}), ...(ids.length ? { media: { media_ids: ids } } : {}) }), signal: AbortSignal.timeout(30_000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ProviderError(`X could not publish this post (${response.status}).`, response.status === 429, response.status < 500);
  if (typeof result.data?.id !== "string" || !/^\d+$/.test(result.data.id)) throw new ProviderError("X did not confirm the post ID. Check the account feed before retrying.", false, false);
  return { id: result.data.id, permalink: `https://x.com/i/status/${result.data.id}` };
}






