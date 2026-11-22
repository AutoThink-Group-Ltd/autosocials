import { createHash, randomUUID } from "node:crypto";
import jpeg from "jpeg-js";
import { z } from "zod";
import { carouselInProduction, carouselPlanSchema, type CarouselPlan } from "./linkedin-carousel";
import { decodeTileImage } from "./social-tile-storage.server";
import { getAdminClient } from "./supabase-admin.server";
import { fetchAll } from "./fetch-all";

type Admin = ReturnType<typeof getAdminClient>;
type Identity = { workspace_id: string; id: string };
const source = "linkedin_carousel";
const manifestSchema = z.object({
  version: z.string().uuid(),
  plan: carouselPlanSchema,
  images: z.record(z.string().uuid(), z.string()),
}).strict();
type Manifest = z.infer<typeof manifestSchema>;

async function member(admin: Admin, userId: string, workspaceId: string) {
  const { data, error } = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: workspaceId });
  if (error || !data) throw new Error("Workspace access denied.");
}

async function rowFor(admin: Admin, input: Identity) {
  const { data, error } = await admin.from("brand_files")
    .select("id,workspace_id,source,storage_path,updated_at")
    .eq("id", input.id).eq("workspace_id", input.workspace_id).eq("source", source).maybeSingle();
  if (error || !data) throw new Error("Carousel not found in this workspace.");
  return data;
}

async function readManifest(admin: Admin, row: Awaited<ReturnType<typeof rowFor>>, input: Identity): Promise<Manifest> {
  try {
    const prefix = `${input.workspace_id}/linkedin-carousels/${input.id}/`;
    if (!row.storage_path.startsWith(`${prefix}manifest-`) || !/^[-a-zA-Z0-9/]+\.json$/.test(row.storage_path)) throw new Error("Invalid manifest path");
    const downloaded = await admin.storage.from("brand-assets-private").download(row.storage_path);
    // Six slides can each carry four small, self-contained logo images plus source metadata.
    if (downloaded.error || !downloaded.data || downloaded.data.size > 1_100_000) throw new Error("Missing manifest");
    const manifest = manifestSchema.parse(JSON.parse(await downloaded.data.text()));
    for (const [slideId, path] of Object.entries(manifest.images)) {
      if (!manifest.plan.slides.some((slide) => slide.id === slideId) || !path.startsWith(`${prefix}${slideId}-`) || !/^[-a-zA-Z0-9/]+\.jpg$/.test(path)) throw new Error("Invalid path");
    }
    return manifest;
  } catch {
    throw new Error("The saved carousel could not be read.");
  }
}

async function uploadManifest(admin: Admin, input: Identity, manifest: Manifest) {
  const bytes = Buffer.from(JSON.stringify(manifest), "utf8");
  const path = `${input.workspace_id}/linkedin-carousels/${input.id}/manifest-${randomUUID()}.json`;
  const result = await admin.storage.from("brand-assets-private").upload(path, bytes, { contentType: "application/json", upsert: false });
  if (result.error) throw new Error("Could not save the carousel. Please try again.");
  return { path, bytes };
}

async function present(admin: Admin, input: Identity, manifest: Manifest) {
  const slides = await Promise.all(manifest.plan.slides.filter((slide) => manifest.images[slide.id]).map(async (slide) => {
    const path = manifest.images[slide.id]!;
    const { data, error } = await admin.storage.from("brand-assets-private").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw new Error("A saved slide is unavailable. Please try again.");
    return { id: slide.id, url: data.signedUrl };
  }));
  return { id: input.id, plan: manifest.plan, version: manifest.version, slides };
}

async function updateManifest(admin: Admin, input: Identity, row: Awaited<ReturnType<typeof rowFor>>, manifest: Manifest) {
  manifest.version = randomUUID();
  const uploaded = await uploadManifest(admin, input, manifest);
  const updatedAt = new Date().toISOString();
  const { data, error } = await admin.from("brand_files").update({
    name: `${manifest.plan.title}.json`, storage_path: uploaded.path, size_bytes: uploaded.bytes.length,
    updated_at: updatedAt,
  }).eq("id", input.id).eq("workspace_id", input.workspace_id).eq("source", source).eq("storage_path", row.storage_path).select("updated_at").maybeSingle();
  if (error || !data) {
    if (!error) await admin.storage.from("brand-assets-private").remove([uploaded.path]);
    throw new Error("This carousel changed in another session. Reopen it and try again.");
  }
  if (row.storage_path.startsWith(`${input.workspace_id}/linkedin-carousels/${input.id}/manifest-`) && row.storage_path.endsWith(".json")) {
    await admin.storage.from("brand-assets-private").remove([row.storage_path]);
  }
  return present(admin, input, manifest);
}

export async function saveCarouselForUser(userId: string, input: Identity & { plan: CarouselPlan; version?: string | undefined }) {
  const admin = getAdminClient();
  await member(admin, userId, input.workspace_id);
  if (input.version) {
    const row = await rowFor(admin, input);
    const previous = await readManifest(admin, row, input);
    if (previous.version !== input.version) throw new Error("This carousel changed in another session. Reopen it and try again.");
    const sameStyle = previous.plan.brand === input.plan.brand
      && previous.plan.brandPrimary === input.plan.brandPrimary
      && previous.plan.brandAccent === input.plan.brandAccent
      && previous.plan.slides.length === input.plan.slides.length;
    const images: Record<string, string> = {};
    if (sameStyle) {
      input.plan.slides.forEach((slide, index) => {
        const old = previous.plan.slides[index];
        if (!old || !previous.images[slide.id]) return;
        const { artwork: nextArt, ...nextCopy } = slide;
        const { artwork: oldArt, ...oldCopy } = old;
        // A newly reserved request does not replace the last accepted slide until
        // its checked artwork is available. Copy or design changes still invalidate it.
        const sameArtwork = nextArt?.fileId === oldArt?.fileId || (!!nextArt && !nextArt.fileId);
        if (JSON.stringify(nextCopy) === JSON.stringify(oldCopy) && sameArtwork) images[slide.id] = previous.images[slide.id]!;
      });
    }
    return updateManifest(admin, input, row, { version: previous.version, plan: input.plan, images });
  }
  const manifest: Manifest = { version: randomUUID(), plan: input.plan, images: {} };
  const uploaded = await uploadManifest(admin, input, manifest);
  const { data, error } = await admin.from("brand_files").insert({
    id: input.id, workspace_id: input.workspace_id, created_by: userId, source,
    name: `${input.plan.title}.json`, kind: "doc", mime: "application/json",
    storage_path: uploaded.path, size_bytes: uploaded.bytes.length, ai_label: "LinkedIn carousel",
  }).select("updated_at").single();
  if (error || !data) {
    throw new Error("Could not create the carousel. Reopen it if it was already saved.");
  }
  return present(admin, input, manifest);
}

export async function saveCarouselSlideForUser(userId: string, input: Identity & { slide_id: string; version: string; image_base64: string }) {
  const admin = getAdminClient();
  await member(admin, userId, input.workspace_id);
  const row = await rowFor(admin, input);
  const manifest = await readManifest(admin, row, input);
  if (!manifest.plan.slides.some((slide) => slide.id === input.slide_id)) throw new Error("Slide not found in this carousel.");
  const bytes = decodeTileImage(input.image_base64, "image/jpeg");
  const dimensions = jpeg.decode(bytes, { useTArray: true, tolerantDecoding: false, maxResolutionInMP: 1.25, maxMemoryUsageInMB: 64 });
  const expectedHeight = manifest.plan.slides[0]?.design?.aspect === "portrait" ? 1250 : 1000;
  if (dimensions.width !== 1000 || dimensions.height !== expectedHeight) throw new Error("The slide dimensions do not match this carousel format.");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const path = `${input.workspace_id}/linkedin-carousels/${input.id}/${input.slide_id}-${digest}.jpg`;
  if (manifest.images[input.slide_id] === path) return present(admin, input, manifest);
  if (manifest.version !== input.version) throw new Error("This carousel changed in another session. Reopen it and try again.");
  const store = admin.storage.from("brand-assets-private");
  const uploaded = await store.upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (uploaded.error) {
    const existing = await store.download(path);
    if (existing.error || !existing.data || createHash("sha256").update(Buffer.from(await existing.data.arrayBuffer())).digest("hex") !== digest) throw new Error("Could not store this slide. Please try again.");
  }
  manifest.images[input.slide_id] = path;
  return updateManifest(admin, input, row, manifest);
}

export async function getCarouselForUser(userId: string, input: Identity) {
  const admin = getAdminClient();
  await member(admin, userId, input.workspace_id);
  const row = await rowFor(admin, input);
  return present(admin, input, await readManifest(admin, row, input));
}

/** Resolve the finished slide pixels in the saved slide order. */
export async function carouselOfferSample(admin: Admin, input: Identity) {
  const row = await rowFor(admin, input);
  const { plan, images } = await readManifest(admin, row, input);
  const paths = plan.slides.map((slide) => images[slide.id]);
  if (!paths.length || paths.some((path) => !path)) throw new Error("Finish all carousel slides before sharing.");
  return { title: plan.title, paths: paths as string[], plan, revision: createHash("sha256").update(row.storage_path).digest("hex") };
}

export async function listCarouselsForUser(userId: string, workspaceId: string) {
  const admin = getAdminClient();
  await member(admin, userId, workspaceId);
  const rows = await fetchAll((from, to) => admin.from("brand_files").select("id,name,workspace_id,source,storage_path,updated_at")
    .eq("workspace_id", workspaceId).eq("source", source).order("updated_at", { ascending: false }).order("id", { ascending: false }).range(from, to));
  const summaries: Array<{ id: string; title: string; updated_at: string; complete: boolean; production?: true; unreadable: boolean; coverUrl: string | null }> = [];
  // Limit concurrent storage downloads. An invalid manifest must not hide other content.
  for (let offset = 0; offset < rows.length; offset += 10) {
    const batch = await Promise.all(rows.slice(offset, offset + 10).map(async row => {
      const base = { id: row.id, title: row.name.replace(/\.json$/, ""), updated_at: row.updated_at };
      try {
        const manifest = await readManifest(admin, row, { workspace_id: workspaceId, id: row.id });
        const renderedCount = manifest.plan.slides.filter(slide => !!manifest.images[slide.id]).length;
        const complete = renderedCount === manifest.plan.slides.length;
        const production = carouselInProduction(manifest.plan, renderedCount);
        const firstId = manifest.plan.slides[0]?.id;
        const path = firstId ? manifest.images[firstId] : undefined;
        const cover = path ? await admin.storage.from("brand-assets-private").createSignedUrl(path, 3600) : null;
        return { ...base, complete, ...(production ? { production: true as const } : {}), unreadable: false, coverUrl: cover?.data?.signedUrl ?? null };
      } catch {
        return { ...base, complete: false, unreadable: true, coverUrl: null };
      }
    }));
    summaries.push(...batch);
  }
  return summaries;
}
