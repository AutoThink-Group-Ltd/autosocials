/* eslint-disable @typescript-eslint/no-explicit-any -- small database double */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ admin: null as any, height: 1000 }));
vi.mock("jpeg-js", () => ({ default: { decode: () => ({ width: 1000, height: state.height }) } }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: () => state.admin }));
vi.mock("./social-tile-storage.server", () => ({ decodeTileImage: (value: string) => Buffer.from(value, "base64") }));
import { getCarouselForUser, listCarouselsForUser, saveCarouselForUser, saveCarouselSlideForUser } from "./linkedin-carousel.server";
import { carouselPlanSchema } from "./linkedin-carousel";

const workspace_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const first = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const second = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const plan = { title: "A useful story", promise: "Take a practical next step", brand: "Example", slides: [
  { id: first, headline: "A question", supporting: "A reason to continue", direction: "Bold cover" },
  { id: second, headline: "The answer", supporting: "A practical takeaway", direction: "Simple conclusion" },
] };

function fakeAdmin(allowed = true) {
  let row: any = null;
  const objects = new Map<string, Buffer>();
  return {
    rpc: async () => ({ data: allowed, error: null }),
    storage: { from: () => ({
      upload: async (path: string, bytes: Buffer) => { if (objects.has(path)) return { error: true }; objects.set(path, Buffer.from(bytes)); return { error: null }; },
      download: async (path: string) => {
        const bytes = objects.get(path);
        return { data: bytes ? { size: bytes.length, text: async () => bytes.toString("utf8"), arrayBuffer: async () => Uint8Array.from(bytes).buffer } : null, error: bytes ? null : true };
      },
      createSignedUrl: async (path: string) => ({ data: objects.has(path) ? { signedUrl: `https://example.test/${path}` } : null, error: objects.has(path) ? null : true }),
      remove: async (paths: string[]) => { paths.forEach((path) => objects.delete(path)); return { error: null }; },
    }) },
    from: () => {
      let values: any = null;
      const filters: [string, string][] = [];
      const query: any = {
        select: () => query,
        eq: (key: string, value: string) => { filters.push([key, value]); return query; },
        insert: (input: any) => { row = { ...input, updated_at: new Date().toISOString() }; return query; },
        update: (input: any) => { values = input; return query; },
        maybeSingle: async () => {
          if (!row || !filters.every(([key, value]) => row[key] === value)) return { data: null, error: null };
          if (values) row = { ...row, ...values };
          return { data: { ...row }, error: null };
        },
        single: async () => ({ data: row, error: null }),
      };
      return query;
    },
  };
}

beforeEach(() => { state.admin = fakeAdmin(); state.height = 1000; });

describe("LinkedIn carousel storage", () => {
  it("keeps completed slides across retries and invalidates them when the outline order changes", async () => {
    const saved = await saveCarouselForUser("user", { workspace_id, id, plan });
    const slide = await saveCarouselSlideForUser("user", { workspace_id, id, slide_id: first, version: saved.version, image_base64: Buffer.from("slide").toString("base64") });
    expect(slide.slides.map((item) => item.id)).toEqual([first]);
    const afterLostResponse = await saveCarouselSlideForUser("user", { workspace_id, id, slide_id: first, version: saved.version, image_base64: Buffer.from("slide").toString("base64") });
    expect(afterLostResponse.version).toBe(slide.version);
    const retry = await saveCarouselForUser("user", { workspace_id, id, plan, version: slide.version });
    expect(retry.slides.map((item) => item.id)).toEqual([first]);
    const otherEdited = await saveCarouselForUser("user", { workspace_id, id, plan: { ...plan, slides: [plan.slides[0]!, { ...plan.slides[1]!, headline: "A revised answer" }] }, version: retry.version });
    expect(otherEdited.slides.map((item) => item.id)).toEqual([first]);
    const changed = await saveCarouselForUser("user", { workspace_id, id, plan: { ...plan, slides: [...plan.slides].reverse() }, version: otherEdited.version });
    expect(changed.slides).toEqual([]);
    await expect(saveCarouselSlideForUser("user", { workspace_id, id, slide_id: second, version: retry.version, image_base64: Buffer.from("stale").toString("base64") })).rejects.toThrow("changed in another session");
    expect((await getCarouselForUser("user", { workspace_id, id })).plan.slides[0]?.id).toBe(second);
  });
  it("keeps an accepted slide while a replacement request is pending and rejects mismatched dimensions", async () => {
    const initial = await saveCarouselForUser("user", { workspace_id, id, plan });
    const rendered = await saveCarouselSlideForUser("user", { workspace_id, id, slide_id: first, version: initial.version, image_base64: Buffer.from("slide").toString("base64") });
    const pendingPlan = { ...plan, slides: [{ ...plan.slides[0]!, artwork: { requestId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" } }, plan.slides[1]!] };
    const pending = await saveCarouselForUser("user", { workspace_id, id, plan: pendingPlan, version: rendered.version });
    expect(pending.slides.map(slide => slide.id)).toEqual([first]);
    state.height = 1250;
    await expect(saveCarouselSlideForUser("user", { workspace_id, id, slide_id: second, version: pending.version, image_base64: Buffer.from("slide2").toString("base64") })).rejects.toThrow("dimensions");
  });
  it("requires workspace access before reading or creating a carousel", async () => {
    state.admin = fakeAdmin(false);
    await expect(getCarouselForUser("user", { workspace_id, id })).rejects.toThrow("Workspace access denied");
    await expect(saveCarouselForUser("user", { workspace_id, id, plan })).rejects.toThrow("Workspace access denied");
  });
  it("enforces the two-to-six slide limit and unique slide IDs", () => {
    expect(carouselPlanSchema.safeParse({ ...plan, slides: [plan.slides[0]] }).success).toBe(false);
    expect(carouselPlanSchema.safeParse({ ...plan, slides: Array(7).fill(plan.slides[0]) }).success).toBe(false);
    expect(carouselPlanSchema.safeParse({ ...plan, slides: [plan.slides[0], plan.slides[0]] }).success).toBe(false);
    expect(carouselPlanSchema.safeParse(plan).success).toBe(true);
  });
});

it("lists complete carousels with one cover and isolates invalid manifest paths", async () => {
  const path = `${workspace_id}/linkedin-carousels/${id}/manifest-a.json`;
  const cover = `${workspace_id}/linkedin-carousels/${id}/${first}-cover.jpg`;
  const another = `${workspace_id}/linkedin-carousels/${id}/${second}-other.jpg`;
  const bad = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const rows = [
    { id, name: "A useful story.json", workspace_id, source: "linkedin_carousel", storage_path: path, updated_at: "2030-01-01" },
    { id: bad, name: "Bad.json", workspace_id, source: "linkedin_carousel", storage_path: `${workspace_id}/wrong/manifest-a.json`, updated_at: "2030-01-01" },
  ];
  let raw = JSON.stringify({ version: "ffffffff-ffff-4fff-8fff-ffffffffffff", plan, images: { [first]: cover, [second]: another } });
  const download = vi.fn(async () => ({ data: { size: raw.length, text: async () => raw }, error: null }));
  const signed = vi.fn(async (key: string) => ({ data: { signedUrl: `https://example.test/${key}` }, error: null }));
  const query: any = { select: () => query, eq: () => query, order: () => query, range: async () => ({ data: rows, error: null }) };
  state.admin = { rpc: async () => ({ data: true, error: null }), from: () => query, storage: { from: () => ({ download, createSignedUrl: signed }) } };
  const list = await listCarouselsForUser("user", workspace_id);
  expect(list[0]).toMatchObject({ id, complete: true, unreadable: false, coverUrl: `https://example.test/${cover}` });
  expect(list[1]).toMatchObject({ id: bad, complete: false, unreadable: true, coverUrl: null });
  expect(download).toHaveBeenCalledTimes(1);
  expect(signed).toHaveBeenCalledOnce();
  raw = JSON.stringify({ version: "ffffffff-ffff-4fff-8fff-ffffffffffff", plan: { ...plan, productionStarted: true }, images: { [first]: cover } });
  expect((await listCarouselsForUser("user", workspace_id))[0]).toMatchObject({ id, complete: false, production: true });
  state.admin.rpc = async () => ({ data: false, error: null });
  await expect(listCarouselsForUser("user", workspace_id)).rejects.toThrow("Workspace access denied");
});
