import { supabase } from "@/integrations/supabase/client";

const BUCKET = "email-assets";

export function isPersistentUrl(url: string): boolean {
  return url.includes("/storage/v1/object/public/email-assets/") || url.includes("/storage/v1/object/public/workspace-logos/");
}

function getImageFetchCandidates(img: HTMLImageElement): string[] {
  const candidates: string[] = [];
  const src = img.getAttribute("src");
  if (src) candidates.push(src);

  // Handle Missive-specific attributes
  const missiveAttr = img.getAttribute("data-missive-attachment-attributes");
  if (missiveAttr) {
    try {
      const parsed = JSON.parse(missiveAttr.replace(/&amp;/g, "&").replace(/&quot;/g, '"'));
      if (parsed.signed_url) candidates.push(parsed.signed_url);
      if (parsed.thumbnail?.url) candidates.push(parsed.thumbnail.url);
    } catch {}
  }

  return [...new Set(candidates)];
}

async function uploadBlob(blob: Blob, workspaceId: string): Promise<string | null> {
  const ext = blob.type.includes("png") ? "png" : blob.type.includes("gif") ? "gif" : blob.type.includes("webp") ? "webp" : "jpg";
  const fileName = `${workspaceId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(fileName, blob, {
    contentType: blob.type,
    upsert: false,
  });
  if (error) return null;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
}

async function tryBrowserFetch(url: string, workspaceId: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;
    const blob = await res.blob();
    return uploadBlob(blob, workspaceId);
  } catch {
    return null;
  }
}

async function tryEdgeFunctionProxy(url: string, workspaceId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("persist-signature-image", {
      body: { image_url: url, workspace_id: workspaceId },
    });
    if (error || !data?.public_url) return null;
    return data.public_url;
  } catch {
    return null;
  }
}

async function tryCanvasCapture(img: HTMLImageElement, workspaceId: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width || 200;
      canvas.height = img.naturalHeight || img.height || 200;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(async (blob) => {
        if (!blob) { resolve(null); return; }
        const url = await uploadBlob(blob, workspaceId);
        resolve(url);
      }, "image/png");
    } catch {
      resolve(null);
    }
  });
}

export async function persistImage(
  img: HTMLImageElement,
  workspaceId: string
): Promise<string | null> {
  const candidates = getImageFetchCandidates(img);
  const src = img.getAttribute("src") || "";

  if (isPersistentUrl(src)) return src;

  // Fallback 1: browser fetch
  for (const url of candidates) {
    const result = await tryBrowserFetch(url, workspaceId);
    if (result) return result;
  }

  // Fallback 2: edge function proxy (http(s) only)
  for (const url of candidates) {
    if (url.startsWith("http")) {
      const result = await tryEdgeFunctionProxy(url, workspaceId);
      if (result) return result;
    }
  }

  // Fallback 3: canvas capture
  const canvasResult = await tryCanvasCapture(img, workspaceId);
  return canvasResult;
}

export async function persistAllImages(
  container: HTMLElement,
  workspaceId: string
): Promise<void> {
  const imgs = container.querySelectorAll("img");
  for (const img of Array.from(imgs)) {
    const src = img.getAttribute("src") || "";
    if (isPersistentUrl(src)) continue;
    const newUrl = await persistImage(img, workspaceId);
    if (newUrl) img.setAttribute("src", newUrl);
  }
}

export async function uploadFileAsImage(file: File, workspaceId: string): Promise<string | null> {
  return uploadBlob(file, workspaceId);
}
