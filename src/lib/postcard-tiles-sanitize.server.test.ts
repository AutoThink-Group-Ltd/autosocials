import { describe, expect, it, vi } from "vitest";
import { preparePostcardSquare } from "./postcard-tiles-sanitize.server";
const square = (content: string) =>
  `<!doctype html><html><head><style>p{font-size:30px;color:#fff}</style></head><body><div style="width:1000px;height:1000px;background:#333">${content}</div></body></html>`;
function image() {
  const bytes = Buffer.alloc(45);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(1000, 16);
  bytes.writeUInt32BE(1000, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes.write("IEND", 37);
  return bytes;
}
describe("Postcards square preparation", () => {
  it("removes executable content and embeds verified images", async () => {
    const download = vi.fn().mockResolvedValue({
      bytes: image(),
      contentType: "image/png",
      extension: "png",
    });
    const result = await preparePostcardSquare(
      square(
        '<script>alert(1)</script><img src="https://example.com/a.png" onerror="alert(2)"><a href="https://example.com">Hello</a>',
      ),
      download,
    );
    expect(result).not.toContain("alert(1)");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain('href="https:');
    expect(result).toContain('src="data:image/png;base64,');
    expect(result).toContain('data-width="1000"');
    expect(download).toHaveBeenCalledTimes(1);
  });
  it("rejects a normal email without an explicit square instead of cropping", async () => {
    await expect(
      preparePostcardSquare(
        '<table width="600"><tr><td>Newsletter</td></tr></table>',
      ),
    ).rejects.toThrow("square design");
  });
  it("scales a declared 600px square proportionally without cropping", async () => {
    const result = await preparePostcardSquare(
      '<div style="width:600px;height:600px"><p>Tile</p></div>',
    );
    expect(result).toContain(
      "width:600px;height:600px;transform-origin:top left;transform:scale(1.6666666666666667)",
    );
    expect(result).toContain('data-width="1000" data-height="1000"');
  });
  it("rejects external CSS and unsupported images", async () => {
    await expect(
      preparePostcardSquare(
        square('<p style="background:url(https://example.com)">Hi</p>'),
      ),
    ).rejects.toThrow("unsafe styles");
    await expect(
      preparePostcardSquare(
        square('<img src="data:image/svg+xml;base64,PHN2Zz4=">'),
      ),
    ).rejects.toThrow();
  });
});
