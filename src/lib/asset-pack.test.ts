import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { expandAssetPack, safeAssetPackPath } from "./asset-pack";
const archive = async (entries: Record<string, string>) => { const zip = new JSZip(); for (const [name, text] of Object.entries(entries)) zip.file(name, text); return new Blob([await zip.generateAsync({ type: "uint8array" })]); };
describe("safe asset packs", () => {
  it.each(["../private.png", "/absolute.jpg", "C:\\photo.jpg", "folder/../photo.jpg"])("rejects unsafe path %s", path => expect(() => safeAssetPackPath(path)).toThrow());
  it("imports supported documents and images into the existing upload shape", async () => {
    const result = await expandAssetPack(await archive({ "facts.md": "Approved claim", "photos/product.png": "image" }), "Product.zip");
    expect(result.map(item => item.name)).toEqual(["facts.md", "product.png"]); expect(result[1]?.dir).toBe("Product/photos");
  });
  it.each(["nested.zip", "run.exe", "script.js"])("rejects unsupported pack member %s before extraction", async name => {
    await expect(expandAssetPack(await archive({ [name]: "payload" }), "assets.zip")).rejects.toThrow("Unsupported file");
  });
  it("rejects oversized expanded metadata before inflating", async () => {
    const zip = new JSZip(); zip.file("huge.txt", "small");
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const view = new DataView(bytes.buffer); for (let i = 0; i < bytes.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 51 * 1024 ** 2, true); break; }
    await expect(expandAssetPack(new Blob([bytes]), "assets.zip")).rejects.toThrow("limit");
  });
});

