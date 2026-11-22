import { describe, expect, it } from "vitest";
import { resolveOutreachSender } from "./outreach-sender.server";

function database(rows: Record<string, any[]>) {
  return { from(table: string) { const filters: Record<string,string> = {}; const q: any = { select: () => q, eq: (key: string, value: string) => { filters[key] = value; return q; }, maybeSingle: async () => ({ data: (rows[table] || []).find(row => Object.entries(filters).every(([k,v]) => row[k] === v)) || null, error: null }) }; return q; } } as any;
}
const identity = { id: "sender", workspace_id: "business-a", sender_name: "Alex", sender_email: "alex@example.com", is_verified: true };
const verifiedDomain = { workspace_id: "business-a", domain: "example.com", status: "verified", sendgrid_domain_id: 123 };
describe("outreach sender ownership", () => {
  it("uses the platform sender without a customer identity", async () => {
    expect(await resolveOutreachSender(database({}), "business-a", null)).toMatchObject({ from_email: "info@autosocials.com", sender_identity_id: null });
  });
  it("rejects a sender belonging to another workspace", async () => {
    await expect(resolveOutreachSender(database({ sender_identities: [identity] }), "business-b", "sender")).rejects.toThrow("not verified");
  });
  it("rejects a provider-verified domain without workspace ownership proof", async () => {
    await expect(resolveOutreachSender(database({ sender_identities: [identity], workspace_domains: [verifiedDomain] }), "business-a", "sender")).rejects.toThrow("Verify ownership");
  });
  it("accepts a sender only when both ownership and provider verification match the workspace", async () => {
    const db = database({ sender_identities: [identity], workspace_domains: [verifiedDomain], outreach_domain_proofs: [{ workspace_id: "business-a", domain: "example.com", verified_at: "2026-11-14" }] });
    expect(await resolveOutreachSender(db, "business-a", "sender")).toMatchObject({ from_email: "alex@example.com", sender_identity_id: "sender" });
  });
});
