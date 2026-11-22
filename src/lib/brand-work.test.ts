import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({ createServerOnlyFn: (fn: any) => fn, createServerFn: () => ({ inputValidator: () => ({ handler: () => null }) }) }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("./dossier.server", () => ({ aiChat: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ requireUser: vi.fn(), getAdminClient: vi.fn() }));
vi.mock("./brand-context.server", () => ({ readBrandContext: vi.fn() }));
vi.mock("./sam.context.server", () => ({ ensureThread: vi.fn() }));
import { runBrandOperation } from "./brand-assets.functions";
import * as brandWork from "./brand-assets.functions";
import { getAdminClient } from "./supabase-admin.server";
const vercelFunctionsAvailable = (() => { try { createRequire(import.meta.url).resolve("@vercel/functions"); return true; } catch { return false; } })();

type Row = Record<string, any>;
function database() {
  const rows: Row[] = [];
  const client = () => ({ from: () => {
    let mode = "select", payload: Row = {}, filter: Row = {};
    const execute = () => {
      if (mode === "insert") {
        if (rows.some((row) => ["workspace_id", "kind", "signature"].every((key) => row[key] === payload[key]))) return { data: null, error: { code: "23505" } };
        const row = { ...payload, updated_at: new Date().toISOString() }; rows.push(row);
        return { data: row, error: null };
      }
      const row = rows.find((item) => Object.entries(filter).every(([key, value]) => item[key] === value));
      if (row && mode === "update") Object.assign(row, payload);
      return { data: row ?? null, error: null };
    };
    const builder: any = {
      insert: (value: Row) => { mode = "insert"; payload = value; return builder; },
      update: (value: Row) => { mode = "update"; payload = value; return builder; },
      select: () => builder,
      match: (value: Row) => { Object.assign(filter, value); return builder; },
      eq: (key: string, value: unknown) => { filter[key] = value; return builder; },
      single: async () => execute(), maybeSingle: async () => execute(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
    };
    return builder;
  } }) as unknown as Parameters<typeof runBrandOperation>[0];
  return { rows, client };
}

beforeAll(() => vi.stubGlobal("crypto", webcrypto));

describe("brand work shared reservations", () => {
  it("runs paid work once when separate server clients request the same task concurrently", async () => {
    const db = database();
    let started!: () => void, finish!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const paid = vi.fn(async () => { started(); await pending; return { strength: 75 }; });
    const first = runBrandOperation(db.client(), "workspace", "profile", "same evidence", paid);
    await ready;
    expect(await runBrandOperation(db.client(), "workspace", "profile", "same evidence", paid)).toEqual({ result: null, busy: true });
    finish();
    expect(await first).toEqual({ result: { strength: 75 }, busy: false });
    expect(paid).toHaveBeenCalledTimes(1);
  });

  it("reuses completed same-input work while allowing a new label slice to claim again", async () => {
    const db = database();
    const paid = vi.fn(async () => ({ labelled: 2 }));
    await runBrandOperation(db.client(), "workspace", "labels", null, paid);
    await runBrandOperation(db.client(), "workspace", "labels", null, paid);
    expect(paid).toHaveBeenCalledTimes(1);
    await runBrandOperation(db.client(), "workspace", "labels", null, paid, false);
    expect(paid).toHaveBeenCalledTimes(2);
  });

  it("does not repeat a task whose old in-flight outcome is unknown", async () => {
    const db = database();
    const paid = vi.fn(async () => ({ ok: true }));
    await runBrandOperation(db.client(), "workspace", "discovery", "source", paid);
    Object.assign(db.rows[0]!, { status: "running", updated_at: "2020-01-01T00:00:00Z" });
    await expect(runBrandOperation(db.client(), "workspace", "discovery", "source", paid)).rejects.toThrow("interrupted");
    expect(paid).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed slice guarded without blocking later unrelated file reading", async () => {
    const db = database();
    const failedPaid = vi.fn(async () => { throw new Error("Provider response interrupted"); });
    const coordinator = () => runBrandOperation(db.client(), "workspace", "labels", null, async () => {
      try { return await runBrandOperation(db.client(), "workspace", "label-slice", { file_ids: ["old-file"] }, failedPaid); }
      catch { return { interrupted: true }; }
    }, false);
    await coordinator();
    expect(db.rows.find((row) => row.kind === "label-slice")).toMatchObject({ status: "failed", result: { file_ids: ["old-file"] } });
    const newPaid = vi.fn(async () => ({ labelled: 1 }));
    await runBrandOperation(db.client(), "workspace", "labels", null, () => runBrandOperation(db.client(), "workspace", "label-slice", { file_ids: ["new-file"] }, newPaid), false);
    expect(newPaid).toHaveBeenCalledTimes(1);
    await coordinator();
    expect(failedPaid).toHaveBeenCalledTimes(1);
  });

  it("reclaims a stale labels coordinator while preserving the uncertain paid slice", async () => {
    const db = database();
    const oldPaid = vi.fn(async () => ({ labelled: 1 }));
    await runBrandOperation(db.client(), "workspace", "labels", null, () => runBrandOperation(db.client(), "workspace", "label-slice", { file_ids: ["old-file"] }, oldPaid), false);
    for (const row of db.rows) Object.assign(row, { status: "running", updated_at: "2020-01-01T00:00:00Z", ...(row.kind === "label-slice" ? { result: { file_ids: ["old-file"] } } : {}) });
    const oldToken = db.rows.find((row) => row.kind === "labels")!.token;
    const newPaid = vi.fn(async () => ({ labelled: 1 }));
    await runBrandOperation(db.client(), "workspace", "labels", null, () => runBrandOperation(db.client(), "workspace", "label-slice", { file_ids: ["new-file"] }, newPaid), false);
    expect(db.rows.find((row) => row.kind === "labels")).toMatchObject({ status: "complete" });
    expect(db.rows.find((row) => row.kind === "labels")!.token).not.toBe(oldToken);
    const uncertain = db.rows.find((row) => row.kind === "label-slice" && row.result?.file_ids?.includes("old-file"));
    expect(uncertain).toMatchObject({ status: "running", result: { file_ids: ["old-file"] } });
    await expect(runBrandOperation(db.client(), "workspace", "label-slice", { file_ids: ["old-file"] }, oldPaid)).rejects.toThrow("interrupted");
    expect(oldPaid).toHaveBeenCalledTimes(1);
    expect(newPaid).toHaveBeenCalledTimes(1);
  });

  it.runIf(vercelFunctionsAvailable)("retains previous automatic website evidence while another scan is still busy", async () => {
    const discoveryModule = "./brand-discovery.server";
    const { runAutomaticBrandDiscovery } = await import(discoveryModule);
    const db = database();
    const remove = vi.fn();
    const admin = { from: (table: string) => {
      if (table === "brand_work_operations") return db.client().from(table as never);
      const rows = table === "workspaces" ? { website: "https://current.example/", social_profiles: [] }
        : table === "brand_files" ? [{ id: "old", source: "auto-scan", extracted_text: "Source: https://previous.example/\n", storage_path: "old.md" }]
        : table === "brand_profiles" ? { workspace_id: "workspace" } : null;
      const query: any = { select: () => query, eq: () => query, in: () => query, limit: () => query, maybeSingle: async () => ({ data: rows }), delete: remove, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows }).then(resolve) };
      return query;
    }, storage: { from: () => ({ remove }) } };
    vi.mocked(getAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof getAdminClient>);
    const scan = vi.spyOn(brandWork, "scanBrandWebsite").mockResolvedValue({ ok: true, busy: true });
    const profile = vi.spyOn(brandWork, "buildBrandProfileForWorkspace");
    await runAutomaticBrandDiscovery("workspace", "user");
    expect(scan).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    expect(profile).not.toHaveBeenCalled();
    scan.mockRestore(); profile.mockRestore();
  });
});
