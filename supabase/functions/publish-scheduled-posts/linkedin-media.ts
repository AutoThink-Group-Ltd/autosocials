import { ProviderError } from "./delivery.ts";

export type LinkedInDeliveryContext = {
  containerId?: string | null;
  checkpoint: (patch: Record<string, unknown>) => Promise<void>;
};
export class LinkedInVideoProcessingError extends ProviderError {
  constructor(kind = "video") {
    super(
      `LinkedIn is processing this ${kind}. The post will retry shortly.`,
      true,
    );
  }
}

export async function readLinkedInMedia(url: string, supabaseUrl: string) {
  const sourceUrl = new URL(url);
  if (
    sourceUrl.origin !== new URL(supabaseUrl).origin ||
    !sourceUrl.pathname.startsWith("/storage/v1/object/sign/post-media/")
  )
    throw new ProviderError("LinkedIn accepts only private post media.");
  const source = await fetch(sourceUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  const length = Number(source.headers.get("content-length"));
  if (
    !source.ok ||
    !source.body ||
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > 50 * 1024 * 1024
  ) {
    await source.body?.cancel();
    throw new ProviderError(
      "LinkedIn media must be available and no larger than 50 MB.",
    );
  }
  const reader = source.body.getReader();
  const bytes = new Uint8Array(length);
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.length > length) {
      await reader.cancel();
      throw new ProviderError(
        "Private media storage returned an invalid file size.",
      );
    }
    bytes.set(value, offset);
    offset += value.length;
  }
  if (offset !== length)
    throw new ProviderError(
      "Private media storage returned an incomplete file.",
    );
  return bytes;
}

export function linkedInUploadUrl(raw: string) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !(url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com"))
  )
    throw new ProviderError(
      "LinkedIn returned an untrusted media upload address.",
    );
  return url;
}
