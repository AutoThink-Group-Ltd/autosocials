import { beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND_CONTEXT_NEEDED, readBrandContext, requireBrandContext } from "@/lib/brand-context.server";
import { getAdminClient } from "@/lib/supabase-admin.server";

const state = vi.hoisted(() => ({ files: 0, docs: 0, website: null as string | null, profileUrl: null as string | null }));
vi.mock("@/lib/profile-dna.server", () => ({ readLeadProfileDna: async () => ({ dna: { name: "Example" } }) }));

class Chain {
  constructor(private table: string) {}
  select() { return this; }
  eq() { return this; }
  maybeSingle() {
    return Promise.resolve({ data: this.table === "workspaces" ? { website: state.website, social_profiles: state.profileUrl ? [{ url: state.profileUrl }] : [] } : null });
  }
  then<T>(onFulfilled: (v: { count: number | null }) => T) {
    const count = this.table === "brand_files" ? state.files : this.table === "dossier_documents" ? state.docs : 0;
    return Promise.resolve({ count }).then(onFulfilled);
  }
}

vi.mock("@/lib/supabase-admin.server", () => ({
  getAdminClient: () => ({ from: (table: string) => new Chain(table) }),
}));

beforeEach(() => {
  state.files = 0;
  state.docs = 0;
  state.website = null;
  state.profileUrl = null;
});

describe("brand context gate", () => {
  it("refuses to plan from nothing and says what to add", async () => {
    expect(await readBrandContext(getAdminClient(), "ws-1")).toMatchObject({ ready: false, files: 0, docs: 0 });
    await expect(requireBrandContext(getAdminClient(), "ws-1")).rejects.toThrow(BRAND_CONTEXT_NEEDED);
  });

  it("lets Sam plan once one brand file is saved", async () => {
    state.files = 1;
    expect(await readBrandContext(getAdminClient(), "ws-1")).toMatchObject({ ready: true, files: 1 });
    expect(await requireBrandContext(getAdminClient(), "ws-1")).toMatchObject({ ready: true });
  });

  it("counts a dossier note on its own as brand context", async () => {
    state.docs = 2;
    expect(await readBrandContext(getAdminClient(), "ws-1")).toMatchObject({ ready: true, docs: 2 });
  });

  it("hands back the saved website trimmed, to prefill a scan", async () => {
    state.website = "  https://examplemailer.com  ";
    expect(await readBrandContext(getAdminClient(), "ws-1")).toMatchObject({ website: "https://examplemailer.com" });
  });
  it("lets Sam plan from a completed Profile DNA with no company website or files", async () => {
    state.profileUrl = "https://www.linkedin.com/in/example/";
    await expect(requireBrandContext(getAdminClient(), "ws-1")).resolves.toMatchObject({ ready: true, files: 0, docs: 0, website: null });
  });
});
