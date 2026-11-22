import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const workspaceInput = z.object({ workspaceId: z.string().uuid() });
const changeInput = workspaceInput.extend({
  masterEnabled: z.boolean().optional(),
  recipientUserId: z.string().uuid().optional(),
  selected: z.boolean().optional(),
  selfEnabled: z.boolean().optional(),
}).refine((value) => Number(value.masterEnabled !== undefined) + Number(value.selected !== undefined) + Number(value.selfEnabled !== undefined) === 1 && (value.selected === undefined || !!value.recipientUserId), "Choose one setting to update");

async function access(workspaceId: string) {
  const { getAdminClient, requireUser } = await import("./supabase-admin.server");
  const user = await requireUser();
  const admin = getAdminClient();
  return workspaceAccess(admin, user, workspaceId);
}

/** Resolve the manager role against the particular agency linked to this workspace. */
export async function workspaceAccess(admin: ReturnType<typeof import("./supabase-admin.server").getAdminClient>, user: { id: string }, workspaceId: string) {
  const [member, agency, privilegedMember, links] = await Promise.all([
    admin.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle(),
    admin.rpc("is_workspace_agency", { _user_id: user.id, _workspace_id: workspaceId }),
    admin.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspaceId }),
    admin.from("agency_client_links").select("agency_user_id").eq("workspace_id", workspaceId).eq("status", "active"),
  ]);
  if (member.error || agency.error || privilegedMember.error || links.error) throw new Error("Could not check workspace access");
  const checks = agency.data ? await Promise.all((links.data ?? []).map((link) =>
    admin.rpc("is_agency_admin_of", { _user_id: user.id, _agency_owner: link.agency_user_id })
  )) : [];
  if (checks.some((check) => check.error)) throw new Error("Could not check agency permissions");
  const canSelf = !!member.data || !!agency.data || !!privilegedMember.data;
  const canManage = member.data?.role === "owner" || member.data?.role === "admin" ||
    (!member.data && !!privilegedMember.data) ||
    (!!agency.data && checks.some((check) => check.data === true));
  if (!canSelf) throw new Error("Workspace access denied");
  return { admin, user, canSelf, canManage };
}

export const getPublishNotificationSettings = createServerFn({ method: "GET" })
  .inputValidator((value) => workspaceInput.parse(value))
  .handler(async ({ data }) => {
    const { admin, user, canSelf, canManage } = await access(data.workspaceId);
    // New tables are intentionally service-only. Authorization above is mandatory for each request.
    const db = admin as any;
    const [setting, recipients, members] = await Promise.all([
      db.from("publish_notification_settings").select("enabled").eq("workspace_id", data.workspaceId).maybeSingle(),
      db.from("publish_notification_recipients").select("user_id,selected,opted_in").eq("workspace_id", data.workspaceId),
      canManage ? admin.rpc("get_workspace_members_with_email", { _workspace_id: data.workspaceId }) : Promise.resolve({ data: [], error: null }),
    ]);
    if (setting.error || recipients.error || members.error) throw new Error("Could not load notification settings");
    const rows = (recipients.data ?? []) as Array<{ user_id: string; selected: boolean; opted_in: boolean }>;
    const byUser = new Map(rows.map((row) => [row.user_id, row]));
    return {
      masterEnabled: setting.data?.enabled === true,
      canManage,
      canSelf,
      selfEnabled: byUser.get(user.id)?.opted_in === true,
      people: (members.data ?? []).map((member: { user_id: string; full_name: string | null; email: string }) => ({
        userId: member.user_id, name: member.full_name, email: member.email,
        selected: byUser.get(member.user_id)?.selected === true,
        optedIn: byUser.get(member.user_id)?.opted_in === true,
      })),
    };
  });

export const setPublishNotificationSettings = createServerFn({ method: "POST" })
  .inputValidator((value) => changeInput.parse(value))
  .handler(async ({ data }) => {
    const { admin, user, canSelf, canManage } = await access(data.workspaceId);
    let action: "master" | "selection" | "self";
    let target: string | null;
    let value: boolean;
    if (data.masterEnabled !== undefined) {
      if (!canManage) throw new Error("Only workspace or agency managers can change this setting");
      action = "master"; target = null; value = data.masterEnabled;
    } else if (data.selected !== undefined) {
      if (!canManage) throw new Error("Only workspace or agency managers can select recipients");
      action = "selection"; target = data.recipientUserId!; value = data.selected;
    } else {
      if (!canSelf) throw new Error("Workspace access is required to change your preference");
      action = "self"; target = user.id; value = data.selfEnabled!;
    }
    const { error } = await (admin.rpc as any)("set_publish_notification_setting", {
      _workspace_id: data.workspaceId, _actor_id: user.id, _action: action, _user_id: target, _value: value,
    });
    if (error) throw new Error("Could not save notification setting");
    return { ok: true };
  });
