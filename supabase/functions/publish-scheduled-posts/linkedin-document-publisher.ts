import { linkedInRestHeaders } from "../_shared/linkedin-company.ts";
import { ProviderError } from "./delivery.ts";
import { LinkedInVideoProcessingError, linkedInUploadUrl, readLinkedInMedia, type LinkedInDeliveryContext } from "./linkedin-media.ts";

const documentUrn = /^urn:li:document:[A-Za-z0-9_-]+$/;

function failed(operation: string, response: Response) {
  const retryable = response.status === 429 || response.status >= 500;
  return new ProviderError(`LinkedIn ${operation} (${response.status}).`, retryable);
}

export async function publishLinkedInDocument(
  author: string,
  token: string,
  caption: string,
  media: { url: string; alt_text?: string | null },
  context: LinkedInDeliveryContext,
  supabaseUrl: string,
) {
  const auth = linkedInRestHeaders(token);
  const headers = { ...auth, "Content-Type": "application/json" };
  let id = context.containerId ?? null;
  if (id && !documentUrn.test(id)) throw new ProviderError("Invalid LinkedIn document checkpoint.");
  if (!id) {
    const bytes = await readLinkedInMedia(media.url, supabaseUrl);
    if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
      throw new ProviderError("This carousel needs a valid PDF.");
    }
    const initialized = await fetch("https://api.linkedin.com/rest/documents?action=initializeUpload", {
      method: "POST", headers, signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
    });
    if (!initialized.ok) throw failed("could not prepare the PDF upload", initialized);
    const value = (await initialized.json().catch(() => ({}))).value;
    if (typeof value?.document !== "string" || !documentUrn.test(value.document) || typeof value.uploadUrl !== "string") {
      throw new ProviderError("LinkedIn returned invalid document upload details.");
    }
    const uploaded = await fetch(linkedInUploadUrl(value.uploadUrl), {
      method: "PUT", redirect: "error", signal: AbortSignal.timeout(120_000),
      headers: { Authorization: auth.Authorization, "Content-Type": "application/pdf" },
      body: bytes,
    });
    if (!uploaded.ok) throw failed("could not upload the PDF", uploaded);
    id = value.document as string;
    await context.checkpoint({ provider_container_id: id });
  }

  const statusResponse = await fetch(`https://api.linkedin.com/rest/documents/${encodeURIComponent(id)}`, {
    headers: auth, signal: AbortSignal.timeout(30_000),
  });
  if (!statusResponse.ok) throw failed("could not check the PDF status", statusResponse);
  const document = await statusResponse.json().catch(() => ({}));
  if (["WAITING_UPLOAD", "PROCESSING"].includes(document.status)) throw new LinkedInVideoProcessingError("PDF");
  if (document.id !== id || document.status !== "AVAILABLE") throw new ProviderError("LinkedIn could not process this carousel PDF.");

  await context.checkpoint({ submission_started_at: new Date().toISOString() });
  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST", headers, signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      author,
      commentary: caption,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      content: { media: { id, title: media.alt_text?.trim() || "LinkedIn carousel" } },
    }),
  });
  if (!response.ok) throw new ProviderError(`LinkedIn could not publish this carousel (${response.status}).`, response.status === 429, response.status < 500);
  const postId = response.headers.get("x-restli-id");
  if (!postId || !/^urn:li:(ugcPost|share):\d+$/.test(postId)) {
    throw new ProviderError("LinkedIn did not confirm the post ID. Check LinkedIn before retrying.", false, false);
  }
  return { id: postId, permalink: `https://www.linkedin.com/feed/update/${postId}/` };
}
