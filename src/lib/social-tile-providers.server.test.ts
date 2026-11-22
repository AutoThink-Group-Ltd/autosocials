import { afterEach, describe, expect, it, vi } from "vitest";
const download = vi.hoisted(() => vi.fn());
vi.mock("./creative-media.server", () => ({ downloadCreativeMedia: download }));
import { generateExternalTile, TileProviderError } from "./social-tile-providers.server";

describe("external social tile providers", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
  it("sends brand references to Recraft and records the provider-reported units", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ credits: 40, data: [{ b64_json: Buffer.from("image").toString("base64") }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher); const record = vi.fn();
    const result = await generateExternalTile("recraft", "test", "brief", ["data:image/png;base64,VEVTVA=="], record);
    const body = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(body.style_reference_urls).toEqual(["data:image/png;base64,VEVTVA=="]);
    expect(body.size).toBe("1024x1024"); expect(record).toHaveBeenCalledWith(40, null); expect(result.credits).toBe(40);
  });
  it("uses Ideogram image uploads and leaves unreported credits unknown", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ generation_id: "job", data: [{ url: "https://images.example/image.png" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher); download.mockResolvedValue({ bytes: Buffer.from("image"), contentType: "image/png" }); const record = vi.fn();
    const result = await generateExternalTile("ideogram", "test", "brief", ["data:image/png;base64,VEVTVA=="], record);
    expect(fetcher.mock.calls[0]![1].body.getAll("images")).toHaveLength(1);
    expect(record).toHaveBeenCalledWith(null, "job"); expect(result.credits).toBeNull();
  });
  it("does not retry a failed provider request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 402 })); vi.stubGlobal("fetch", fetcher);
    await expect(generateExternalTile("recraft", "test", "brief", [], vi.fn())).rejects.toBeInstanceOf(TileProviderError);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
