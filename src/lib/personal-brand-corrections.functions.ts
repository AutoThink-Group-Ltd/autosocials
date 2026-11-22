import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";
const input = z.object({ workspace_id: z.string().uuid() });
const title = "Personal brand corrections (user supplied)";
async function authorize(workspaceId: string) {
  const user = await requireUser(); const admin = getAdminClient();
  const [access, kind, owner, agency, member, staffOwner, staffRole] = await Promise.all([
    admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: workspaceId }),
    admin.from("agency_clients").select("id").eq("workspace_id", workspaceId).eq("workspace_kind", "personal").eq("status", "active").limit(1),
    admin.rpc("is_workspace_owner", { _user_id: user.id, _workspace_id: workspaceId }),
    admin.from("agency_client_links").select("id").eq("agency_user_id", user.id).eq("workspace_id", workspaceId).eq("status", "active").limit(1),
    admin.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle(),
    admin.rpc("agency_staff_owner", { _user_id: user.id }), admin.rpc("agency_staff_role", { _user_id: user.id }),
  ]);
  if (access.error || !access.data || kind.error || !kind.data?.length) throw new Error("Forbidden");
  let staffCanEdit = false;
  if (staffOwner.data && ["owner", "admin"].includes(String(staffRole.data))) { const linked = await admin.from("agency_clients").select("id").eq("agency_user_id", staffOwner.data).eq("workspace_id", workspaceId).eq("status", "active").limit(1); staffCanEdit = !linked.error && !!linked.data?.length; }
  return { user, admin, canEdit: !!owner.data || (!agency.error && !!agency.data?.length) || member.data?.role === "admin" || staffCanEdit };
}
export const getPersonalBrandCorrections = createServerFn({ method: "POST" }).inputValidator((v: unknown) => input.parse(v)).handler(async ({ data }) => {
  const { admin, canEdit } = await authorize(data.workspace_id);
  const result = await admin.from("dossier_documents").select("content").eq("workspace_id", data.workspace_id).eq("source", "paste").eq("title", title).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error("Could not load corrections");
  return { text: (result.data?.content ?? "").slice(0, 4000), canEdit };
});
export const savePersonalBrandCorrections = createServerFn({ method: "POST" }).inputValidator((v: unknown) => input.extend({ text: z.string().trim().max(4000) }).parse(v)).handler(async ({ data }) => {
  const { admin, user, canEdit } = await authorize(data.workspace_id); if (!canEdit) throw new Error("Only workspace managers can edit corrections");
  const existing = await admin.from("dossier_documents").select("id").eq("workspace_id", data.workspace_id).eq("source", "paste").eq("title", title).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw new Error("Could not save corrections");
  const saved = existing.data ? await admin.from("dossier_documents").update({ content: data.text, updated_at: new Date().toISOString() }).eq("id", existing.data.id).eq("workspace_id", data.workspace_id) : await admin.from("dossier_documents").insert({ workspace_id: data.workspace_id, source: "paste", title, content: data.text, created_by: user.id });
  if (saved.error) throw new Error("Could not save corrections"); return { saved: true };
});
