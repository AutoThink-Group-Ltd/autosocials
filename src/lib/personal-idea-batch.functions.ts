import { campaignProductionPosts } from "./content-campaign-production";
import { videoProductionOutcome } from "./video-production-outcome";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { MAX_ASSETS_PER_BATCH } from "./content-rules";
import { tilePlanSchema } from "./social-tiles";
import { campaignTile } from "./content-campaign";

const idea = z.object({
  title: z.string().trim().min(1).max(100),
  angle: z.string().trim().min(1).max(240),
  format: z.enum(["video", "tiles", "written"]),
}).strict();
const items = z.array(idea).min(1).max(20).refine(
  (values) => new Set(values.map((value) => value.title.toLocaleLowerCase())).size === values.length,
  "Choose each idea only once.",
);
const saveInput = z.object({ workspace_id: z.string().uuid(), request_id: z.string().uuid(), items }).strict();
const getInput = z.object({ workspace_id: z.string().uuid(), batch_id: z.string().uuid() }).strict();
const record = z.object({ created_by: z.string().uuid(), items }).strict();

const context = createServerOnlyFn(async (workspaceId: string) => {
  const { requireUser, getAdminClient } = await import("./supabase-admin.server");
  const user = await requireUser();
  const admin = getAdminClient();
  const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: workspaceId });
  if (access.error || !access.data) throw new Error("Workspace access required.");
  return { user, admin };
});

const readBatch = createServerOnlyFn(async (data: z.infer<typeof getInput>) => {
  const { admin } = await context(data.workspace_id);
  const row = await (admin as any).from("brand_work_operations").select("result").eq("workspace_id", data.workspace_id).eq("kind", "personal-idea-batch").eq("signature", data.batch_id).eq("status", "complete").maybeSingle();
  if (row.error || !row.data) throw new Error("This content plan could not be found.");
  const parsed = record.safeParse(row.data.result);
  if (!parsed.success) throw new Error("This content plan is unavailable.");
  return { batchId: data.batch_id, items: parsed.data.items };
});

const saveBatch = createServerOnlyFn(async (data: z.infer<typeof saveInput>) => {
  const { user, admin } = await context(data.workspace_id);
  const result = { created_by: user.id, items: data.items };
  const key = { workspace_id: data.workspace_id, kind: "personal-idea-batch", signature: data.request_id };
  const inserted = await (admin as any).from("brand_work_operations").insert({ ...key, token: crypto.randomUUID(), status: "complete", result }).select("result").maybeSingle();
  if (!inserted.error && inserted.data) return { batchId: data.request_id, items: data.items };
  // A retry must never replace a different saved selection.
  if (inserted.error?.code !== "23505") throw new Error("Could not save your selected ideas.");
  const existing = await (admin as any).from("brand_work_operations").select("result,status,token").match(key).maybeSingle();
  const parsed = record.safeParse(existing.data?.result);
  if (existing.error || existing.data?.status !== "complete" || !parsed.success || JSON.stringify(parsed.data) !== JSON.stringify(result)) throw new Error("This content plan has changed. Start a new plan.");
  return { batchId: data.request_id, items: parsed.data.items };
});

export const savePersonalIdeaBatch = createServerFn({ method: "POST" }).inputValidator((value: unknown) => saveInput.parse(value)).handler(({ data }) => saveBatch(data));
export const getPersonalIdeaBatch = createServerFn({ method: "POST" }).inputValidator((value: unknown) => getInput.parse(value)).handler(({ data }) => readBatch(data));

// Fresh deterministic video batches make retries safe even if the browser
// disconnects after a batch was inserted or its planning job was queued.
const prepareVideos = createServerOnlyFn(async (data: z.infer<typeof getInput>) => {
  const { user, admin } = await context(data.workspace_id);
  const selected = await readBatch(data);
  const videos = selected.items.filter((item) => item.format === "video");
  if (!videos.length) return { batches: [] };
  const { createHash } = await import("node:crypto");
  const stableId = (label: string) => {
    const hex = createHash("sha256").update(`personal-idea-video:${data.workspace_id}:${data.batch_id}:${label}`).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
  const { enqueueNarrativePlan, latestNarrativePlan } = await import("./narrative-planning.server");
  const batches = [];
  for (let offset = 0; offset < videos.length; offset += MAX_ASSETS_PER_BATCH) {
    const batchId = stableId(`batch:${offset}`);
    const selectedVideos = videos.slice(offset, offset + MAX_ASSETS_PER_BATCH);
    const narratives = selectedVideos.map((item, index) => ({ id: stableId(`narrative:${offset + index}`), title: item.title, message: item.angle, why: item.angle, selected: true, custom: true, libraryStatus: "available" as const }));
    const created = await admin.from("creative_batches").insert({ id: batchId, workspace_id: data.workspace_id, created_by: user.id, title: "Videos from content ideas", goal: "", audience: "", offer: "", destination: "", days: 3, starts_on: new Date(Date.now() + 86400000).toISOString().slice(0, 10), stage: "narratives", narratives: narratives as never }).select("id").maybeSingle();
    if (created.error && created.error.code !== "23505") throw new Error("Could not save your video ideas.");
    if (!created.data) {
      const existing = await admin.from("creative_batches").select("workspace_id,created_by,narratives").eq("id", batchId).maybeSingle();
      const saved = existing.data?.narratives;
      const unchanged = Array.isArray(saved) && saved.length === narratives.length && saved.every((raw, index) => { const value = raw as Record<string, unknown>; const expected = narratives[index]!; return value.id === expected.id && value.title === expected.title && value.message === expected.message && value.why === expected.why && value.selected === true && value.custom === true && value.libraryStatus === "available"; });
      if (existing.error || !existing.data || existing.data.workspace_id !== data.workspace_id || existing.data.created_by !== user.id || !unchanged) throw new Error("Your saved video ideas changed. Open the existing plan before continuing.");
    }
    const existingJob = await latestNarrativePlan(admin, batchId);
    const job = existingJob ?? await enqueueNarrativePlan(admin, { workspaceId: data.workspace_id, userId: user.id, batchId, input: { batch_id: batchId, count: selectedVideos.length, picked: narratives }, retry: false });
    batches.push({ batchId, titles: selectedVideos.map((item) => item.title), job });
  }
  const { kickCreativeJobs } = await import("./creative.functions");
  await kickCreativeJobs(admin);
  return { batches };
});

export const preparePersonalIdeaVideos = createServerFn({ method: "POST" }).inputValidator((value: unknown) => getInput.parse(value)).handler(({ data }) => prepareVideos(data));

const tileInput = tilePlanSchema.shape.tiles.element.extend({ direction: z.string().trim().min(1).max(220) }).strict();
const tileQuoteInput = getInput.extend({ index: z.number().int().min(0).max(19), tile: tileInput }).strict();
const quotedTile = z.object({ batch_id: z.string().uuid(), index: z.number().int().min(0).max(19), request_id: z.string().uuid(), tile: tileInput, quote: z.object({ provider: z.enum(["openai", "ideogram", "recraft"]), credits: z.number().int().nonnegative(), rateId: z.string().uuid() }).strict() }).strict();
const tileRequestInput = getInput.extend({ request_id: z.string().uuid() }).strict();

// A tile's reviewed copy, provider and credit quote are bound to one stable
// request before production. Retrying cannot silently submit different copy.
const quoteTile = createServerOnlyFn(async (data: z.infer<typeof tileQuoteInput>) => {
  const { admin } = await context(data.workspace_id);
  const batch = await readBatch(data);
  if (batch.items[data.index]?.format !== "tiles") throw new Error("This idea is not a social tile.");
  const { createHash } = await import("node:crypto");
  const hex = createHash("sha256").update(JSON.stringify([data.workspace_id, data.batch_id, data.index])).digest("hex");
  const requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const key = { workspace_id: data.workspace_id, kind: "personal-idea-tile-quote", signature: requestId };
  const existing = await (admin as any).from("brand_work_operations").select("result,status,token").match(key).maybeSingle();
  if (existing.error) throw new Error("Could not read the saved tile quote.");
  if (existing.data) {
    const saved = quotedTile.safeParse(existing.data.result);
    if (existing.data.status !== "complete" || !saved.success) throw new Error("The saved tile quote needs attention.");
    if (JSON.stringify(saved.data.tile) !== JSON.stringify(data.tile)) throw new Error("This tile already has a saved quote. Start a new content plan to change its design.");
    const current = await (await import("./sam-tile-design.server")).quoteSamTile(data.tile);
    if (JSON.stringify(saved.data.quote) === JSON.stringify(current)) return saved.data;
    const { user } = await context(data.workspace_id);
    const reservation = await (admin as any).from("brand_work_operations").select("status,result").eq("workspace_id", data.workspace_id).eq("kind", "personal-idea-production").eq("signature", data.batch_id).maybeSingle();
    if (reservation.error || (reservation.data && !(reservation.data.status === "complete" && reservation.data.result?.stage === "quote_abandoned" && reservation.data.result?.actor === user.id))) throw new Error("This content plan already has a production request; check its status before changing the quote.");
    const status = await (await import("./postcard-tiles.server")).checkPostcardTileStatus(user.id, data.workspace_id, requestId);
    if (status.status !== "not_found") throw new Error("This design request was already submitted; check its status before changing the quote.");
    const refreshed = quotedTile.parse({ ...saved.data, quote: current });
    const update = await (admin as any).from("brand_work_operations").update({ token: crypto.randomUUID(), result: refreshed, updated_at: new Date().toISOString() }).match(key).eq("status", "complete").eq("token", existing.data.token).select("result").maybeSingle();
    if (update.error || !update.data) throw new Error("This quote changed. Review it again.");
    return refreshed;
  }
  const quote = await (await import("./sam-tile-design.server")).quoteSamTile(data.tile);
  const snapshot = quotedTile.parse({ batch_id: data.batch_id, index: data.index, request_id: requestId, tile: data.tile, quote });
  const inserted = await (admin as any).from("brand_work_operations").insert({ ...key, token: crypto.randomUUID(), status: "complete", result: snapshot }).select("result").maybeSingle();
  if (!inserted.error && inserted.data) return snapshot;
  if (inserted.error?.code !== "23505") throw new Error("Could not save the tile quote.");
  const raced = await (admin as any).from("brand_work_operations").select("result,status").match(key).maybeSingle();
  const saved = quotedTile.safeParse(raced.data?.result);
  if (raced.error || raced.data?.status !== "complete" || !saved.success) throw new Error("Could not restore the tile quote.");
  if (JSON.stringify(saved.data.tile) !== JSON.stringify(data.tile)) throw new Error("This tile already has a saved quote. Start a new content plan to change its design.");
  if (JSON.stringify(saved.data.quote) !== JSON.stringify(quote)) throw new Error("This quote changed. Review it again.");
  return saved.data;
});

const tileSnapshot = createServerOnlyFn(async (data: z.infer<typeof tileRequestInput>) => {
  const { user, admin } = await context(data.workspace_id);
  const batch = await readBatch(data);
  const row = await (admin as any).from("brand_work_operations").select("result,status").eq("workspace_id", data.workspace_id).eq("kind", "personal-idea-tile-quote").eq("signature", data.request_id).maybeSingle();
  const parsed = quotedTile.safeParse(row.data?.result);
  if (row.error || row.data?.status !== "complete" || !parsed.success || parsed.data.batch_id !== data.batch_id || parsed.data.request_id !== data.request_id || batch.items[parsed.data.index]?.format !== "tiles") throw new Error("This tile quote is unavailable. Review the idea again.");
  return { user, snapshot: parsed.data };
});

const getTileStatus = createServerOnlyFn(async (data: z.infer<typeof tileRequestInput>, includeImage = true) => {
  const { user } = await tileSnapshot(data);
  return (await import("./postcard-tiles.server")).checkPostcardTileStatus(user.id, data.workspace_id, data.request_id, includeImage);
});
const makeTile = createServerOnlyFn(async (data: z.infer<typeof tileRequestInput>, approved?: z.infer<typeof quotedTile>, retrySafe = false) => {
  const { user, snapshot } = await tileSnapshot(data);
  if (approved && JSON.stringify(snapshot) !== JSON.stringify(approved)) throw new Error("The tile quote changed. Review the updated quote before creating content.");
  const status = await (await import("./postcard-tiles.server")).checkPostcardTileStatus(user.id, data.workspace_id, data.request_id);
  // Any recorded operation, including an uncertain outcome, must be reconciled
  // rather than automatically submitted a second time.
  if (status.status !== "not_found" && !retrySafe) return status;
  return (await import("./sam-tile-design.server")).createSamTile(user.id, { workspace_id: data.workspace_id, request_id: data.request_id, ...snapshot.tile, expected_provider: snapshot.quote.provider, expected_credits: snapshot.quote.credits, expected_rate_id: snapshot.quote.rateId, retry_safe: retrySafe });
});

export const quotePersonalIdeaTile = createServerFn({ method: "POST" }).inputValidator((value: unknown) => tileQuoteInput.parse(value)).handler(({ data }) => quoteTile(data));
export const getPersonalIdeaTileStatus = createServerFn({ method: "POST" }).inputValidator((value: unknown) => tileRequestInput.parse(value)).handler(({ data }) => getTileStatus(data));

const writtenInput = getInput.extend({ index: z.number().int().min(0).max(19), text: z.string().trim().min(1).max(3000), confirmed: z.literal(true) }).strict();
const saveWritten = createServerOnlyFn(async (data: z.infer<typeof writtenInput>) => {
  const { user, admin } = await context(data.workspace_id);
  const batch = await readBatch(data);
  if (batch.items[data.index]?.format !== "written") throw new Error("This idea is not a written post.");
  const { createHash } = await import("node:crypto");
  const hex = createHash("sha256").update(`personal-idea-written:${data.workspace_id}:${data.batch_id}:${data.index}`).digest("hex");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const source = `personal-idea-batch:${data.batch_id}:${data.index}`;
  const created = await admin.from("posts").insert({ id, workspace_id: data.workspace_id, created_by: user.id, caption: data.text, status: "draft", created_via: source }).select("id").maybeSingle();
  if (!created.error && created.data) return { postId: id, reused: false };
  if (created.error?.code !== "23505") throw new Error("Could not save this written draft.");
  const existing = await admin.from("posts").select("id,workspace_id,created_by,created_via").eq("id", id).maybeSingle();
  if (existing.error || !existing.data || existing.data.workspace_id !== data.workspace_id || existing.data.created_by !== user.id || existing.data.created_via !== source) throw new Error("The saved written draft could not be verified.");
  // Never overwrite subsequent edits to a draft on retry.
  return { postId: id, reused: true };
});
export const savePersonalIdeaWrittenDraft = createServerFn({ method: "POST" }).inputValidator((value: unknown) => writtenInput.parse(value)).handler(({ data }) => saveWritten(data));

const preparedOutput = z.union([z.object({ text: z.string().trim().min(1).max(3000) }).strict(), z.object({ plan: tilePlanSchema }).strict()]);
const preparedRecord = z.object({ batch_id: z.string().uuid(), index: z.number().int().min(0).max(19), output: preparedOutput, locked: z.boolean() }).strict();
const preparedInput = getInput.extend({ index: z.number().int().min(0).max(19), output: preparedOutput, expected_revision: z.string().uuid().nullable() }).strict();

const savePrepared = createServerOnlyFn(async (data: z.infer<typeof preparedInput>) => {
  const { admin } = await context(data.workspace_id);
  const batch = await readBatch(data);
  const item = batch.items[data.index];
  if (!item || (item.format === "written" && !("text" in data.output)) || (item.format === "tiles" && !("plan" in data.output)) || item.format === "video") throw new Error("This prepared result does not match the selected idea.");
  const key = { workspace_id: data.workspace_id, kind: "personal-idea-prepared", signature: `${data.batch_id}:${data.index}` };
  const current = await (admin as any).from("brand_work_operations").select("result,status,token").match(key).maybeSingle();
  if (current.error) throw new Error("Could not load the saved draft.");
  const output = preparedOutput.parse(data.output);
  if (current.data) {
    const parsed = preparedRecord.safeParse(current.data.result);
    if (current.data.status !== "complete" || !parsed.success || parsed.data.batch_id !== data.batch_id || parsed.data.index !== data.index) throw new Error("The saved draft is unavailable.");
    if (JSON.stringify(parsed.data.output) === JSON.stringify(output)) return { index: data.index, ...parsed.data.output, revision: current.data.token as string, locked: parsed.data.locked };
    if (parsed.data.locked) throw new Error("This draft has already been quoted and can no longer be changed in this plan.");
    if (!data.expected_revision || current.data.token !== data.expected_revision) throw new Error("This draft changed in another session. Reload it before saving.");
    const token = crypto.randomUUID();
    const updated = await (admin as any).from("brand_work_operations").update({ token, result: { batch_id: data.batch_id, index: data.index, output, locked: false }, updated_at: new Date().toISOString() }).match(key).eq("status", "complete").eq("token", data.expected_revision).select("token").maybeSingle();
    if (updated.error || !updated.data) throw new Error("This draft changed in another session. Reload it before saving.");
    return { index: data.index, ...output, revision: token, locked: false };
  }
  if (data.expected_revision) throw new Error("This draft changed in another session. Reload it before saving.");
  const token = crypto.randomUUID();
  const inserted = await (admin as any).from("brand_work_operations").insert({ ...key, token, status: "complete", result: { batch_id: data.batch_id, index: data.index, output, locked: false } }).select("token").maybeSingle();
  if (inserted.error || !inserted.data) throw new Error(inserted.error?.code === "23505" ? "This draft changed in another session. Reload it before saving." : "Could not save this draft.");
  return { index: data.index, ...output, revision: token, locked: false };
});

const getPrepared = createServerOnlyFn(async (data: z.infer<typeof getInput>) => {
  const { admin } = await context(data.workspace_id);
  const batch = await readBatch(data);
  const keys = batch.items.map((_, index) => `${data.batch_id}:${index}`);
  const rows = await (admin as any).from("brand_work_operations").select("result,status,token").eq("workspace_id", data.workspace_id).eq("kind", "personal-idea-prepared").in("signature", keys);
  if (rows.error) throw new Error("Could not load your prepared drafts.");
  return { items: (rows.data ?? []).flatMap((row: { result: unknown; status: string; token: string }) => { const parsed = preparedRecord.safeParse(row.result); if (row.status !== "complete" || !parsed.success || parsed.data.batch_id !== data.batch_id) return []; return [{ index: parsed.data.index, ...parsed.data.output, revision: row.token, locked: parsed.data.locked }]; }) };
});

const lockPrepared = createServerOnlyFn(async (data: z.infer<typeof getInput>, index: number, expected: z.infer<typeof preparedOutput>) => {
  const { admin } = await context(data.workspace_id);
  const key = { workspace_id: data.workspace_id, kind: "personal-idea-prepared", signature: `${data.batch_id}:${index}` };
  const row = await (admin as any).from("brand_work_operations").select("result,status,token").match(key).maybeSingle();
  const saved = preparedRecord.safeParse(row.data?.result);
  if (row.error || row.data?.status !== "complete" || !saved.success || saved.data.batch_id !== data.batch_id || saved.data.index !== index || JSON.stringify(saved.data.output) !== JSON.stringify(expected)) throw new Error("A draft changed. Reload and review it before creating content.");
  if (saved.data.locked) return;
  const locked = await (admin as any).from("brand_work_operations").update({ token: crypto.randomUUID(), result: { ...saved.data, locked: true }, updated_at: new Date().toISOString() }).match(key).eq("status", "complete").eq("token", row.data.token).select("token").maybeSingle();
  if (locked.error || !locked.data) throw new Error("A draft changed. Reload and review it before creating content.");
});

export const savePersonalIdeaPrepared = createServerFn({ method: "POST" }).inputValidator((value: unknown) => preparedInput.parse(value)).handler(({ data }) => savePrepared(data));
export const getPersonalIdeaPrepared = createServerFn({ method: "POST" }).inputValidator((value: unknown) => getInput.parse(value)).handler(({ data }) => getPrepared(data));

const approvalInput = getInput.extend({ tiles: z.array(z.object({ index: z.number().int().min(0).max(19), tile: tileInput }).strict()).max(20), written: z.array(z.object({ index: z.number().int().min(0).max(19), text: z.string().trim().min(1).max(3000) }).strict()).max(20), videos: z.array(z.object({ id: z.string().uuid(), version: z.number().int() }).strict()).max(20) }).strict();
const creditLine = z.object({ step_key: z.string(), capability_id: z.string(), duration_s: z.number().int().nonnegative(), rate_id: z.string().uuid(), credits: z.number().int().positive() }).strict();
const productionSnapshot = z.object({ actor: z.string().uuid(), batch_id: z.string().uuid(), tiles: z.array(quotedTile), written: z.array(z.object({ index: z.number().int(), text: z.string(), title: z.string() }).strict()), videos: z.array(z.object({ batchId: z.string().uuid(), id: z.string().uuid(), title: z.string(), version: z.number().int(), credits: z.number().int().positive(), lines: z.array(creditLine).min(1) }).strict()) }).strict();
const productionRequest = getInput.extend({ quote_id: z.string().uuid() }).strict();
type ProductionResult = { kind: "written" | "tile" | "video"; id: string; status: string; message?: string; previewUrl?: string; downloadUrl?: string; text?: string; artworkFileId?: string };

const quoteProduction = createServerOnlyFn(async (data: z.infer<typeof approvalInput>) => {
  const { user, admin } = await context(data.workspace_id);
  const batch = await readBatch(data);
  const expectedTiles = batch.items.flatMap((item, index) => item.format === "tiles" ? [index] : []);
  const expectedWritten = batch.items.flatMap((item, index) => item.format === "written" ? [index] : []);
  const exact = (expected: number[], received: number[]) => expected.length === received.length && new Set(received).size === received.length && expected.every((index) => received.includes(index));
  if (!exact(expectedTiles, data.tiles.map((item) => item.index)) || !exact(expectedWritten, data.written.map((item) => item.index))) throw new Error("Review every selected idea before creating content.");
  const saved = await getPrepared(data);
  const reviewedTilePlans: Array<{ index: number; plan: z.infer<typeof tilePlanSchema> }> = [];
  for (const item of data.tiles) {
    const found = saved.items.find((value: { index: number }) => value.index === item.index);
    const plan = tilePlanSchema.safeParse(found && "plan" in found ? found.plan : undefined);
    if (!plan.success) throw new Error("A tile draft changed. Reload and review it before creating content.");
    const first = plan.data.tiles[0];
    if (!first || JSON.stringify(first) !== JSON.stringify(item.tile)) throw new Error("A tile draft changed. Reload and review it before creating content.");
    reviewedTilePlans.push({ index: item.index, plan: plan.data });
  }
  for (const item of data.written) {
    const found = saved.items.find((value: { index: number }) => value.index === item.index);
    if (!found || !("text" in found) || found.text !== item.text) throw new Error("A written draft changed. Reload and review it before creating content.");
  }
  const written = data.written.map(({ index, text }) => ({ index, text, title: batch.items[index]!.title }));
  const preparedVideos = await prepareVideos(data);
  const { activePlanningVariants } = await import("./production-plan");
  const { quoteAssetProduction } = await import("./production.server");
  const { quoteProductionCredits } = await import("./content-credits.server");
  const videos: z.infer<typeof productionSnapshot>["videos"] = [];
  for (const group of preparedVideos.batches) {
    if (group.job?.status !== "completed") throw new Error("Wait for every video storyboard to finish before reviewing production.");
    const current = await admin.from("creative_batches").select("active_plan_id").eq("workspace_id", data.workspace_id).eq("id", group.batchId).maybeSingle();
    const rows = await admin.from("creative_variants").select("*").eq("workspace_id", data.workspace_id).eq("batch_id", group.batchId).order("position");
    if (current.error || !current.data?.active_plan_id || rows.error) throw new Error("Could not load the prepared video storyboards.");
    const variants = activePlanningVariants(rows.data ?? [], current.data.active_plan_id);
    if (variants.length !== group.titles.length) throw new Error("The prepared video storyboards are incomplete.");
    for (const variant of variants) {
      const readiness = await quoteAssetProduction(admin, variant);
      if (!readiness.ready) throw new Error(readiness.message || "A video is not ready for production.");
      const price = await quoteProductionCredits(admin as unknown as import("@supabase/supabase-js").SupabaseClient, variant.production_plan, variant.duration_s);
      videos.push({ batchId: group.batchId, id: variant.id, title: variant.hook || variant.narrative || "Video", version: variant.version, credits: price.credits, lines: price.lines });
    }
  }
  if (data.videos.length !== videos.length || new Set(data.videos.map(item => item.id)).size !== data.videos.length || videos.some(video => !data.videos.some(reviewed => reviewed.id === video.id && reviewed.version === video.version))) throw new Error("A video storyboard changed. Review the latest plans before creating content.");
  // Price and readiness checks run before locking any draft. Locking is a
  // compare-and-swap against the exact content the user reviewed.
  const tiles = await Promise.all(data.tiles.map(({ index, tile }) => quoteTile({ workspace_id: data.workspace_id, batch_id: data.batch_id, index, tile })));
  for (const item of reviewedTilePlans) await lockPrepared(data, item.index, { plan: item.plan });
  for (const item of data.written) await lockPrepared(data, item.index, { text: item.text });
  const snapshot = productionSnapshot.parse({ actor: user.id, batch_id: data.batch_id, tiles, written, videos });
  const quoteId = crypto.randomUUID();
  const savedQuote = await (admin as any).from("brand_work_operations").insert({ workspace_id: data.workspace_id, kind: "personal-idea-production-quote", signature: quoteId, token: crypto.randomUUID(), status: "complete", result: snapshot }).select("signature").maybeSingle();
  if (savedQuote.error || !savedQuote.data) throw new Error("Could not save this production quote.");
  const { getCreativeCapability } = await import("./creative-providers/registry");
  return { quoteId, totalCredits: tiles.reduce((sum, item) => sum + item.quote.credits, 0) + videos.reduce((sum, item) => sum + item.credits, 0), tiles: tiles.map(({ index, request_id, quote }) => ({ index, request_id, quote })), videos: videos.map(({ batchId, id, title, credits, lines }) => ({ batchId, id, title, credits, engines: [...new Set(lines.map(line => { const capability = getCreativeCapability(line.capability_id); return capability.id === "autotoast-hyperframes" ? "AutoToast HyperFrames" : capability.label; }))] })), written: written.map(({ index, title }) => ({ index, title })) };
});

const readProduction = createServerOnlyFn(async (data: z.infer<typeof productionRequest>) => {
  const { user, admin } = await context(data.workspace_id);
  await readBatch(data);
  const row = await (admin as any).from("brand_work_operations").select("result,status").eq("workspace_id", data.workspace_id).eq("kind", "personal-idea-production-quote").eq("signature", data.quote_id).maybeSingle();
  const snapshot = productionSnapshot.safeParse(row.data?.result);
  if (row.error || row.data?.status !== "complete" || !snapshot.success || snapshot.data.actor !== user.id || snapshot.data.batch_id !== data.batch_id) throw new Error("This production quote is unavailable. Review your content again.");
  return { user, admin, snapshot: snapshot.data };
});

const productionStatus = createServerOnlyFn(async (data: z.infer<typeof productionRequest>, includeImage = true) => {
  const { admin, snapshot } = await readProduction(data);
  const row = await (admin as any).from("brand_work_operations").select("status,result,token").eq("workspace_id", data.workspace_id).eq("kind", "personal-idea-production").eq("signature", data.batch_id).maybeSingle();
  if (row.error) throw new Error("Could not check production status.");
  if (!row.data) return { status: "not_submitted" as const, results: [] as ProductionResult[] };
  if (row.data.result?.stage === "quote_abandoned" && row.data.result?.actor === snapshot.actor) return { status: (Array.isArray(row.data.result.retired_quote_ids) && row.data.result.retired_quote_ids.includes(data.quote_id) ? "cancelled" : "not_submitted") as "cancelled" | "not_submitted", results: [] as ProductionResult[] };
  if (row.data.result?.quote_id !== data.quote_id || row.data.result?.actor !== snapshot.actor) throw new Error("This content plan already has a different production request. Check that request before continuing.");
  const savedResults = Array.isArray(row.data.result?.results) ? row.data.result.results as ProductionResult[] : [];
  const { createHash } = await import("node:crypto");
  const results = await Promise.all([
    ...snapshot.written.map(async (item): Promise<ProductionResult> => { const hex = createHash("sha256").update(`personal-idea-written:${data.workspace_id}:${data.batch_id}:${item.index}`).digest("hex"); const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`; const post = await admin.from("posts").select("id,caption").eq("workspace_id", data.workspace_id).eq("id", id).maybeSingle(); const saved = savedResults.find((result) => result.kind === "written" && (result.id === id || result.id === String(item.index))); return post.data ? { kind: "written", id, status: "ready", text: post.data.caption ?? "" } : saved ?? { kind: "written", id, status: "unconfirmed" }; }),
    ...snapshot.tiles.map(async (item): Promise<ProductionResult> => { const saved = savedResults.find((result) => result.kind === "tile" && result.id === item.request_id); try { let status = await getTileStatus({ workspace_id: data.workspace_id, batch_id: data.batch_id, request_id: item.request_id }, includeImage);
      if (status.status === "staged_recovery") {
        await (await import("./sam-tile-design.server")).resumeStagedSamTile(snapshot.actor, {workspace_id:data.workspace_id,request_id:item.request_id,headline:item.tile.headline});
        status = await getTileStatus({ workspace_id: data.workspace_id, batch_id: data.batch_id, request_id: item.request_id }, includeImage);
      }
      return status.status === "not_found" ? saved ?? { kind: "tile", id: item.request_id, status: "unconfirmed" } : { kind: "tile", id: item.request_id, status: status.status, ...("data_url" in status && status.data_url ? { previewUrl: status.data_url, downloadUrl: status.data_url } : {}), ...("message" in status && status.message ? { message: status.message } : {}), ...("artwork_file_id" in status && status.artwork_file_id ? { artworkFileId: status.artwork_file_id } : {}) }; } catch { return saved ?? { kind: "tile", id: item.request_id, status: "unconfirmed" }; } }),
    ...snapshot.videos.map(async (item): Promise<ProductionResult> => { const job = await admin.from("render_jobs").select("*").eq("workspace_id", data.workspace_id).eq("variant_id", item.id).eq("version", item.version).order("created_at", { ascending: false }).limit(1).maybeSingle(); const saved = savedResults.find((result) => result.kind === "video" && result.id === item.id); if (job.error) return { kind: "video", id: item.id, status: "unconfirmed", message: "Video quality checks could not be verified. Please try again." }; if (!job.data) return row.data.status === "complete" && saved?.status === "reconciliation_required" ? { kind: "video", id: item.id, status: "needs_attention", message: "No video job was found. Check the workspace credit allowance and video setup before trying again." } : saved ?? { kind: "video", id: item.id, status: "unconfirmed" }; const links = job.data.status === "done" ? await (await import("./asset-versions.server")).renderLinks(admin, job.data, item.title).catch(() => null) : null; return { kind: "video", id: item.id, ...videoProductionOutcome(job.data), ...(links?.url ? { previewUrl: links.url } : {}), ...(links?.download_url ? { downloadUrl: links.download_url } : {}) }; }),
  ]);
  if (row.data.status !== "complete" && results.length > 0 && results.every((item) => ["ready", "done", "failed", "needs_attention"].includes(item.status))) {
    const summaries = results.map(({ kind, id, status, message }) => ({ kind, id, status, ...(message ? { message } : {}) }));
    const finished = await (admin as any).from("brand_work_operations").update({ status: "complete", result: { batch_id: data.batch_id, quote_id: data.quote_id, actor: snapshot.actor, results: summaries }, updated_at: new Date().toISOString() }).eq("workspace_id", data.workspace_id).eq("kind", "personal-idea-production").eq("signature", data.batch_id).eq("status", "running").eq("token", row.data.token).select("token").maybeSingle();
    if (!finished.error && finished.data) return { status: "submitted" as const, results };
  }
  return { status: row.data.status === "complete" ? "submitted" as const : "in_progress" as const, results };
});

const produceAll = createServerOnlyFn(async (data: z.infer<typeof productionRequest>, retrySafe = false, beforeReservation?: () => Promise<void>) => {
  const { user, admin, snapshot } = await readProduction(data);
  // Recheck every estimate before reserving a batch or starting any engine.
  const { quoteSamTile } = await import("./sam-tile-design.server");
  for (const tile of snapshot.tiles) {
    const current = await quoteSamTile(tile.tile);
    if (JSON.stringify(quotedTile.shape.quote.parse(current)) !== JSON.stringify(tile.quote)) throw new Error("A design price changed. Review a fresh estimate before creating content.");
  }
  const { quoteProductionCredits } = await import("./content-credits.server");
  const { quoteAssetProduction } = await import("./production.server");
  const { activePlanningVariants } = await import("./production-plan");
  for (const video of snapshot.videos) {
    const row = await admin.from("creative_variants").select("*").eq("workspace_id", data.workspace_id).eq("batch_id", video.batchId).eq("id", video.id).maybeSingle();
    if (row.error || !row.data || row.data.version !== video.version) throw new Error("A video storyboard changed. Review the latest plan before creating content.");
    const batch = await admin.from("creative_batches").select("active_plan_id").eq("workspace_id", data.workspace_id).eq("id", video.batchId).maybeSingle();
    if (batch.error || !batch.data?.active_plan_id || !activePlanningVariants([row.data], batch.data.active_plan_id).length) throw new Error("A video storyboard changed. Review the latest plan before creating content.");
    const ready = await quoteAssetProduction(admin, row.data);
    if (!ready.ready) throw new Error(ready.message || "A video is not ready for production.");
    const price = await quoteProductionCredits(admin as unknown as import("@supabase/supabase-js").SupabaseClient, row.data.production_plan, row.data.duration_s);
    if (price.credits !== video.credits || JSON.stringify(z.array(creditLine).parse(price.lines)) !== JSON.stringify(video.lines)) throw new Error("A video price changed. Review a fresh estimate before creating content.");
  }
  if (beforeReservation) await beforeReservation();
  // One reservation per saved batch, even if multiple quote IDs were issued.
  const key = { workspace_id: data.workspace_id, kind: "personal-idea-production", signature: data.batch_id };
  const token = crypto.randomUUID();
  let retiredQuoteIds: string[] = [];
  const reservation = await (admin as any).from("brand_work_operations").insert({ ...key, token, status: "running", result: { batch_id: data.batch_id, quote_id: data.quote_id, actor: user.id, retired_quote_ids: [], results: [] } }).select("token").maybeSingle();
  if (reservation.error?.code === "23505") {
    const existing = await (admin as any).from("brand_work_operations").select("status,result,token").match(key).maybeSingle();
    if (existing.error || !existing.data || existing.data.result?.actor !== user.id) throw new Error("This content plan has another production request. Check its status before continuing.");
    if (existing.data.status === "complete" && existing.data.result?.stage === "quote_abandoned") {
      retiredQuoteIds = z.array(z.string().uuid()).max(100).parse(existing.data.result.retired_quote_ids ?? []);
      if (retiredQuoteIds.includes(data.quote_id)) throw new Error("This estimate was cancelled. Review a fresh estimate before creating content.");
      const claimed = await (admin as any).from("brand_work_operations").update({ token, status: "running", result: { batch_id: data.batch_id, quote_id: data.quote_id, actor: user.id, retired_quote_ids: retiredQuoteIds, results: [] }, updated_at: new Date().toISOString() }).match(key).eq("status", "complete").eq("token", existing.data.token).select("token").maybeSingle();
      if (claimed.error || !claimed.data) throw new Error("This content plan has another production request. Check its status before continuing.");
    } else if (retrySafe && existing.data.status === "complete" && existing.data.result?.quote_id === data.quote_id) {
      const claimed = await (admin as any).from("brand_work_operations").update({ token, status: "running", result: { ...existing.data.result, results: existing.data.result.results ?? [] }, updated_at: new Date().toISOString() }).match(key).eq("status", "complete").eq("token", existing.data.token).select("token").maybeSingle();
      if (claimed.error || !claimed.data) throw new Error("This production is already being checked. Check its status before retrying.");
    } else { const status = await productionStatus(data); return { status: "existing" as const, results: status.results }; }
  } else if (reservation.error || !reservation.data) throw new Error("Could not reserve this production request. Nothing was started.");
  const { queueRender, kickCreativeJobs } = await import("./creative.functions");
  const { createHash } = await import("node:crypto");
  const run = { server_received_at: new Date().toISOString(), run_id: crypto.randomUUID(), expected_count: Math.max(1, snapshot.videos.length) };
  const tasks: Array<() => Promise<ProductionResult>> = [
    ...snapshot.written.map((item) => async (): Promise<ProductionResult> => { try { const result = await saveWritten({ workspace_id: data.workspace_id, batch_id: data.batch_id, index: item.index, text: item.text, confirmed: true }); return { kind: "written", id: result.postId, status: "ready" }; } catch { return { kind: "written", id: String(item.index), status: "needs_attention", message: "Could not save this written draft." }; } }),
    ...snapshot.tiles.map((item) => async (): Promise<ProductionResult> => { try { const status = await getTileStatus({ workspace_id: data.workspace_id, batch_id: data.batch_id, request_id: item.request_id }); if (retrySafe && status.status !== "not_found") { const signature = createHash("sha256").update(JSON.stringify({ request_id: item.request_id })).digest("hex"); const operation = await (admin as any).from("brand_work_operations").select("status,result").eq("workspace_id", data.workspace_id).eq("kind", "postcard-social-tile").eq("signature", signature).maybeSingle(); if (operation.error || operation.data?.status !== "failed" || operation.data?.result?.retry_safe_before_generation !== true) return { kind: "tile", id: item.request_id, status: status.status, ...("message" in status && status.message ? { message: status.message } : {}) }; } const result = await makeTile({ workspace_id: data.workspace_id, batch_id: data.batch_id, request_id: item.request_id }, item, retrySafe && status.status !== "not_found"); return { kind: "tile", id: item.request_id, status: result.status, ...("message" in result && result.message ? { message: result.message } : {}) }; } catch { return { kind: "tile", id: item.request_id, status: "reconciliation_required", message: "Check this design's status before retrying." }; } }),
    ...snapshot.videos.map((item) => async (): Promise<ProductionResult> => { try { const previous = await admin.from("render_jobs").select("id,status,version").eq("workspace_id", data.workspace_id).eq("variant_id", item.id).eq("version", item.version).order("created_at", { ascending: false }).limit(1).maybeSingle(); if (previous.error) throw new Error("Could not inspect the previous render."); if (previous.data) return { kind: "video", id: item.id, status: previous.data.status === "failed" ? "needs_attention" : previous.data.status }; const id = await queueRender(admin, user.id, item.id, undefined, "user", undefined, run, { version: item.version, credits: item.credits, lines: item.lines }); await kickCreativeJobs(admin); return { kind: "video", id: item.id, status: "queued", message: `Render ${id} queued.` }; } catch (error) { const safe = error instanceof Error && (error as Error & { modelCreateSafeToRevise?: boolean }).modelCreateSafeToRevise === true; const allowance = safe && error instanceof Error && error.message === "The workspace's credit allowance could not be established. No video was started."; return safe ? { kind: "video", id: item.id, status: "needs_attention", message: allowance && error instanceof Error ? error.message : "Video checks did not pass; no video generation was started. Review the video setup." } : { kind: "video", id: item.id, status: "reconciliation_required", message: "Check this video's status before retrying." }; } }),
  ];
  const results: ProductionResult[] = [];
  let persistTail: Promise<void> = Promise.resolve();
  let nextTask = 0;
  await Promise.all(Array.from({length: Math.min(6, tasks.length)}, async () => {
    while (nextTask < tasks.length) {
    const task = tasks[nextTask++]!;
    const result = await task();
    results.push(result);
    const partial = [...results];
    persistTail = persistTail.then(async () => {
      const saved = await (admin as any).from("brand_work_operations").update({ result: { batch_id: data.batch_id, quote_id: data.quote_id, actor: user.id, retired_quote_ids: retiredQuoteIds, results: partial }, updated_at: new Date().toISOString() }).match(key).eq("token", token).eq("status", "running").select("token").maybeSingle();
      if (saved.error || !saved.data) throw new Error("Production status needs reconciliation.");
    });
    await persistTail;
    }
  }));
  if (snapshot.videos.length) await kickCreativeJobs(admin);
  const finished = await (admin as any).from("brand_work_operations").update({ status: "complete", result: { batch_id: data.batch_id, quote_id: data.quote_id, actor: user.id, retired_quote_ids: retiredQuoteIds, results }, updated_at: new Date().toISOString() }).match(key).eq("token", token).eq("status", "running").select("token").maybeSingle();
  if (finished.error || !finished.data) throw new Error("Production started but its final status could not be saved. Check this request before trying again.");
  return { status: "submitted" as const, results };
});

export const quotePersonalIdeaProduction = createServerFn({ method: "POST" }).inputValidator((value: unknown) => approvalInput.parse(value)).handler(({ data }) => quoteProduction(data));
export const getPersonalIdeaProductionStatus = createServerFn({ method: "POST" }).inputValidator((value: unknown) => productionRequest.parse(value)).handler(({ data }) => productionStatus(data));
export const producePersonalIdeaBatch = createServerFn({ method: "POST" }).inputValidator((value: unknown) => productionRequest.extend({ confirmed: z.literal(true) }).strict().parse(value)).handler(({ data }) => produceAll(data));
export const retryPersonalIdeaProduction = createServerFn({ method: "POST" }).inputValidator((value: unknown) => productionRequest.extend({ confirmed: z.literal(true) }).strict().parse(value)).handler(({ data }) => produceAll(data, true));

const abandonQuote = createServerOnlyFn(async (data: z.infer<typeof productionRequest>) => {
  const { user, admin } = await readProduction(data);
  const key = { workspace_id: data.workspace_id, kind: "personal-idea-production", signature: data.batch_id };
  const token = crypto.randomUUID();
  const tombstone = { batch_id: data.batch_id, quote_id: data.quote_id, actor: user.id, stage: "quote_abandoned", retired_quote_ids: [data.quote_id], results: [] };
  const inserted = await (admin as any).from("brand_work_operations").insert({ ...key, token, status: "complete", result: tombstone }).select("token").maybeSingle();
  if (!inserted.error && inserted.data) return { cancelled: true };
  if (inserted.error?.code !== "23505") throw new Error("Could not safely cancel this estimate. Check its status before continuing.");
  const row = await (admin as any).from("brand_work_operations").select("status,result,token").match(key).maybeSingle();
  if (row.error || !row.data || row.data.status !== "complete" || row.data.result?.stage !== "quote_abandoned" || row.data.result?.actor !== user.id) throw new Error("Production may already have started. Check its status before continuing.");
  const retired = z.array(z.string().uuid()).max(99).parse(row.data.result.retired_quote_ids ?? []);
  if (retired.includes(data.quote_id)) return { cancelled: true };
  const updated = await (admin as any).from("brand_work_operations").update({ token, result: { ...tombstone, retired_quote_ids: [...retired, data.quote_id] }, updated_at: new Date().toISOString() }).match(key).eq("status", "complete").eq("token", row.data.token).select("token").maybeSingle();
  if (updated.error || !updated.data) throw new Error("Production may already have started. Check its status before continuing.");
  return { cancelled: true };
});
export const abandonPersonalIdeaProductionQuote = createServerFn({ method: "POST" }).inputValidator((value: unknown) => productionRequest.parse(value)).handler(({ data }) => abandonQuote(data));

const activeProduction = createServerOnlyFn(async (data: z.infer<typeof getInput>) => {
  const { user, admin } = await context(data.workspace_id);
  await readBatch(data);
  const row = await (admin as any).from("brand_work_operations").select("result").eq("workspace_id", data.workspace_id).eq("kind", "personal-idea-production").eq("signature", data.batch_id).maybeSingle();
  if (row.error) throw new Error("Could not check this content plan's production.");
  if (!row.data) return { quoteId: null, status: "not_submitted" as const, results: [] as ProductionResult[] };
  if (row.data.result?.actor !== user.id) return { quoteId: null, status: "other_request" as const, results: [] as ProductionResult[] };
  const quoteId = z.string().uuid().parse(row.data.result?.quote_id);
  const state = await productionStatus({ ...data, quote_id: quoteId });
  return { quoteId, ...state };
});
export const getActivePersonalIdeaProduction = createServerFn({ method: "POST" }).inputValidator((value: unknown) => getInput.parse(value)).handler(({ data }) => activeProduction(data));

/** Let the same user return to their most recent submitted plan after leaving Create. */
export const getRecentPersonalIdeaProduction = createServerFn({ method: "POST" }).inputValidator((value: unknown) => z.object({ workspace_id: z.string().uuid() }).strict().parse(value)).handler(async ({ data }) => {
  const { user, admin } = await context(data.workspace_id);
  const result = await (admin as any).from("brand_work_operations").select("signature,result").eq("workspace_id", data.workspace_id).eq("kind", "personal-idea-production").contains("result", { actor: user.id }).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error("Could not load your recent production.");
  const id = z.string().uuid().safeParse(result.data?.signature);
  if (!id.success || result.data?.result?.stage === "quote_abandoned") return null;
  const batch = await readBatch({ workspace_id: data.workspace_id, batch_id: id.data });
  return { batchId: id.data, count: batch.items.length };
});
const campaignInput = z.object({ workspace_id: z.string().uuid(), campaign_id: z.string().uuid(), revision: z.string().uuid(), offset: z.number().int().min(0).max(80).multipleOf(20) }).strict();

const campaignBatch = createServerOnlyFn(async (data: z.infer<typeof campaignInput>) => {
  const { user } = await context(data.workspace_id);
  const { readContentCampaign } = await import("./content-campaign.server");
  const campaign = await readContentCampaign(user.id, data.workspace_id, data.campaign_id);
  if (campaign.revision !== data.revision) throw new Error("The campaign changed. Review it again.");
  const posts = campaignProductionPosts(campaign, data.offset);
  if (!posts.length) throw new Error("There are no tile or written posts in this batch.");
  const { contentCampaignBatchId } = await import("./content-campaign-batch.server");
  const batch_id = contentCampaignBatchId(data.workspace_id, data.campaign_id, data.revision, data.offset);
  return { campaign, posts, batch_id };
});

const campaignEstimate = createServerOnlyFn(async (data: z.infer<typeof campaignInput>) => {
  const { posts, batch_id } = await campaignBatch(data);
  const { admin, user } = await context(data.workspace_id);
  const existing = await (admin as any).from("brand_work_operations").select("result").match({
    workspace_id: data.workspace_id, kind: "content-campaign-quote", signature: batch_id,
  }).maybeSingle();
  if (existing.error) throw new Error("Could not load the campaign estimate.");
  if (existing.data?.result?.actor === user.id) {
    const quote = existing.data.result.quote;
    return { totalCredits: Number(quote.totalCredits), quoteId: String(quote.quoteId), batchId: batch_id };
  }
  const { quoteSamTile } = await import("./sam-tile-design.server");
  const rates = await Promise.all(posts.filter(post => post.format === "tiles").map(post => quoteSamTile(campaignTile(post))));
  return { totalCredits: rates.reduce((sum, rate) => sum + rate.credits, 0), quoteId: null, batchId: batch_id };
});
export const estimateContentCampaign = createServerFn({ method: "POST" }).inputValidator((value: unknown) => campaignInput.parse(value)).handler(({ data }) => campaignEstimate(data));

const quoteCampaign = createServerOnlyFn(async (data: z.infer<typeof campaignInput>) => {
  const { campaign, posts, batch_id } = await campaignBatch(data);
  const { user, admin } = await context(data.workspace_id);
  const quoteKey = { workspace_id: data.workspace_id, kind: "content-campaign-quote", signature: batch_id };
  const existing = await (admin as any).from("brand_work_operations").select("result,status").match(quoteKey).maybeSingle();
  if (existing.error) throw new Error("Could not recover the production estimate.");
  if (existing.data?.status === "complete") {
    if (existing.data.result?.actor !== user.id) throw new Error("This estimate belongs to another user.");
    return existing.data.result.quote;
  }
  const items = posts.map((post, index) => ({ title: `${post.title.slice(0, 90)} #${index + 1}`, angle: post.brief.slice(0, 240), format: post.format as "tiles" | "written" }));
  await saveBatch({ workspace_id: data.workspace_id, request_id: batch_id, items });
  const tiles: Array<{ index: number; tile: z.infer<typeof tileInput> }> = [];
  const written: Array<{ index: number; text: string }> = [];
  for (const [index, post] of posts.entries()) {
    if (post.format === "tiles") {
      const tile = campaignTile(post);
      const plan = { brand: campaign.title.slice(0, 60), tiles: [tile] };
      await savePrepared({ workspace_id: data.workspace_id, batch_id, index, output: { plan }, expected_revision: null });
      tiles.push({ index, tile });
    } else {
      await savePrepared({ workspace_id: data.workspace_id, batch_id, index, output: { text: post.caption }, expected_revision: null });
      written.push({ index, text: post.caption });
    }
  }
  const quote = await quoteProduction({ workspace_id: data.workspace_id, batch_id, tiles, written, videos: [] });
  const response = { ...quote, batch_id, posts: posts.map((post) => ({ id: post.id, caption: post.caption, date: post.date, platform: post.platform })) };
  const inserted = await (admin as any).from("brand_work_operations").insert({ ...quoteKey, token: crypto.randomUUID(), status: "complete", result: { actor: user.id, quote: response } }).select("result").maybeSingle();
  if (!inserted.error && inserted.data) return response;
  if (inserted.error?.code !== "23505") throw new Error("Could not save the campaign estimate. Try again.");
  const raced = await (admin as any).from("brand_work_operations").select("result,status").match(quoteKey).maybeSingle();
  if (raced.error || raced.data?.status !== "complete" || raced.data.result?.actor !== user.id) throw new Error("Could not recover the production estimate.");
  return raced.data.result.quote;
});

export const quoteContentCampaignProduction = createServerFn({ method: "POST" }).inputValidator((value: unknown) => campaignInput.parse(value)).handler(({ data }) => quoteCampaign(data));
const campaignProductionInput = campaignInput.extend({ batch_id: z.string().uuid(), quote_id: z.string().uuid() }).strict();
const campaignProduction = createServerOnlyFn(async (data: z.infer<typeof campaignProductionInput>, submit: boolean) => {
  const current = await campaignBatch(data);
  if (current.batch_id !== data.batch_id) throw new Error("This quote belongs to a different campaign.");
  const request = { workspace_id: data.workspace_id, batch_id: data.batch_id, quote_id: data.quote_id };
  if (submit) {
    await readProduction(request);
    const { admin } = await context(data.workspace_id);
    const { createHash } = await import("node:crypto");
    const lockRevision = async () => {
      const lockHex = createHash("sha256").update(`campaign-quote-lock:${data.workspace_id}:${data.campaign_id}:${data.revision}`).digest("hex");
      const lockToken = `${lockHex.slice(0,8)}-${lockHex.slice(8,12)}-4${lockHex.slice(13,16)}-a${lockHex.slice(17,20)}-${lockHex.slice(20,32)}`;
      const campaignKey = { workspace_id: data.workspace_id, kind: "content-campaign", signature: data.campaign_id };
      const locked = await (admin as any).from("brand_work_operations").update({ token: lockToken }).match(campaignKey).eq("token", data.revision).select("token").maybeSingle();
      if (locked.error) throw new Error("Could not lock the reviewed campaign.");
      if (!locked.data) {
        const row = await (admin as any).from("brand_work_operations").select("token,result").match(campaignKey).maybeSingle();
        if (row.error || row.data?.token !== lockToken || row.data?.result?.revision !== data.revision) throw new Error("The campaign changed. Review it again.");
      }
    };
    await produceAll(request, false, lockRevision);
  }
  const status = await productionStatus(request, false);
  const { snapshot } = await readProduction(request);
  const { admin } = await context(data.workspace_id);
  const tileIds = snapshot.tiles.map((tile) => tile.request_id);
  const files = tileIds.length ? await admin.from("brand_files").select("id,storage_path").eq("workspace_id", data.workspace_id).eq("source", "social_tile").in("id", tileIds) : { data: [], error: null };
  if (files.error) throw new Error("Could not verify completed tile assets.");
  const images = (files.data ?? []).filter(file => file.storage_path.startsWith(data.workspace_id + "/") && !file.storage_path.includes("\\") && !file.storage_path.split("/").some(part => !part || part === "." || part === ".."));
  const signed = images.length ? await admin.storage.from("brand-assets-private").createSignedUrls(images.map(file => file.storage_path), 3600) : null;
  const previews = new Map(images.map((file,i) => [file.id, signed?.data?.[i]?.signedUrl]));
  const { createHash } = await import("node:crypto");
  const pairs = current.posts.map((post, index) => {
    const tile = snapshot.tiles.find((item) => item.index === index);
    const hex = createHash("sha256").update(`personal-idea-written:${data.workspace_id}:${data.batch_id}:${index}`).digest("hex");
    const writtenId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    const result = status.results.find((item) => item.id === (tile?.request_id ?? writtenId));
    return { postId: post.id, date: post.date, caption: post.caption, platform: post.platform, type: post.format === "tiles" ? "tile" as const : "written" as const, assetId: result?.id && (post.format !== "tiles" || previews.has(result.id)) ? result.id : null, previewUrl: tile ? previews.get(tile.request_id) ?? null : null, ...(tile?.tile.design && result?.status === "ready" && (tile.tile.design.treatment === "typography" || result.artworkFileId) ? { editablePlan: { brand: current.campaign.title.slice(0, 60), tiles: [{ ...tile.tile, artwork: { requestId: tile.request_id, ...(result.artworkFileId ? { fileId: result.artworkFileId } : {}) } }] } } : {}), message: result?.message ?? "", status: result?.status ?? "unconfirmed" };
  });
  return { status: status.status, results: pairs };
});
export const getContentCampaignProduction = createServerFn({ method: "POST" }).inputValidator((value: unknown) => campaignProductionInput.parse(value)).handler(({ data }) => campaignProduction(data, false));
export const produceContentCampaign = createServerFn({ method: "POST" }).inputValidator((value: unknown) => campaignProductionInput.extend({ confirmed: z.literal(true) }).strict().parse(value)).handler(({ data }) => campaignProduction(data, true));
