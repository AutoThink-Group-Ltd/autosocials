import { describe, expect, it, vi } from "vitest";
import { requestSocialTileImage } from "./social-tile-image.server";

function png(width = 1024, height = 1024) {
  const bytes = Buffer.alloc(45);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes.write("IEND", 37);
  return bytes.toString("base64");
}
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("social tile AI image request", () => {
  it("requests one bounded square PNG and verifies the result", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(json({ data: [{ b64_json: png() }] }));
    const image = await requestSocialTileImage(
      "A bakery counter",
      "user-id",
      "test-key",
      fetcher,
    );
    expect(image.length).toBe(45);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(JSON.parse(init.body)).toMatchObject({
      model: "gpt-image-2.6-sunburst",
      quality: "max",
      size: "1024x1024",
      output_format: "png",
      n: 1,
    });
    expect(init.redirect).toBe("error");
  });
  it("rejects unexpected dimensions and malformed output without a retry", async () => {
    for (const output of [png(512, 512), "not base64!"]) {
      const fetcher = vi
        .fn()
        .mockResolvedValue(json({ data: [{ b64_json: output }] }));
      await expect(
        requestSocialTileImage("test", "user", "key", fetcher),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("treats interruption as an ambiguous request and does not leak the underlying error", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(new Error("sensitive provider error"));
    await expect(
      requestSocialTileImage("test", "user", "key", fetcher),
    ).rejects.toThrow("outcome must be reconciled");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

it("requests portrait artwork using verified reference inputs", async () => {
  const fetcher = vi.fn().mockResolvedValue(json({ output: [{type:"image_generation_call",result:png(1024,1536)}] }));
  await requestSocialTileImage("A studio", "user", "key", fetcher, {aspect:"portrait",treatment:"illustration",composition:"right",medium:"cut paper",accent:"#123456",emphasis:"",typeface:"sans"}, ["data:image/png;base64,abc"]);
  const [url, init] = fetcher.mock.calls[0]!;
  expect(url).toBe("https://api.openai.com/v1/responses");
  const body = JSON.parse(init.body);
  expect(body.tools[0].model).toBe("gpt-image-2.6-sunburst");
  expect(body.tools[0].quality).toBe("max");
  expect(body.tools[0].size).toBe("1024x1536");
  expect(body.input[0].content[1].image_url).toBe("data:image/png;base64,abc");
});
