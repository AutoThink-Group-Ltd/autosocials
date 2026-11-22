import { describe, expect, it } from "vitest";
import { extractSubstackNotes, recentPersonalNotes } from "./substack-notes";

describe("Substack public notes", () => {
  it("returns only notes from the requested profile", () => {
    const text = '[Jun 13, 2024](https://substack.com/@kasimjaved/note/c-58938719 "Jun 13, 2024")\n\n[A quoted public article about inflation](https://example.com/p/article)\n\n[Jun 14, 2024](https://substack.com/@someoneelse/note/c-123)';
    const notes = extractSubstackNotes(text, "kasimjaved");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ url: "https://substack.com/@kasimjaved/note/c-58938719", caption: "Shared link: A quoted public article about inflation" });
  });
});

it("keeps only dated personal notes within the past 90 days, newest first", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const notes = [{ date: "2024-06-13T00:00:00Z" }, { date: null }, { date: "2026-11-15T00:00:00Z" }, { date: "2026-09-01T00:00:00Z" }, { date: "2026-11-01T00:00:00Z" }];
  expect(recentPersonalNotes(notes, now).map((note) => note.date)).toEqual(["2026-11-01T00:00:00Z", "2026-09-01T00:00:00Z"]);
});
