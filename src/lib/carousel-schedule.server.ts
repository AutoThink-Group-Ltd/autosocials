import { createHash } from "node:crypto";
import { createCarouselPdf } from "./carousel-pdf";
import { carouselOfferSample } from "./linkedin-carousel.server";
import type { getAdminClient } from "./supabase-admin.server";

type Admin = ReturnType<typeof getAdminClient>;

export async function prepareCarouselDraft(admin: Admin, input: {
  id: string;
  workspaceId: string;
  userId: string;
  postId: string;
  source: string;
  caption: string | undefined;
  revision: string | undefined;
}) {
  const { id, workspaceId, userId, postId, source, caption, revision } = input;
  if (!caption?.trim()) throw new Error("Review the LinkedIn caption before scheduling.");
  const deck = await carouselOfferSample(admin, { workspace_id: workspaceId, id });
  if (revision !== deck.revision) throw new Error("The carousel changed after review. Prepare the schedule again.");
  const path = `${workspaceId}/creation-schedules/${postId}/${revision}.pdf`;

  const draft = await admin.from("posts").upsert({
    id: postId, workspace_id: workspaceId, created_by: userId, created_via: source,
    status: "draft", caption, post_type: "carousel",
  }, { onConflict: "id", ignoreDuplicates: true });
  if (draft.error) throw new Error("Could not prepare the carousel draft. Retry this schedule request.");

  const readMedia = () => admin.from("post_media").select("id,storage_path,kind,mime,alt_text").eq("post_id", postId);
  const existing = await readMedia();
  const matches = (media: NonNullable<typeof existing.data>) => media.length === 1 &&
    media[0]?.id === postId && media[0].storage_path === path && media[0].kind === "document" &&
    media[0].mime === "application/pdf" && media[0].alt_text === deck.title;
  if (existing.error || !existing.data) throw new Error("Could not check the prepared carousel document.");
  if (matches(existing.data)) return path;
  if (existing.data.length) throw new Error("The draft carousel document changed. Prepare the schedule again.");

  const slides = await Promise.all(deck.paths.map(async slide => {
    const downloaded = await admin.storage.from("brand-assets-private").download(slide);
    if (downloaded.error || !downloaded.data || downloaded.data.size > 8 * 1024 * 1024) throw new Error("A finished carousel slide is unavailable.");
    return new Uint8Array(await downloaded.data.arrayBuffer());
  }));
  const pdf = await createCarouselPdf(slides, deck.plan.slides[0]?.design?.aspect);
  if (pdf.byteLength > 50 * 1024 * 1024) throw new Error("The carousel PDF exceeds the 50 MB publishing limit.");
  const bucket = admin.storage.from("post-media");
  const uploaded = await bucket.upload(path, new Uint8Array(pdf), { contentType: "application/pdf", upsert: false });
  if (uploaded.error) {
    const stored = await bucket.download(path);
    const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    if (stored.error || !stored.data || stored.data.size !== pdf.byteLength ||
        digest(new Uint8Array(await stored.data.arrayBuffer())) !== digest(pdf)) {
      throw new Error("Could not safely store the carousel PDF. Retry this schedule request.");
    }
  }
  const saved = await admin.from("post_media").upsert({
    id: postId, post_id: postId, kind: "document", storage_path: path, mime: "application/pdf", alt_text: deck.title,
  }, { onConflict: "id", ignoreDuplicates: true });
  const checked = await readMedia();
  if (saved.error || checked.error || !checked.data || !matches(checked.data)) throw new Error("Could not verify the carousel document. Retry this schedule request.");
  return path;
}
