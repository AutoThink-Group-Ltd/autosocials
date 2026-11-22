import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: null as any, prepare: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { let validate = (value: unknown) => value; const chain = { inputValidator: (fn: typeof validate) => { validate = fn; return chain; }, handler: (fn: any) => (input: any) => fn({ data: validate(input.data) }) }; return chain; } }));
vi.mock("../lib/supabase-admin.server", () => ({ requireUser: async () => ({ id: "user" }), getAdminClient: () => mocks.admin }));
vi.mock("../lib/direct-video.server", () => ({ prepareDirectVideo: mocks.prepare }));
import { prepareStoryboardVideo } from "../lib/storyboard-video.functions";

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
let blocks: any[];
beforeEach(() => {
  vi.clearAllMocks();
  blocks = [
    { type: "assets", title: "Photos", file_ids: [id(3), id(4)], layout: "grid" },
    { type: "storyboard", title: "Scene order", frames: [{ at: "0s", caption: "Boardwalk", file_id: id(4) }, { at: "5s", caption: "Skyline", file_id: id(3) }] },
    { type: "document", title: "Production setup", markdown: "## Prompt\nPreserve the actual London buildings.\n## Notes\nNo invented interiors." },
  ];
  mocks.prepare.mockResolvedValue({ brief: { duration: 30, aspectRatio: "9:16", resolution: "1080p" }, referenceIds: [id(4), id(3)], options: [{ capabilityId: "seedance", label: "Seedance" }], missing: [], reason: "Choose a model" });
  mocks.admin = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }), from: (table: string) => {
    const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q,
      single: async () => ({ data: { id: id(1), workspace_id: id(2), module: "create", blocks, version: 1 }, error: null }),
      maybeSingle: async () => ({ data: table === "agent_messages" ? { thread_id: id(5) } : { id: id(1) }, error: null }),
      update: (data: any) => { if (table === "canvases") blocks = data.blocks; return q; },
    }; return q;
  } };
});

it("keeps storyboard order and exact prompt when opening a video choice", async () => {
  await expect((prepareStoryboardVideo as any)({ data: { canvas_id: id(1) } })).resolves.toEqual({ ready: true });
  expect(mocks.prepare).toHaveBeenCalledWith(expect.anything(), "user", id(2), id(5), expect.stringContaining("Preserve the actual London buildings"), [id(4), id(3)]);
  expect(blocks.at(-1)).toMatchObject({ type: "direct_video", status: "options", file_ids: [id(4), id(3)], duration: 30, resolution: "1080p" });
  expect(blocks.at(-1).message).not.toContain("No invented interiors");
});

it("uses the revised 15-second plan when the storyboard has no document block", async () => {
  blocks = [
    { type: "assets", title: "Photos", file_ids: [id(3), id(4)] },
    { type: "brief", title: "Film plan", fields: [{ label: "Duration", value: "15 seconds" }, { label: "Format", value: "Vertical" }] },
    { type: "shotlist", title: "Shot plan", items: [{ file_id: id(4), role: "Boardwalk", why: "Opening glide" }, { file_id: id(3), role: "Skyline", why: "Reveal" }] },
  ];
  mocks.prepare.mockImplementation(async (_admin, _user, _workspace, _thread, message, files) => ({
    brief: { duration: message.includes("15-second") ? 15 : 30, aspectRatio: "9:16", resolution: "1080p" },
    referenceIds: files, options: [{ capabilityId: "seedance", label: "Seedance" }], missing: [], reason: "Choose a model",
  }));
  await expect((prepareStoryboardVideo as any)({ data: { canvas_id: id(1) } })).resolves.toEqual({ ready: true });
  expect(blocks.at(-1)).toMatchObject({ type: "direct_video", duration: 15, file_ids: [id(4), id(3)] });
  expect(blocks.at(-1).message).toContain("Create a 15-second 9:16 1080p reference video");
});
