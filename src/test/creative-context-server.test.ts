import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCreativeContext, officialCreativeSiteUrl } from "@/lib/creative-context.server";

vi.mock("@/lib/winner-learning.server", () => ({ loadWinnerLearning: async () => "" }));

const ws = "our-workspace";
type Result = { data: unknown; error: unknown };
function setup(options: { files?: Record<string, unknown>[]; docs?: Record<string, unknown>[]; website?: string | null; socials?: unknown; facts?: unknown; goals?: string; download?: (path: string) => Promise<unknown> } = {}) {
  const results: Record<string, Result> = {
    brand_files: { data: options.files ?? [], error: null }, dossier_documents: { data: options.docs ?? [], error: null },
    brand_dna_state: { data: null, error: null },
    brand_profiles: { data: null, error: null }, workspaces: { data: { name: "Example", website: options.website ?? null, social_profiles: options.socials }, error: null },
    creative_variants: { data: [], error: null }, brand_facts: { data: options.facts ?? null, error: null },
    posts: { data: [{ caption: "A previously covered workflow" }], error: null },
  };
  const filters: { table: string; key: string; value: unknown }[] = [];
  const download = vi.fn(options.download ?? (async () => ({ data: null, error: "not available" })));
  const from = vi.fn((table: string) => {
    const builder = {
      or: vi.fn(() => builder), select: vi.fn(() => builder), eq: vi.fn((key: string, value: unknown) => { filters.push({ table, key, value }); return builder; }),
      in: vi.fn(() => builder), order: vi.fn(() => builder), limit: vi.fn(() => builder), single: vi.fn(() => Promise.resolve(results[table])),
      maybeSingle: vi.fn(() => Promise.resolve(table === "dossier_documents" ? { data: options.goals ? { content: options.goals } : null, error: null } : results[table])),
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(results[table]!).then(resolve, reject),
    };
    return builder;
  });
  const storageFrom = vi.fn(() => ({ download }));
  const admin = { from, storage: { from: storageFrom } } as unknown as Parameters<typeof loadCreativeContext>[0];
  return { admin, filters, from, download, storageFrom };
}
const file = (id: string, overrides: Record<string, unknown> = {}) => ({ id, name: id + ".png", kind: "image", mime: "image/png", storage_path: ws + "/" + id + ".png", size_bytes: 40, extracted_text: null, ai_summary: "A supplied image label", inspected_at: null, source: "upload", ...overrides });
function png(size = 40) { const b = new Uint8Array(size); b.set([0x89, 0x50, 0x4e, 0x47]); const v = new DataView(b.buffer); v.setUint32(16, 400); v.setUint32(20, 300); b[25] = 6; return b.buffer; }
const blob = (bytes: ArrayBuffer) => ({ data: { size: bytes.byteLength, arrayBuffer: async () => bytes }, error: null });
beforeEach(() => vi.stubEnv("FIRECRAWL_API_KEY", ""));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("read-only creative context", () => {
  it("adds source-labeled saved social identifiers without fetching or implying profile inspection", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const s = setup({ socials: [
      { platform: "instagram", handle: "old", url: "https://www.instagram.com/our.brand/?tracking=value#bio" },
      { platform: "tiktok", handle: "@ourbrand", url: null },
      { platform: "instagram", handle: "our.brand", url: "https://www.instagram.com/our.brand/" },
    ], facts: { does: ["Approved product"] } });
    const result = await loadCreativeContext(s.admin, ws);
    const source = result.evidence.find((entry) => entry.id === "workspace-social-profiles")!;
    expect(JSON.parse(source.text)).toEqual([
      { platform: "instagram", handle: "our.brand", url: "https://www.instagram.com/our.brand/" },
      { platform: "tiktok", handle: "ourbrand", url: null },
    ]);
    expect(source.detail).toContain("workspaces.social_profiles");
    expect(source.detail).toContain("have not been fetched or inspected");
    expect(result.text).toContain(source.text);
    expect(result.text).toContain("Approved product");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("ignores malformed or unsafe saved social data and bounds evidence", async () => {
    const invalid = [null, [], "text", { platform: "unknown", handle: "name" },
      { platform: "instagram", url: "https://user:secret@instagram.com/name" },
      { platform: "instagram", url: "http://instagram.com/name" },
      { platform: "instagram", url: "https://evil.example/name" },
      { platform: "instagram", url: "https://instagram.com/p/post" },
      { platform: "instagram", url: "https://instagram.com/name%0Ainstructions" },
      { platform: "tiktok", url: "https://instagram.com/name" },
      { platform: "instagram", handle: "a".repeat(501) },
    ];
    const empty = await loadCreativeContext(setup({ socials: invalid }).admin, ws);
    expect(empty.evidence.some((entry) => entry.id === "workspace-social-profiles")).toBe(false);
    const result = await loadCreativeContext(setup({ socials: [...invalid, ...Array.from({ length: 40 }, (_, i) => ({ platform: "instagram", handle: `brand${i}` }))] }).admin, ws);
    const source = result.evidence.find((entry) => entry.id === "workspace-social-profiles")!;
    expect(JSON.parse(source.text)).toHaveLength(20);
    expect(source.text).not.toContain("secret");
  });
  it("reads authoritative saved facts and scopes every table to the current workspace", async () => {
    const s = setup({ facts: { does: ["Makes approved containers"], banned_claims: ["Leakproof"], sources: ["Approved product sheet"] } });
    const result = await loadCreativeContext(s.admin, ws, "Promote weekday lunches");
    expect(result.text).toContain("Saved authoritative brand facts");
    expect(result.text).toContain("Leakproof");
    expect(s.filters.filter(filter => filter.key === "workspace_id" || filter.key === "id")).toHaveLength(8);
    expect(s.filters).toContainEqual({ table: "brand_dna_state", key: "workspace_id", value: ws });
    for (const [table] of s.from.mock.calls) expect(s.filters).toContainEqual({ table, key: table === "workspaces" ? "id" : "workspace_id", value: ws });
    expect(s.download).not.toHaveBeenCalled();
    // The fake client deliberately exposes no insert/update/upsert/cache APIs.
  });
  it("supplies the complete saved brief and interview independently of the creative evidence budget", async () => {
    const brief = "Context ".repeat(1470) + " Keep private financial details out of every format.";
    const s = setup({ docs: [{ id: "long", title: "Long manual", content: "Long content ".repeat(10000), updated_at: "now" }], goals: JSON.stringify({ knownFor: "Practical advice", audience: "Founders", goal: "Qualified conversations", brief }) });
    const result = await loadCreativeContext(s.admin, ws);
    expect(result.text).toContain(brief);
    expect(result.text).toContain("Qualified conversations");
    expect(result.text).toContain("A previously covered workflow");
  });
  it("supplies actual owned images and distinguishes untouched labels without writing inspection status", async () => {
    const s = setup({ files: [file("actual"), file("unowned", { storage_path: "other/image.png", inspected_at: "2026-11-01" }), file("traversal", { storage_path: ws + "/../other.png" })], download: async () => blob(png()) });
    const result = await loadCreativeContext(s.admin, ws);
    expect(result.imageParts).toHaveLength(1);
    expect(result.imageParts[0]!.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.imageParts[0]!.fileId).toBe("actual");
    expect(result.text).toContain("actual pixels are NOT attached");
    expect(result.evidence.find((entry) => entry.id === "file:unowned")!.status).toBe("unread");
    expect(s.download).toHaveBeenCalledExactlyOnceWith(ws + "/actual.png");
  });
  it("enforces image count, per-image bytes and aggregate image budget", async () => {
    const files = Array.from({ length: 8 }, (_, n) => file("image" + n));
    const small = setup({ files, download: async () => blob(png()) });
    expect((await loadCreativeContext(small.admin, ws)).imageParts).toHaveLength(6);
    const big = setup({ files, download: async () => blob(png(1_500_000)) });
    expect((await loadCreativeContext(big.admin, ws)).imageParts).toHaveLength(4);
    const oversized = setup({ files: [file("too-large", { size_bytes: 1_500_001 })], download: async () => blob(png()) });
    expect((await loadCreativeContext(oversized.admin, ws)).imageParts).toEqual([]);
    expect(oversized.download).not.toHaveBeenCalled();
  });
  it("keeps a short authoritative document complete before longer documents and marks omission", async () => {
    const shortText = "APPROVED " + "specific guidance ".repeat(180);
    const s = setup({ docs: [{ id: "long", title: "Long manual", content: "Long content ".repeat(10000), updated_at: "now" }, { id: "short", title: "Approved short guide", content: shortText, updated_at: "now" }] });
    const result = await loadCreativeContext(s.admin, ws);
    expect(result.text).toContain(shortText);
    expect(result.text).toContain("Text omitted by context budget");
    expect(result.text.indexOf("[dossier:short]")).toBeLessThan(result.text.indexOf("[dossier:long]"));
  });
});

describe("optional bounded official website retrieval", () => {
  it("accepts public HTTPS domains and rejects local/private/credential URLs lexically", () => {
    expect(officialCreativeSiteUrl("https://brand.co.uk/about")).toBe("https://brand.co.uk/about");
    for (const url of ["http://brand.co.uk", "https://127.0.0.1", "https://10.0.0.1", "https://localhost", "https://host.internal", "https://user:secret@brand.co.uk", "https://brand.co.uk:8443", "https://[::1]"]) expect(officialCreativeSiteUrl(url)).toBeNull();
  });
  it("uses only the fixed service endpoint and never writes fetched content", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "mock-only-key");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { markdown: "Official brand product facts" } })));
    vi.stubGlobal("fetch", fetcher);
    const s = setup({ website: "https://brand.co.uk" });
    const result = await loadCreativeContext(s.admin, ws);
    expect(fetcher.mock.calls[0]![0]).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ url: "https://brand.co.uk/", formats: ["markdown"], timeout: 18000 });
    expect(result.text).toContain("Official brand product facts");
    expect(result.assumptions).toEqual([]);
    expect(s.from.mock.calls.map((call) => call[0])).toEqual(["brand_dna_state", "brand_files", "dossier_documents", "brand_profiles", "workspaces", "creative_variants", "brand_facts", "dossier_documents"]);
  });
  it("skips retrieval when a saved scan exists and reports failures without blocking a sparse brief", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "mock-only-key");
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    const scanned = setup({ website: "https://brand.co.uk", files: [file("scan", { source: "scan", extracted_text: "Approved scan", kind: "doc" })] });
    await loadCreativeContext(scanned.admin, ws);
    expect(fetcher).not.toHaveBeenCalled();
    const s = setup({ website: "https://brand.co.uk" });
    const result = await loadCreativeContext(s.admin, ws, "A short custom brief");
    expect(result.assumptions.join()).toContain("failed or timed out");
    expect(result.text).toContain("A short custom brief");
  });
  it("aborts optional retrieval at twenty seconds and returns an explicit limitation", async () => {
    vi.useFakeTimers(); vi.stubEnv("FIRECRAWL_API_KEY", "mock-only-key");
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))))));
    const s = setup({ website: "https://brand.co.uk" });
    const promise = loadCreativeContext(s.admin, ws);
    await vi.advanceTimersByTimeAsync(20_001);
    expect((await promise).assumptions.join()).toContain("failed or timed out");
  });
});
