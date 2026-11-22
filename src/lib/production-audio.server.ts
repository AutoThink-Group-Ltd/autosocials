import type { getAdminClient } from "./supabase-admin.server";
import { readAssembledDelivery, readMusicWav } from "./production-audio";

export async function loadApprovedSoundtrack(admin: ReturnType<typeof getAdminClient>, workspaceId: string, plan: unknown): Promise<ArrayBuffer | null> {
  const delivery = readAssembledDelivery(plan);
  if (!delivery?.music_file_id) return null;
  const result = await admin.from("brand_files").select("id,workspace_id,storage_path,media_id,size_bytes,mime,kind").eq("id", delivery.music_file_id).eq("workspace_id", workspaceId).maybeSingle();
  const file = result.data;
  if (result.error || !file || file.workspace_id !== workspaceId || file.kind !== "audio") throw new Error("The selected soundtrack is not available in this business.");
  if (!file.size_bytes || file.size_bytes > 20 * 1024 * 1024) throw new Error("Choose a PCM WAV soundtrack up to 20 MB.");
  let audio: ArrayBuffer;
  if (file.media_id && file.storage_path === `autotoast:${file.media_id}`) {
    const media = await (await import("./render.server")).getMedia(file.media_id);
    const url = media.download_url ?? media.playback_url;
    if (!url) throw new Error("The selected soundtrack is still processing. Try again when its upload is ready.");
    const downloaded = await (await import("./creative-media.server")).downloadCreativeMedia(url, { expected: "audio", maxBytes: 20 * 1024 * 1024 });
    audio = Uint8Array.from(downloaded.bytes).buffer;
  } else {
    if (!file.storage_path.startsWith(`${workspaceId}/`) || file.storage_path.includes("\\") || file.storage_path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("The soundtrack storage reference is invalid.");
    const downloaded = await admin.storage.from("brand-assets-private").download(file.storage_path);
    if (downloaded.error || !downloaded.data) throw new Error("The selected soundtrack could not be loaded.");
    audio = await downloaded.data.arrayBuffer();
  }
  readMusicWav(audio);
  return audio;
}
