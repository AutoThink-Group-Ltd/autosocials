/* eslint-disable @typescript-eslint/no-explicit-any -- minimal Supabase test double */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deflateSync } from "node:zlib";
import jpeg from "jpeg-js";

const state = vi.hoisted(() => ({ admin: null as any }));
vi.mock("./supabase-admin.server", () => ({
  getAdminClient: () => state.admin,
}));
import {
  decodeTilePng,
  decodeTileImage,
  tilePngToJpeg,
  saveTilesForUser,
  createTileDraftsForUser,
} from "./social-tile-storage.server";
import { saveTilesInput, tileDraftsInput } from "./social-tile-storage";

const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ws = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const fileId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const postId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
function chunk(type: string, data: Buffer) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4);
  data.copy(result, 8);
  return result;
}
function png(height = 1000) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1000, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc(4001 * height))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function filteredPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1000, 0); header.writeUInt32BE(1000, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc(4001 * 1000);
  let previous = Buffer.alloc(4000);
  for (let y = 0; y < 1000; y++) {
    const filter = y % 5, row = Buffer.alloc(4000), offset = y * 4001;
    for (let x = 0; x < 1000; x++) { row[x * 4] = 200; row[x * 4 + 1] = 40; row[x * 4 + 2] = 20; row[x * 4 + 3] = 128; }
    raw[offset] = filter;
    for (let x = 0; x < 4000; x++) {
      const left = x >= 4 ? row[x - 4]! : 0, above = previous[x]!, corner = x >= 4 ? previous[x - 4]! : 0;
      const p = left + above - corner, a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - corner);
      const predictor = filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : filter === 4 ? (a <= b && a <= c ? left : b <= c ? above : corner) : 0;
      raw[offset + 1 + x] = (row[x]! - predictor + 256) & 255;
    }
    previous = row;
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function fakeAdmin(allowed = true) {
  const rows: Record<string, Record<string, any>> = {
    brand_files: {},
    posts: {},
    post_media: {},
  };
  const objects: Record<string, Buffer> = {};
  const admin = {
    rpc: async () => ({ data: allowed, error: null }),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, data: Buffer) => {
          const key = `${bucket}/${path}`;
          if (objects[key]) return { error: { message: "exists" } };
          objects[key] = Buffer.from(data);
          return { error: null };
        },
        download: async (path: string) => {
          const value = objects[`${bucket}/${path}`];
          return value
            ? {
                data: {
                  arrayBuffer: async () => Uint8Array.from(value).buffer,
                },
                error: null,
              }
            : { data: null, error: { message: "missing" } };
        },
      }),
    },
    from: (table: string) => {
      const filters: [string, string][] = [];
      const query: any = {
        select: () => query,
        eq: (key: string, value: string) => {
          filters.push([key, value]);
          return query;
        },
        maybeSingle: async () => ({
          data:
            Object.values(rows[table]!).find((row) =>
              filters.every(([k, v]) => row[k] === v),
            ) ?? null,
          error: null,
        }),
        insert: (data: any) => {
          const error = rows[table]![data.id] ? { message: "duplicate" } : null;
          if (!error) rows[table]![data.id] = data;
          return {
            error,
            select: () => ({
              single: async () => ({ data: error ? null : data, error }),
            }),
            then: (fn: any) => Promise.resolve({ error }).then(fn),
          };
        },
      };
      return query;
    },
  };
  return { admin, rows, objects };
}

describe("social tile storage", () => {
  beforeEach(() => {
    state.admin = null;
  });
  it("validates exact dimensions and real compressed image data", () => {
    const good = png();
    expect(decodeTilePng(good.toString("base64"))).toEqual(good);
    const bad = Buffer.from(good);
    bad.writeUInt32BE(999, 16);
    expect(() => decodeTilePng(bad.toString("base64"))).toThrow();
    expect(() =>
      decodeTilePng(good.subarray(0, 50).toString("base64")),
    ).toThrow();
  });
  it("accepts only a fully decoded 1000 by 1000 JPEG", () => {
    const good = jpeg.encode(
      { width: 1000, height: 1000, data: Buffer.alloc(1000 * 1000 * 4, 128) },
      70,
    ).data;
    expect(decodeTileImage(good.toString("base64"), "image/jpeg")).toEqual(
      good,
    );
    const wrong = jpeg.encode(
      { width: 999, height: 1000, data: Buffer.alloc(999 * 1000 * 4, 128) },
      70,
    ).data;
    expect(() =>
      decodeTileImage(wrong.toString("base64"), "image/jpeg"),
    ).toThrow();
    expect(() =>
      decodeTileImage(good.subarray(0, 80).toString("base64"), "image/jpeg"),
    ).toThrow();
  });
  it("converts all PNG row filters to a full-size JPEG with alpha composited on white", () => {
    const source = filteredPng();
    const encoded = tilePngToJpeg(source);
    const result = jpeg.decode(encoded, { useTArray: true });
    expect([result.width, result.height]).toEqual([1000, 1000]);
    for (let y = 0; y < 5; y++) {
      const offset = (y * 1000 + 500) * 4;
      expect(result.data[offset]).toBeGreaterThan(210);
      expect(result.data[offset + 1]).toBeGreaterThan(140);
      expect(result.data[offset + 1]).toBeLessThan(155);
      expect(result.data[offset + 2]).toBeLessThan(145);
    }
    expect(tilePngToJpeg(source)).toEqual(encoded);
  });
  it("stores provider-compatible JPEG once while retaining the PNG original", async () => {
    const fake = fakeAdmin(); state.admin = fake.admin;
    const source = png();
    await saveTilesForUser(user, { workspace_id: ws, tiles: [{ id: fileId, headline: "Title", mime: "image/png", image_base64: source.toString("base64") }] });
    const draft = { workspace_id: ws, tiles: [{ file_id: fileId, post_id: postId, caption: "Hello" }] };
    expect((await createTileDraftsForUser(user, draft, { providerCompatibleJpeg: true })).results[0]!.ok).toBe(true);
    expect(fake.objects[`brand-assets-private/${ws}/social-tiles/${fileId}.png`]).toEqual(source);
    expect(fake.rows["post_media"]![postId]).toMatchObject({ storage_path: `${ws}/social-tiles/${postId}.jpg`, mime: "image/jpeg", width: 1000, height: 1000 });
    const output = fake.objects[`post-media/${ws}/social-tiles/${postId}.jpg`]!;
    expect(jpeg.decode(output, { useTArray: true }).width).toBe(1000);
    expect((await createTileDraftsForUser(user, draft, { providerCompatibleJpeg: true })).results[0]!.ok).toBe(true);
    expect(fake.objects[`post-media/${ws}/social-tiles/${postId}.jpg`]).toEqual(output);
  });
  it("prepares an uploaded tile with its caption only from its workspace and file path", async () => {
    const fake = fakeAdmin(); state.admin = fake.admin;
    const source = png();
    await saveTilesForUser(user, { workspace_id: ws, tiles: [{ id: fileId, headline: "Title", mime: "image/png", image_base64: source.toString("base64") }] });
    const draft = { workspace_id: ws, tiles: [{ file_id: fileId, post_id: postId, caption: "Approved caption" }] };
    const file = fake.rows.brand_files![fileId]!;
    for (const path of [`${postId}/${user}/${fileId}.png`, `${ws}/../${fileId}.png`, `${ws}/${user}/${postId}.png`]) {
      file.storage_path = path;
      fake.objects[`brand-assets-private/${path}`] = source;
      expect((await createTileDraftsForUser(user, draft)).results[0]!.ok).toBe(false);
    }
    file.storage_path = `${ws}/${user}/${fileId}.png`;
    fake.objects[`brand-assets-private/${file.storage_path}`] = source;
    expect((await createTileDraftsForUser(user, draft)).results[0]!.ok).toBe(true);
    expect(fake.rows.posts![postId]!.caption).toBe("Approved caption");
  });
  it("rejects requests without workspace access", async () => {
    state.admin = fakeAdmin(false).admin;
    await expect(
      saveTilesForUser(user, {
        workspace_id: ws,
        tiles: [
          {
            id: fileId,
            headline: "Title",
            mime: "image/png" as const,
            image_base64: png().toString("base64"),
          },
        ],
      }),
    ).rejects.toThrow("Workspace access denied");
  });
  it("saves immutable files and creates only unscheduled drafts; retry does not duplicate or overwrite", async () => {
    const fake = fakeAdmin();
    state.admin = fake.admin;
    const data = {
      workspace_id: ws,
      tiles: [
        {
          id: fileId,
          headline: "Title",
          mime: "image/png" as const,
          image_base64: png().toString("base64"),
        },
      ],
    };
    expect((await saveTilesForUser(user, data)).results[0]!.ok).toBe(true);
    expect((await saveTilesForUser(user, data)).results[0]!.ok).toBe(true);
    const other = png();
    other[40] = other[40]! ^ 1;
    expect(
      (
        await saveTilesForUser(user, {
          ...data,
          tiles: [
            {
              ...data.tiles[0]!,
              mime: "image/png" as const,
              image_base64: other.toString("base64"),
            },
          ],
        })
      ).results[0]!.ok,
    ).toBe(false);
    const draft = {
      workspace_id: ws,
      tiles: [{ file_id: fileId, post_id: postId, caption: "Hello" }],
    };
    expect((await createTileDraftsForUser(user, draft)).results[0]!.ok).toBe(
      true,
    );
    expect(fake.rows["posts"]![postId]!.status).toBe("draft");
    expect(fake.rows["posts"]![postId]!.scheduled_at).toBeUndefined();
    fake.rows["posts"]![postId]!.status = "scheduled";
    expect((await createTileDraftsForUser(user, draft)).results[0]!.ok).toBe(
      true,
    );
    expect(fake.rows["posts"]![postId]!.status).toBe("scheduled");
    expect(Object.keys(fake.rows["post_media"]!)).toHaveLength(1);
  });
  it("rejects duplicate IDs and limits request size", () => {
    const tile = {
      id: fileId,
      headline: "Title",
      mime: "image/png" as const,
      image_base64: "a",
    };
    expect(
      saveTilesInput.safeParse({ workspace_id: ws, tiles: [tile, tile] })
        .success,
    ).toBe(false);
    const draft = { file_id: fileId, post_id: postId, caption: "" };
    expect(
      tileDraftsInput.safeParse({ workspace_id: ws, tiles: [draft, draft] })
        .success,
    ).toBe(false);
  });
});


describe("portrait social tiles", () => {
  it("validates portrait PNGs and preserves their dimensions when converting to JPEG", () => {
    const source = png(1250);
    expect(decodeTilePng(source.toString("base64"))).toEqual(source);
    const converted = tilePngToJpeg(source);
    const image = jpeg.decode(converted, { useTArray: true, maxResolutionInMP: 1.25 });
    expect([image.width, image.height]).toEqual([1000, 1250]);
    expect(decodeTileImage(converted.toString("base64"), "image/jpeg")).toEqual(converted);
  });
  it("rejects unsupported portrait heights", () => {
    expect(() => decodeTilePng(png(1100).toString("base64"))).toThrow();
  });
});
