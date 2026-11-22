import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

async function adminContext() {
  const { getAdminClient, requireUser } = await import("./supabase-admin.server");
  const user = await requireUser();
  const admin = getAdminClient();
  const role = await admin.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
  if (role.error || !role.data) throw new Error("Forbidden");
  return { user, db: admin as unknown as SupabaseClient };
}

export type AdminCreditRate = { id: string; capability_id: string; duration_s: number; credits: number; active: boolean; provider_cost_verified: boolean; activation_approved: boolean; evidence_note: string | null; created_at: string };

export const listCreditRates = createServerFn({ method: "POST" }).handler(async () => {
  const { db } = await adminContext();
  const result = await db.from("content_credit_rates").select("id,capability_id,duration_s,credits,active,provider_cost_verified,activation_approved,evidence_note,created_at").order("created_at", { ascending: false }).limit(500);
  if (result.error) throw new Error("Credit rates are unavailable.");
  return (result.data ?? []) as AdminCreditRate[];
});

const publishInput = z.object({ capability: z.string().trim().min(1).max(200), duration: z.number().int().min(0).max(3600), credits: z.number().int().min(1).max(1000000), verified: z.boolean(), evidence: z.string().trim().min(5).max(1000) }).strict();
export const publishCreditRate = createServerFn({ method: "POST" }).inputValidator((input: unknown) => publishInput.parse(input)).handler(async ({ data }) => {
  const { user, db } = await adminContext();
  const result = await db.rpc("publish_content_credit_rate", { _user_id: user.id, _capability_id: data.capability, _duration_s: data.duration, _credits: data.credits, _provider_cost_verified: data.verified, _evidence_note: data.evidence });
  if (result.error) throw new Error("Credit rate could not be published.");
  return { id: result.data as string };
});
