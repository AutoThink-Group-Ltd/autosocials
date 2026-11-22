import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { previewNarrativeReset, resetNarrativeLibrary } from "../lib/narrative-reset.server";

type Row = { id: string; workspace_id: string; narratives: Json; updated_at: string };
const idea = (id: string, extra = {}) => ({ id, title: id, message: "A story", selected: true, ...extra });
function fixture(rows: Row[], options: { fail?: string; conflict?: string } = {}) {
  const calls: { table: string; filters: Record<string, unknown>; write: boolean }[] = [];
  let conflicted = false;
  const sb = { from(table: string) {
    if (table === "agent_messages") {
      const stop = { update: () => stop, eq: () => stop, like: () => stop, select: async () => ({ data: [], error: null }) };
      return stop;
    }
    const filters: Record<string, unknown> = {};
    let patch: Partial<Row> | undefined;
    const record = () => calls.push({ table, filters: { ...filters }, write: !!patch });
    const matches = () => rows.filter((row) => Object.entries(filters).every(([key, value]) => row[key as keyof Row] === value));
    const q = {
      select() {
        if (!patch) return q;
        record();
        if (filters["id"] === options.fail) return Promise.resolve({ data: null, error: { message: "Database unavailable" } });
        if (filters["id"] === options.conflict && !conflicted) {
          conflicted = true;
          const row = matches()[0]!;
          row.updated_at = "concurrent-version";
          row.narratives = (row.narratives as Json[]).map((value) => ({ ...(value as object), concurrent: "preserve me" }));
          return Promise.resolve({ data: [], error: null });
        }
        const found = matches();
        found.forEach((row) => Object.assign(row, patch));
        return Promise.resolve({ data: found.map(({ id }) => ({ id })), error: null });
      },
      eq(key: string, value: unknown) { filters[key] = value; return q; },
      order() { return q; },
      range(from: number, to: number) { record(); return Promise.resolve({ data: matches().slice(from, to + 1), error: null }); },
      update(value: Partial<Row>) { patch = value; return q; },
      maybeSingle() { record(); return Promise.resolve({ data: matches()[0] ?? null, error: null }); },
    };
    return q;
  } } as unknown as SupabaseClient<Database>;
  return { sb, calls, rows };
}
const row = (id: string, narratives: Json, workspace_id = "workspace-a"): Row => ({ id, narratives, workspace_id, updated_at: "version-1" });

describe("narrative library reset", () => {
  it("bins all existing workspace ideas across batches, clears selection and preserves other clients and fields", async () => {
    const f = fixture([
      row("wizard", [idea("one", { production: { provider: "original" } }), idea("two", { libraryStatus: "rejected" }), "legacy"]),
      row("chat", [idea("three")]),
      row("other-client", [idea("private")], "workspace-b"),
    ]);
    expect(await resetNarrativeLibrary(f.sb, "workspace-a")).toEqual({ cleared: 3, failed: false, remaining_batches: [] });
    expect(f.rows[0]!.narratives).toEqual([
      idea("one", { selected: false, libraryStatus: "binned", production: { provider: "original" } }),
      idea("two", { selected: false, libraryStatus: "binned" }), "legacy",
    ]);
    expect(f.rows[2]!.narratives).toEqual([idea("private")]);
    expect(f.calls.every((call) => call.table === "creative_batches" && call.filters["workspace_id"] === "workspace-a")).toBe(true);
    expect(f.calls.filter((call) => call.write).every((call) => call.filters["id"] && call.filters["updated_at"])).toBe(true);
    expect(await resetNarrativeLibrary(f.sb, "workspace-a")).toEqual({ cleared: 0, failed: false, remaining_batches: [] });
  });

  it("counts a reused idea once and includes rejected ideas in the reset scope", async () => {
    const f = fixture([row("one", [idea("source"), idea("rejected", { libraryStatus: "rejected" }), idea("old", { libraryStatus: "binned" })]), row("two", [idea("clone", { origin: "one:source" })])]);
    expect(await previewNarrativeReset(f.sb, "workspace-a")).toEqual({ count: 2, active_count: 1 });
    expect((await resetNarrativeLibrary(f.sb, "workspace-a")).cleared).toBe(2);
  });

  it("rereads an optimistic conflict so concurrent data is preserved", async () => {
    const f = fixture([row("one", [idea("one")])], { conflict: "one" });
    expect((await resetNarrativeLibrary(f.sb, "workspace-a")).failed).toBe(false);
    expect(f.rows[0]!.narratives).toEqual([idea("one", { selected: false, libraryStatus: "binned", concurrent: "preserve me" })]);
  });

  it("reports partial failure without claiming every idea was cleared", async () => {
    const f = fixture([row("one", [idea("one")]), row("two", [idea("two")])], { fail: "two" });
    expect(await resetNarrativeLibrary(f.sb, "workspace-a")).toEqual({ cleared: 1, failed: true, remaining_batches: ["two"] });
    expect(f.rows[1]!.narratives).toEqual([idea("two")]);
  });
});
