import { downloadCreativeMedia } from "./creative-media.server";
import type { TileProvider } from "./social-tile-routing";

type Output = { bytes: Buffer; mime: string; credits: number | null; providerRequestId: string | null };
export class TileProviderError extends Error {
  constructor(public provider: TileProvider, public status: number) { super("The design provider could not complete the request."); }
}

/** One generation call only. Callers must reconcile interruptions instead of retrying. */
export async function generateExternalTile(provider: "recraft" | "ideogram", key: string, prompt: string, references: string[], recordUsage: (credits: number | null, requestId: string | null) => Promise<void>): Promise<Output> {
  let response: Response;
  if (provider === "recraft") {
    response = await fetch("https://external.api.recraft.ai/v1/images/generations", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(240_000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt.slice(0, 10000), model: "recraftv4_styles", size: "1024x1024", n: 1, image_format: "png", response_format: "b64_json", style_reference_urls: references.slice(0, 6), style_match: "flexible" }),
    });
  } else {
    const form = new FormData();
    form.set("prompt", prompt.slice(0, 10000)); form.set("size", "1024x1024"); form.set("quality", "high"); form.set("num_images", "1");
    // Ideogram treats the first image as the edited source and subsequent images as references.
    for (const [index, image] of references.slice(0, 5).entries()) {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
      if (!match) throw new Error("A brand reference could not be verified.");
      form.append("images", new Blob([Uint8Array.from(Buffer.from(match[2]!, "base64"))], { type: match[1] }), `brand-${index}.${match[1]!.split("/")[1]}`);
    }
    response = await fetch("https://api.ideogram.ai/v2/image/generate/ideogram-4-5", { method: "POST", redirect: "error", signal: AbortSignal.timeout(240_000), headers: { "Api-Key": key }, body: form });
  }
  if (!response.ok) throw new TileProviderError(provider, response.status);
  if (!response.body) throw new Error("The design response was empty.");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 16_000_000) { await reader.cancel(); throw new Error("The design response was too large."); } chunks.push(part.value); }
  const result = JSON.parse(Buffer.concat(chunks, length).toString("utf8")) as { credits?: unknown; generation_id?: unknown; data?: Array<{ b64_json?: unknown; url?: unknown; is_image_safe?: unknown }> };
  const credits = typeof result.credits === "number" && Number.isFinite(result.credits) && result.credits >= 0 ? result.credits : null;
  const providerRequestId = typeof result.generation_id === "string" ? result.generation_id.slice(0, 200) : response.headers.get("x-request-id");
  await recordUsage(credits, providerRequestId);
  const item = result.data?.length === 1 ? result.data[0] : undefined;
  if (!item || item.is_image_safe === false) throw new Error("The design response could not be verified.");
  if (provider === "recraft" && typeof item.b64_json === "string" && item.b64_json.length <= 12_000_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json)) {
    const bytes = Buffer.from(item.b64_json, "base64");
    if (bytes.toString("base64") !== item.b64_json) throw new Error("The design image could not be verified.");
    return { bytes, mime: "image/png", credits, providerRequestId };
  }
  if (provider === "ideogram" && typeof item.url === "string") {
    const image = await downloadCreativeMedia(item.url, { expected: "image", maxBytes: 9_000_000 });
    return { bytes: Buffer.from(image.bytes), mime: image.contentType, credits, providerRequestId };
  }
  throw new Error("The design image could not be verified.");
}
