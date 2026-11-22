import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";

const input = z.object({ workspaceId: z.string().uuid() }).strict();

export const getProfileDna = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => input.parse(value))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const allowed = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: data.workspaceId });
    if (allowed.error || !allowed.data) throw new Error("Workspace access denied.");
    const workspace = await admin.from("workspaces").select("social_profiles").eq("id", data.workspaceId).single();
    if (workspace.error) throw new Error("Could not load this workspace.");
    return (await import("./profile-dna.server")).workspaceProfileContext(admin, data.workspaceId, workspace.data.social_profiles);
  });

export const refreshProfileDna = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => input.parse(value))
  .handler(async ({ data }) => {
    const { user, admin, canEdit } = await (await import("./personal-brand.functions")).workspaceBrandContext(data.workspaceId, "any");
    if (!canEdit) throw new Error("Only workspace administrators can refresh Profile DNA.");
    const workspace = await admin.from("workspaces").select("social_profiles").eq("id", data.workspaceId).single();
    const { personalLinkedIn } = await import("./profile-dna");
    if (workspace.error || !personalLinkedIn(workspace.data?.social_profiles)) {
      throw new Error("Add a personal LinkedIn profile to this workspace.");
    }
    (await import("./brand-discovery.server")).queueAutomaticBrandDiscovery(data.workspaceId, user.id, true);
  });
