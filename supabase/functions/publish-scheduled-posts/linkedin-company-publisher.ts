import { linkedInRestHeaders } from "../_shared/linkedin-company.ts";
import { ProviderError } from "./delivery.ts";
import {
  linkedInUploadUrl,
  readLinkedInMedia,
  LinkedInVideoProcessingError,
  type LinkedInDeliveryContext,
} from "./linkedin-media.ts";

type Media = { kind: "image" | "video"; url: string };

function apiError(message: string, response: Response) {
  return new ProviderError(
    `LinkedIn ${message} (${response.status}).`,
    response.status === 429 || response.status >= 500,
  );
}

async function uploadVideo(
  bytes: Uint8Array,
  value: {
    video?: string;
    uploadToken?: string;
    uploadInstructions?: {
      firstByte: number;
      lastByte: number;
      uploadUrl: string;
    }[];
  },
  headers: Record<string, string>,
) {
  const id = value.video;
  if (
    !id ||
    !/^urn:li:video:[A-Za-z0-9_-]+$/.test(id) ||
    !Array.isArray(value.uploadInstructions) ||
    !value.uploadInstructions.length
  )
    throw new ProviderError("LinkedIn returned invalid video upload details.");
  let offset = 0;
  for (const part of value.uploadInstructions) {
    if (
      part.firstByte !== offset ||
      !Number.isSafeInteger(part.lastByte) ||
      part.lastByte < offset ||
      part.lastByte >= bytes.length
    )
      throw new ProviderError("LinkedIn returned invalid video byte ranges.");
    linkedInUploadUrl(part.uploadUrl);
    offset = part.lastByte + 1;
  }
  if (offset !== bytes.length)
    throw new ProviderError("LinkedIn did not request the entire video.");
  const uploadedPartIds: string[] = [];
  for (const part of value.uploadInstructions) {
    const upload = await fetch(linkedInUploadUrl(part.uploadUrl), {
      method: "PUT",
      redirect: "error",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes.slice(part.firstByte, part.lastByte + 1),
      signal: AbortSignal.timeout(60_000),
    });
    if (!upload.ok) throw apiError("video upload failed", upload);
    const etag = upload.headers.get("etag")?.replace(/^"|"$/g, "");
    if (!etag)
      throw new ProviderError("LinkedIn did not confirm a video part.");
    uploadedPartIds.push(etag);
  }
  const finalized = await fetch(
    "https://api.linkedin.com/rest/videos?action=finalizeUpload",
    {
      method: "POST",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: id,
          uploadToken: value.uploadToken ?? "",
          uploadedPartIds,
        },
      }),
    },
  );
  if (!finalized.ok)
    throw apiError("could not finish uploading the video", finalized);
  return id;
}

export async function publishLinkedInCompany(
  organizationId: string,
  token: string,
  text: string,
  media: Media | undefined,
  context: LinkedInDeliveryContext,
  supabaseUrl: string,
) {
  const author = `urn:li:organization:${organizationId}`;
  const auth = linkedInRestHeaders(token);
  const headers = { ...auth, "Content-Type": "application/json" };
  let asset = context.containerId;
  if (
    asset &&
    (!media || !new RegExp(`^urn:li:${media.kind}:[A-Za-z0-9_-]+$`).test(asset))
  )
    throw new ProviderError(
      "LinkedIn media changed after upload. Review this post before retrying.",
    );
  if (media && !asset) {
    const endpoint = media.kind === "image" ? "images" : "videos";
    const bytes = await readLinkedInMedia(media.url, supabaseUrl);
    const setup = await fetch(
      `https://api.linkedin.com/rest/${endpoint}?action=initializeUpload`,
      {
        method: "POST",
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          initializeUploadRequest: {
            owner: author,
            ...(media.kind === "video"
              ? {
                  fileSizeBytes: bytes.length,
                  uploadCaptions: false,
                  uploadThumbnail: false,
                }
              : {}),
          },
        }),
      },
    );
    if (!setup.ok) throw apiError("could not prepare media", setup);
    const { value } = await setup.json().catch(() => ({ value: null }));
    if (!value)
      throw new ProviderError(
        "LinkedIn returned invalid media upload details.",
      );
    if (media.kind === "video") {
      asset = await uploadVideo(bytes, value, headers);
    } else {
      if (
        typeof value.image !== "string" ||
        !/^urn:li:image:[A-Za-z0-9_-]+$/.test(value.image) ||
        typeof value.uploadUrl !== "string"
      )
        throw new ProviderError(
          "LinkedIn returned invalid image upload details.",
        );
      const uploaded = await fetch(linkedInUploadUrl(value.uploadUrl), {
        method: "PUT",
        redirect: "error",
        headers: {
          Authorization: auth.Authorization,
          "Content-Type": "application/octet-stream",
        },
        body: bytes,
        signal: AbortSignal.timeout(60_000),
      });
      if (!uploaded.ok) throw apiError("image upload failed", uploaded);
      asset = value.image as string;
    }
    await context.checkpoint({ provider_container_id: asset });
  }
  if (asset && media) {
    const status = await fetch(
      `https://api.linkedin.com/rest/${media.kind}s/${encodeURIComponent(asset)}`,
      {
        headers: auth,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!status.ok) throw apiError("could not check media processing", status);
    const result = await status.json().catch(() => ({}));
    if (["PROCESSING", "WAITING_UPLOAD"].includes(result.status))
      throw new LinkedInVideoProcessingError(media.kind);
    if (result.status !== "AVAILABLE")
      throw new ProviderError("LinkedIn could not process this media.");
  }
  await context.checkpoint({ submission_started_at: new Date().toISOString() });
  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      author,
      commentary: text,
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      ...(asset ? { content: { media: { id: asset } } } : {}),
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!response.ok)
    throw new ProviderError(
      `LinkedIn could not publish this Company Page post (${response.status}).`,
      response.status === 429,
      response.status < 500,
    );
  const id = response.headers.get("x-restli-id");
  if (!id || !/^urn:li:(ugcPost|share):\d+$/.test(id))
    throw new ProviderError(
      "LinkedIn did not confirm the post ID. Check LinkedIn before retrying.",
      false,
      false,
    );
  return { id, permalink: `https://www.linkedin.com/feed/update/${id}/` };
}
