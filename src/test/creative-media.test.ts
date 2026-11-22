import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: network.lookup, default: { lookup: network.lookup } }));
vi.mock("node:https", () => ({ request: network.request, default: { request: network.request } }));
import { downloadCreativeMedia, inspectCreativeMediaBytes, isPublicCreativeMediaAddress } from "../lib/creative-media.server";

const url = "https://cdn.example.com/output.mp4?signed=private";
function mp4() { const b = Buffer.alloc(24); b.writeUInt32BE(24, 0); b.write("ftyp", 4); b.write("isom", 8); b.write("isom", 16); b.write("mp42", 20); return b; }
function png() { const b = Buffer.alloc(45); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b); b.writeUInt32BE(13, 8); b.write("IHDR", 12); b.writeUInt32BE(1, 16); b.writeUInt32BE(1, 20); b.write("IEND", 37); return b; }
function wav() { const b = Buffer.alloc(46); b.write("RIFF", 0); b.writeUInt32LE(38, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.write("data", 36); b.writeUInt32LE(2, 40); return b; }
type FakeOptions = { lookup: (host: string, options: unknown, callback: (err: unknown, address: string, family: number) => void) => void; headers: Record<string, string>; agent: boolean; autoSelectFamily: boolean };
function respond(body: Uint8Array, headers: Record<string, string> = { "content-type": "video/mp4" }, statusCode = 200, chunks?: Uint8Array[]) {
  let requestOptions: FakeOptions | undefined;
  const req = Object.assign(new EventEmitter(), { destroy: vi.fn(), setTimeout: vi.fn(), end: vi.fn() });
  const res = Object.assign(new EventEmitter(), { statusCode, headers, complete: true, destroy: vi.fn() });
  network.request.mockImplementation((_url: URL, options: FakeOptions, callback: (response: typeof res) => void) => {
    requestOptions = options;
    req.end.mockImplementation(() => queueMicrotask(() => { callback(res); for (const chunk of chunks ?? [body]) res.emit("data", Buffer.from(chunk)); res.emit("end"); }));
    return req;
  });
  return { req, res, options: () => requestOptions! };
}
beforeEach(() => { network.lookup.mockReset().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]); network.request.mockReset(); });
afterEach(() => vi.useRealTimers());

describe("creative media public IP checks", () => {
  it("rejects private, reserved, mapped and transition IP addresses", () => {
    for (const address of ["0.0.0.0", "10.1.2.3", "100.64.1.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "192.0.0.9", "192.0.2.1", "192.88.99.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255", "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "fc00::1", "fe80::1", "ff02::1", "2001:db8::1", "2001::1", "2001:20::1", "2002:0808:0808::1", "3fff::1", "fe80::1%eth0", "not-an-ip"]) expect(isPublicCreativeMediaAddress(address), address).toBe(false);
  });
  it("allows public IPv4 and current global IPv6", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888", "2a00:1450:4009:81e::200e"]) expect(isPublicCreativeMediaAddress(address), address).toBe(true);
  });
});

describe("creative media byte verification", () => {
  it("recognizes supported container signatures and expected kinds", () => {
    expect(inspectCreativeMediaBytes(mp4(), "video")).toEqual({ contentType: "video/mp4", extension: "mp4" });
    expect(inspectCreativeMediaBytes(png(), "image").extension).toBe("png");
    expect(inspectCreativeMediaBytes(Buffer.from([255, 216, 255, 224, 255, 217]), "image").extension).toBe("jpg");
    const webp = Buffer.alloc(24); webp.write("RIFF", 0); webp.writeUInt32LE(16, 4); webp.write("WEBPVP8 ", 8);
    expect(inspectCreativeMediaBytes(webp, "image").extension).toBe("webp");
    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84, 119, 101, 98, 109, 0x18, 0x53, 0x80, 0x67, 0xff]);
    expect(inspectCreativeMediaBytes(webm, "video").extension).toBe("webm");
    expect(inspectCreativeMediaBytes(wav(), "audio").extension).toBe("wav");
    expect(inspectCreativeMediaBytes(Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0]), "audio").extension).toBe("mp3");
    const id3 = Buffer.concat([Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]), Buffer.from([0xff, 0xfb, 0x90, 0x64])]);
    expect(inspectCreativeMediaBytes(id3, "audio").extension).toBe("mp3");
  });
  it("rejects HTML, SVG, wrong kinds, unsupported brands and truncated containers", () => {
    for (const bytes of [Buffer.from("<html>error page</html>"), Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), mp4().subarray(0, 12), png().subarray(0, 20), Buffer.from("ID3not real mp3")]) expect(() => inspectCreativeMediaBytes(bytes, "video")).toThrow();
    const avif = mp4(); avif.write("avif", 8); avif.write("avif", 16); avif.write("avif", 20);
    expect(() => inspectCreativeMediaBytes(avif, "video")).toThrow();
    expect(() => inspectCreativeMediaBytes(mp4(), "image")).toThrow();
    expect(() => inspectCreativeMediaBytes(wav().subarray(0, 44), "audio")).toThrow();
  });
});

describe("creative media pinned HTTPS download", () => {
  it("pins vetted DNS instead of resolving again and sends no credentials", async () => {
    const mock = respond(mp4());
    await expect(downloadCreativeMedia(url, { expected: "video" })).resolves.toMatchObject({ contentType: "video/mp4", extension: "mp4" });
    expect(network.lookup).toHaveBeenCalledOnce();
    expect(network.lookup).toHaveBeenCalledWith("cdn.example.com", { all: true, verbatim: true });
    const callback = vi.fn(); mock.options().lookup("cdn.example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(mock.options()).toMatchObject({ agent: false, autoSelectFamily: false });
    expect(Object.keys(mock.options().headers).sort()).toEqual(["Accept", "Accept-Encoding"]);
  });
  it("rejects every DNS answer if any address is nonpublic", async () => {
    for (const records of [[{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }], [{ address: "::ffff:7f00:1", family: 6 }], []]) {
      network.lookup.mockResolvedValueOnce(records);
      await expect(downloadCreativeMedia(url, { expected: "video" })).rejects.toThrow("Creative media could not be downloaded or verified.");
    }
    expect(network.request).not.toHaveBeenCalled();
  });
  it("rejects URL authentication, insecure schemes, ports and private IP literals", async () => {
    for (const bad of ["http://cdn.example.com/a", "https://user:secret@cdn.example.com/a", "https://cdn.example.com:8443/a", "https://127.0.0.1/a", "https://2130706433/a", "https://[::1]/a", "https://metadata.internal/a", "https://cdn.example.com./a"]) await expect(downloadCreativeMedia(bad, { expected: "video" })).rejects.toThrow("Creative media could not be downloaded or verified.");
    expect(network.request).not.toHaveBeenCalled();
  });
  it("rejects redirects without following their destination", async () => {
    const mock = respond(mp4(), { location: "http://169.254.169.254/secret" }, 302);
    await expect(downloadCreativeMedia(url, { expected: "video" })).rejects.toThrow();
    expect(network.request).toHaveBeenCalledOnce(); expect(mock.res.destroy).toHaveBeenCalled();
  });
  it("enforces both declared length and streaming byte limits", async () => {
    respond(mp4(), { "content-type": "video/mp4", "content-length": "1000000" });
    await expect(downloadCreativeMedia(url, { expected: "video", maxBytes: 25 })).rejects.toThrow();
    const mock = respond(mp4(), { "content-type": "video/mp4" }, 200, [mp4().subarray(0, 12), mp4().subarray(12)]);
    await expect(downloadCreativeMedia(url, { expected: "video", maxBytes: 20 })).rejects.toThrow(); expect(mock.res.destroy).toHaveBeenCalled();
  });
  it("checks actual bytes, declared MIME, length and content encoding", async () => {
    for (const [body, headers] of [[mp4(), { "content-type": "text/html" }], [Buffer.from("<html>bad</html>"), { "content-type": "video/mp4" }], [mp4(), { "content-type": "video/mp4", "content-length": "30" }], [mp4(), { "content-type": "video/mp4", "content-encoding": "gzip" }]] as Array<[Buffer, Record<string, string>]>) {
      respond(body, headers); await expect(downloadCreativeMedia(url, { expected: "video" })).rejects.toThrow();
    }
    respond(mp4(), { "content-type": "application/octet-stream" });
    await expect(downloadCreativeMedia(url, { expected: "video" })).resolves.toMatchObject({ contentType: "video/mp4" });
  });
  it("bounds stalled DNS and never includes the signed URL in errors", async () => {
    vi.useFakeTimers(); network.lookup.mockReturnValue(new Promise(() => {}));
    const failure = downloadCreativeMedia(url, { expected: "video" }).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(45001);
    const error = await failure; expect(String(error)).not.toMatch(/signed|private|cdn/); expect(network.request).not.toHaveBeenCalled();
  });
  it("destroys a stalled HTTPS request within the same total deadline", async () => {
    vi.useFakeTimers();
    const req = Object.assign(new EventEmitter(), { destroy: vi.fn(), setTimeout: vi.fn(), end: vi.fn() });
    network.request.mockReturnValue(req);
    const failure = downloadCreativeMedia(url, { expected: "video" }).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(45001);
    expect(await failure).toBeInstanceOf(Error); expect(req.destroy).toHaveBeenCalledOnce();
    expect(network.request).toHaveBeenCalledOnce();
  });
});
