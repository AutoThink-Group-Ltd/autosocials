import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./supabase-admin.server", () => ({ supabaseUrl: () => "https://example.supabase.co" }));
import { loadSamSocialEvidence } from "./sam-social-evidence.server";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("optional Virlo in social evidence", () => {
  it("passes the off switch to the existing evidence service", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test"); vi.stubEnv("VIRLO_ENABLED", "false");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ providers: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await loadSamSocialEvidence({ userId: "user", workspaceId: "workspace", includeWebsite: false });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ includeVirlo: false });
  });
  it("continues without external evidence if the service is unavailable", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await loadSamSocialEvidence({ userId: "user", workspaceId: "workspace", includeWebsite: false })).toContain("unavailable");
  });
});
