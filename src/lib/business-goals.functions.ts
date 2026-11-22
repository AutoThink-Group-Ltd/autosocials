import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { workspaceBrandContext } from "./personal-brand.functions";

const input = z.object({ workspace_id: z.string().uuid() });
const goalsInput = input.extend({ knownFor: z.string().trim().max(1000), audience: z.string().trim().max(1000), goal: z.string().trim().max(1000) });
const title = "Business goals (user supplied)";

export const getBusinessGoals = createServerFn({ method: "POST" }).inputValidator((value: unknown) => input.parse(value)).handler(async ({ data }) => {
  const { admin, canEdit } = await workspaceBrandContext(data.workspace_id);
  const result = await admin.from("dossier_documents").select("content").eq("workspace_id", data.workspace_id).eq("source", "paste").eq("title", title).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error("Could not load business goals");
  try { return { ...goalsInput.omit({ workspace_id: true }).parse(JSON.parse(result.data?.content ?? "null")), canEdit }; }
  catch { return { knownFor: "", audience: "", goal: "", canEdit }; }
});
export const saveBusinessGoals = createServerFn({ method: "POST" }).inputValidator((value: unknown) => goalsInput.parse(value)).handler(async ({ data }) => {
  const { admin, user, canEdit } = await workspaceBrandContext(data.workspace_id);
  if (!canEdit) throw new Error("Only workspace managers can edit goals");
  const existing = await admin.from("dossier_documents").select("id").eq("workspace_id", data.workspace_id).eq("source", "paste").eq("title", title).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw new Error("Could not save business goals");
  const content = JSON.stringify({ knownFor: data.knownFor, audience: data.audience, goal: data.goal });
  const saved = existing.data ? await admin.from("dossier_documents").update({ content, updated_at: new Date().toISOString() }).eq("id", existing.data.id).eq("workspace_id", data.workspace_id).select("content").maybeSingle() : await admin.from("dossier_documents").insert({ workspace_id: data.workspace_id, source: "paste", title, content, created_by: user.id }).select("content").maybeSingle();
  if (saved.error || saved.data?.content !== content) throw new Error("Could not verify goals were saved");
  return { saved: true };
});
