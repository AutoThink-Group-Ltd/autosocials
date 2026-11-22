import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireUser: vi.fn(), getAdminClient: vi.fn() }));
vi.mock("./supabase-admin.server", () => auth);
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator: () => ({ handler: (handler: unknown) => handler }) }), createServerOnlyFn: (handler: unknown) => handler }));
import { formatPersonalGoalsBrief, getPersonalBrandReport, savePersonalBrandGoals, generatePersonalBrandReport } from "./personal-brand.functions";
import { getBusinessGoals, saveBusinessGoals } from "./business-goals.functions";
import { getPersonalContentIdeas, setPersonalIdeaTrash } from "./personal-content-ideas.functions";
import { savePersonalBrandCorrections } from "./personal-brand-corrections.functions";

const workspace = "11111111-1111-4111-8111-111111111111";
const call = (fn: unknown, data: object) => (fn as (arg: { data: object }) => Promise<unknown>)({ data });
function client(options: { access?: boolean; personal?: boolean; memberRole?: string; agencyOwner?: boolean; goals?: string; linkedin?: string } = {}) {
  const from = vi.fn((table: string) => {
    const result = table === "agency_clients" ? { data: options.personal ? [{ workspace_kind: "personal" }] : [], error: null } : table === "agency_client_links" ? { data: options.agencyOwner ? [{ id: "link" }] : [], error: null } : table === "workspace_members" ? { data: options.memberRole ? { role: options.memberRole } : null, error: null } : table === "workspaces" ? { data: { social_profiles: options.linkedin ? [{ url: options.linkedin }] : [] }, error: null } : table === "dossier_documents" && options.goals ? { data: { id: "goals", content: options.goals, updated_at: "2026-11-22T10:00:00Z" }, error: null } : { data: null, error: null };
    let savedContent: string | undefined;
    const write = (row: { content: string }) => { savedContent = row.content; return chain; };
    const chain: any = { select: () => chain, eq: () => chain, limit: () => chain, order: () => chain, insert: write, update: write, maybeSingle: async () => savedContent !== undefined ? { data: { content: savedContent }, error: null } : result, then: (resolve: (value: unknown) => void) => resolve(result) };
    return chain;
  });
  // The broad agency helper can be true for an ordinary agency employee.
  const rpc = vi.fn(async (name: string) => ({ data: name === "can_access_workspace" ? !!options.access : name === "is_workspace_agency", error: null }));
  return { from, rpc };
}
afterEach(() => vi.resetAllMocks());

describe("personal review workspace authorization", () => {
  it("rejects unsigned users before creating an admin client", async () => {
    auth.requireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(call(getPersonalBrandReport, { workspace_id: workspace })).rejects.toThrow("Unauthorized");
    expect(auth.getAdminClient).not.toHaveBeenCalled();
  });
  it("rejects access to a different workspace before reading its data", async () => {
    const db = client(); auth.requireUser.mockResolvedValue({ id: "user" }); auth.getAdminClient.mockReturnValue(db);
    await expect(call(getPersonalBrandReport, { workspace_id: workspace })).rejects.toThrow("Forbidden");
    expect(db.from).not.toHaveBeenCalled();
  });
  it("does not route business workspaces through personal reports", async () => {
    const db = client({ access: true }); auth.requireUser.mockResolvedValue({ id: "user" }); auth.getAdminClient.mockReturnValue(db);
    await expect(call(getPersonalBrandReport, { workspace_id: workspace })).rejects.toThrow("Personal workspace required");
  });
  it("prevents viewers from changing goals or starting reviews", async () => {
    const db = client({ access: true, personal: true, memberRole: "viewer" }); auth.requireUser.mockResolvedValue({ id: "user" }); auth.getAdminClient.mockReturnValue(db);
    await expect(call(savePersonalBrandGoals, { workspace_id: workspace, knownFor: "", audience: "", goal: "" })).rejects.toThrow("Only workspace managers");
    await expect(call(formatPersonalGoalsBrief, { workspace_id: workspace, brief: "Example brief" })).rejects.toThrow("Only workspace managers");
    await expect(call(generatePersonalBrandReport, { workspace_id: workspace })).rejects.toThrow("Only workspace managers");
    await expect(call(savePersonalBrandCorrections, { workspace_id: workspace, text: "test" })).rejects.toThrow("Only workspace managers");
    await expect(call(setPersonalIdeaTrash, { workspace_id: workspace, idea: { title: "Idea", angle: "Angle" }, trashed: true })).rejects.toThrow("Only workspace managers");
    expect(db.from).not.toHaveBeenCalledWith("dossier_documents");
    expect(db.rpc).not.toHaveBeenCalledWith("is_workspace_agency", expect.anything());
  });
  it.each([{ agencyOwner: true }, { memberRole: "admin" }])("allows an authorized manager to save goals: %o", async (role) => {
    const db = client({ access: true, personal: true, ...role }); auth.requireUser.mockResolvedValue({ id: "user" }); auth.getAdminClient.mockReturnValue(db);
    await expect(call(savePersonalBrandGoals, { workspace_id: workspace, knownFor: "helpful ideas", audience: "", goal: "" })).resolves.toEqual({
      saved: true, goals: { knownFor: "helpful ideas", audience: "", goal: "", brief: "" },
    });
  });
  it("saves a brief alongside legacy answers and keeps it when answers change", async () => {
    const guided = { knownFor: "Practical AI", audience: "Company owners", goal: "Win enquiries" };
    const brief = "## Voice\n\nUse plain British English.";
    auth.requireUser.mockResolvedValue({ id: "user" });
    auth.getAdminClient.mockReturnValueOnce(client({ access: true, personal: true, memberRole: "admin", goals: JSON.stringify(guided) }));
    await expect(call(savePersonalBrandGoals, { workspace_id: workspace, brief })).resolves.toEqual({ saved: true, goals: { ...guided, brief } });
    auth.getAdminClient.mockReturnValueOnce(client({ access: true, personal: true, memberRole: "admin", goals: JSON.stringify({ ...guided, brief }) }));
    await expect(call(savePersonalBrandGoals, { workspace_id: workspace, ...guided, goal: "Teach useful checks" })).resolves.toEqual({
      saved: true, goals: { ...guided, goal: "Teach useful checks", brief },
    });
  });
  it("requires a personal LinkedIn URL before saving personal goals for a lead or company workspace", async () => {
    auth.requireUser.mockResolvedValue({ id: "user" });
    const company = client({ access: true, memberRole: "admin", linkedin: "https://www.linkedin.com/company/example/" });
    auth.getAdminClient.mockReturnValueOnce(company);
    await expect(call(savePersonalBrandGoals, { workspace_id: workspace, brief: "Personal direction" })).rejects.toThrow("Add a personal LinkedIn profile");
    expect(company.from).not.toHaveBeenCalledWith("dossier_documents");
    auth.getAdminClient.mockReturnValueOnce(client({ access: true, memberRole: "admin", linkedin: "https://www.linkedin.com/in/example/" }));
    await expect(call(savePersonalBrandGoals, { workspace_id: workspace, brief: "Personal direction" })).resolves.toMatchObject({ saved: true });
  });
});

describe("business goals workspace authorization", () => {
  it("rejects access to another workspace before reading data", async () => {
    const db = client(); auth.requireUser.mockResolvedValue({ id: "user" }); auth.getAdminClient.mockReturnValue(db);
    await expect(call(getBusinessGoals, { workspace_id: workspace })).rejects.toThrow("Forbidden");
    expect(db.from).not.toHaveBeenCalled();
  });
  it("rejects viewers and personal workspaces before writing goals", async () => {
    const db = client({ access: true, memberRole: "viewer" }); auth.requireUser.mockResolvedValue({ id: "user" }); auth.getAdminClient.mockReturnValue(db);
    const goals = { workspace_id: workspace, knownFor: "", audience: "", goal: "" };
    await expect(call(saveBusinessGoals, goals)).rejects.toThrow("Only workspace managers");
    expect(db.from).not.toHaveBeenCalledWith("dossier_documents");
    const personal = client({ access: true, personal: true, memberRole: "admin" }); auth.getAdminClient.mockReturnValue(personal);
    await expect(call(saveBusinessGoals, goals)).rejects.toThrow("Business workspace required");
  });
  it.each([{ agencyOwner: true }, { memberRole: "admin" }])("allows a linked workspace manager: %o", async role => {
    const db = client({ access: true, ...role }); auth.requireUser.mockResolvedValue({ id: "user" }); auth.getAdminClient.mockReturnValue(db);
    await expect(call(saveBusinessGoals, { workspace_id: workspace, knownFor: "Expertise", audience: "Clients", goal: "Grow" })).resolves.toEqual({ saved: true });
  });
});
