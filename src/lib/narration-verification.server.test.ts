import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./openai-quota.server", () => ({ fetchOpenAI: mocks.fetch }));
import { verifyNarration } from "./narration-verification.server";
const prior = process.env.OPENAI_API_KEY;
afterEach(() => { process.env.OPENAI_API_KEY = prior; vi.clearAllMocks(); });
it("requests measured word timestamps and validates them against the script", async () => {
 process.env.OPENAI_API_KEY = "test";
 mocks.fetch.mockResolvedValue(new Response(JSON.stringify({words:[{word:"Hello",start:0.1,end:0.5},{word:"world",start:0.7,end:1.1}]}), {status:200,headers:{"content-type":"application/json"}}));
 expect(await verifyNarration(new ArrayBuffer(44), "Hello, world!", 2)).toEqual([{word:"Hello,",start:0.1,end:0.5},{word:"world!",start:0.7,end:1.1}]);
 const body = mocks.fetch.mock.calls[0]![1].body as FormData;
 expect(body.get("model")).toBe("whisper-1"); expect(body.get("response_format")).toBe("verbose_json"); expect(body.get("timestamp_granularities[]")).toBe("word");
});
it("does not mark missing or mismatched speech as verified", async () => {
 process.env.OPENAI_API_KEY = "test";
 mocks.fetch.mockResolvedValue(new Response(JSON.stringify({words:[{word:"wrong",start:0,end:0.5}]}), {status:200}));
 await expect(verifyNarration(new ArrayBuffer(44), "Hello", 1)).rejects.toThrow("could not be matched");
 mocks.fetch.mockResolvedValue(new Response("unavailable", {status:503}));
 await expect(verifyNarration(new ArrayBuffer(44), "Hello", 1)).rejects.toThrow("verification is unavailable");
});

it("checks extracted export audio and bounds file size", async () => {
 process.env.OPENAI_API_KEY = "test";
 mocks.fetch.mockResolvedValue(new Response(JSON.stringify({words:[{word:"Hello",start:0.1,end:0.5}]}), {status:200}));
 await verifyNarration(new ArrayBuffer(44), "Hello", 1, "export");
 const file = (mocks.fetch.mock.calls[0]![1].body as FormData).get("file") as File;
 expect(file.name).toBe("export.mp3");
 expect(file.type).toBe("audio/mpeg");
 await expect(verifyNarration(new ArrayBuffer(24 * 1024 * 1024 + 1), "Hello", 1, "export")).rejects.toThrow("file size");
});
