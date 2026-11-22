import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";

/** Return classifications only for workspaces the caller can access. */
export const getWorkspaceKinds = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => z.object({ workspaceIds: z.array(z.string().uuid()).max(500) }).parse(value))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const ids = [...new Set(data.workspaceIds)];
    const checks = await Promise.all(ids.map(async (id) => {
      const result = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: id });
      if (result.error) throw new Error("Could not check workspace access");
      return result.data ? id : null;
    }));
    const allowed = checks.filter((id): id is string => !!id);
    if (!allowed.length) return [];
    const { data: rows, error } = await admin.from("agency_clients").select("workspace_id,workspace_kind").in("workspace_id", allowed).eq("status", "active");
    if (error) throw new Error("Could not load workspace types");
    return (rows ?? []).filter((row) => ["client", "agency", "personal", "lead"].includes(row.workspace_kind));
  });
