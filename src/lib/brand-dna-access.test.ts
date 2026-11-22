import { beforeEach, it, expect, vi } from "vitest";
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: () => ({ handler: (fn: unknown) => fn }),
  }),
}));
vi.mock("./supabase-admin.server", () => ({
  requireUser: async () => ({ id: "current-user" }),
  getAdminClient: () => ({ from, rpc }),
}));
vi.mock("./brand-discovery.server", () => ({ publicBrandWebsite: vi.fn() }));
vi.mock("./brand-dna-worker.server", () => ({
  wakeDnaWorker: vi.fn(),
  importPartPath: vi.fn(),
}));
import {
  getBrandDna,
  getBrandDnaProgress,
  prepareBrandDnaImport,
} from "./brand-dna.functions";
const ws = "10000000-0000-4000-8000-000000000001";
beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
});
it("rejects an inaccessible workspace before looking up or signing its assets", async () => {
  rpc.mockResolvedValue({ data: false });
  await expect(getBrandDna({ data: { workspaceId: ws } })).rejects.toThrow(
    "access denied",
  );
  await expect(
    getBrandDnaProgress({ data: { workspaceId: ws } }),
  ).rejects.toThrow("access denied");
  expect(from).not.toHaveBeenCalled();
});

it.each([
  ["queued", false, "building"],
  ["running", false, "building"],
  ["complete", false, "ready"],
  ["complete", true, undefined],
  ["failed", false, "failed"],
])(
  "reports %s Brand DNA progress with confirmation %s",
  async (status, confirmed, expected) => {
    rpc.mockResolvedValue({ data: true });
    from.mockImplementation((table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({
          data:
            table === "brand_dna_runs"
              ? { id: "run", status, phase: "Studying your website" }
              : {
                  active_version: status === "complete" ? "identity" : null,
                  confirmed,
                },
        }),
      };
      return chain;
    });
    const result = await getBrandDnaProgress({ data: { workspaceId: ws } });
    expect(result?.status).toBe(expected);
  },
);
it("keeps read-only workspace members from receiving upload tokens", async () => {
  rpc.mockImplementation(async (name: string) => ({
    data: name === "can_access_workspace" ? true : null,
  }));
  from.mockImplementation((table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: async () => ({ data: [] }),
      single: async () => ({ data: { website: "https://example.org" } }),
      maybeSingle: async () => ({ data: { role: "member" } }),
    };
    if (
      !["workspaces", "workspace_members", "agency_client_links"].includes(
        table,
      )
    )
      throw new Error("Unexpected write or private data read");
    return chain;
  });
  await expect(
    prepareBrandDnaImport({ data: { workspaceId: ws, bytes: 100 } }),
  ).rejects.toThrow("Only workspace managers");
});
