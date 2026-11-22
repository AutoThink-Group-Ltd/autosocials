import { describe, it, expect } from "vitest";
import { dedupeName, hashBlob, matchesFilters, sortFiles, relativeDate } from "@/lib/brand-files";

const f = (name: string, created_at: string, size_bytes = 10, kind = "image") => ({ name, created_at, size_bytes, kind, folder_id: null });
const base = { kind: "all", date: "any" as const, size: "any" as const, folder: "any", term: "" };

describe("brand library", () => {
  it("names a clashing file 'name (2).ext'", () => {
    expect(dedupeName("shot.png", ["shot.png"])).toBe("shot (2).png");
    expect(dedupeName("shot.png", ["shot.png", "Shot (2).png"])).toBe("shot (3).png");
    expect(dedupeName("new.png", ["shot.png"])).toBe("new.png");
  });
  it("same content gives the same fingerprint regardless of name", async () => {
    expect(await hashBlob(new Blob(["abc"]))).toBe(await hashBlob(new Blob(["abc"])));
    expect(await hashBlob(new Blob(["abc"]))).not.toBe(await hashBlob(new Blob(["abd"])));
  });
  it("last 7 days filter excludes older files", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    expect(matchesFilters(f("a.png", "2026-10-15T00:00:00Z"), { ...base, date: "7d" }, "", now)).toBe(true);
    expect(matchesFilters(f("a.png", "2026-10-01T00:00:00Z"), { ...base, date: "7d" }, "", now)).toBe(false);
  });
  it("search matches file type and folder name", () => {
    expect(matchesFilters(f("a.png", "2026-10-01"), { ...base, term: "png" })).toBe(true);
    expect(matchesFilters(f("a.png", "2026-10-01"), { ...base, term: "screenshots" }, "App Screenshots")).toBe(true);
  });
  it("sorts newest first and largest first", () => {
    const l = [f("a", "2026-01-01", 5), f("b", "2026-03-01", 1), f("c", "2026-02-01", 9)];
    expect(sortFiles(l, "newest").map((x) => x.name)).toEqual(["b", "c", "a"]);
    expect(sortFiles(l, "largest").map((x) => x.name)).toEqual(["c", "a", "b"]);
  });
  it("shows Today/Yesterday", () => {
    const now = new Date(2026, 9, 19, 15);
    expect(relativeDate(new Date(2026, 9, 19, 9).toISOString(), now)).toMatch(/^Today/);
    expect(relativeDate(new Date(2026, 9, 18, 9).toISOString(), now)).toMatch(/^Yesterday/);
  });
});
