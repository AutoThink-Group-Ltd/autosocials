import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Super Admin "People": list/delete users and agencies, re-map client workspaces. */
type Ctx = { supabase: any; userId: string };

async function guard(ctx: Ctx) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  if (error || !data) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function allAuthUsers(admin: any) {
  const out: { id: string; email: string; last_sign_in_at: string | null; created_at: string }[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Couldn't load users");
    for (const u of data.users) out.push({ id: u.id, email: u.email ?? "", last_sign_in_at: u.last_sign_in_at ?? null, created_at: u.created_at });
    if (data.users.length < 1000) break;
  }
  return out;
}

async function assertDeletable(admin: any, ctx: Ctx, id: string) {
  if (id === ctx.userId) throw new Error("You can't delete your own account");
  const { data } = await admin.from("user_roles").select("user_id").eq("user_id", id).eq("role", "super_admin");
  if (data?.length) throw new Error("Super admins can't be deleted");
}

export type PeopleData = {
  users: { id: string; email: string; name: string | null; accountType: string; onboarded: boolean; lastSignIn: string | null; createdAt: string; superAdmin: boolean }[];
  agencies: { userId: string; name: string; email: string; clients: number; createdAt: string }[];
  workspaces: { id: string; name: string; createdAt: string; memberCount: number; agencyUserId: string | null; owner: string | null }[];
};

export const listPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PeopleData> => {
    const admin = await guard(context as Ctx);
    const users = await allAuthUsers(admin);
    const [{ data: profiles }, { data: agencies }, { data: roles }, { data: workspaces }, { data: clients }, { data: members }] = await Promise.all([
      admin.from("profiles").select("id, full_name, account_type, onboarding_completed"),
      admin.from("agency_profiles").select("user_id, agency_name, contact_email, created_at"),
      admin.from("user_roles").select("user_id").eq("role", "super_admin"),
      admin.from("workspaces").select("id, name, created_at").order("name"),
      admin.from("agency_clients").select("workspace_id, agency_user_id, status"),
      admin.from("workspace_members").select("workspace_id, user_id, role"),
    ]);
    const ownerMap = new Map<string, string>();
    const memberCounts = new Map<string, number>();
    for (const m of (members ?? []) as any[]) {
      memberCounts.set(m.workspace_id, (memberCounts.get(m.workspace_id) ?? 0) + 1);
      if (m.role === "owner" && !ownerMap.has(m.workspace_id)) ownerMap.set(m.workspace_id, m.user_id);
    }
    const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const supers = new Set((roles ?? []).map((r: any) => r.user_id));
    const emailMap = new Map(users.map((u) => [u.id, u.email]));
    const clientMap = new Map<string, string>();
    for (const c of clients ?? []) if (c.workspace_id && c.status !== "disconnected") clientMap.set(c.workspace_id, c.agency_user_id);
    const counts = new Map<string, number>();
    for (const a of clientMap.values()) counts.set(a, (counts.get(a) ?? 0) + 1);

    return {
      users: users.map((u) => {
        const p: any = pMap.get(u.id);
        return {
          id: u.id, email: u.email, name: p?.full_name || null, accountType: p?.account_type ?? "direct",
          onboarded: !!p?.onboarding_completed, lastSignIn: u.last_sign_in_at, createdAt: u.created_at,
          superAdmin: supers.has(u.id),
        };
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      agencies: (agencies ?? []).map((a: any) => ({
        userId: a.user_id, name: a.agency_name || "Unnamed agency", email: emailMap.get(a.user_id) ?? a.contact_email ?? "",
        clients: counts.get(a.user_id) ?? 0, createdAt: a.created_at,
      })),
      workspaces: (workspaces ?? []).map((w: any) => ({ id: w.id, name: w.name, createdAt: w.created_at, memberCount: memberCounts.get(w.id) ?? 0, agencyUserId: clientMap.get(w.id) ?? null, owner: ownerMap.has(w.id) ? emailMap.get(ownerMap.get(w.id)!) ?? null : null })),
    };
  });

/** Subscription data is read only after the caller's super-admin role is checked. */
export const listPeopleSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await guard(context as Ctx);
    const now = new Date().toISOString();
    const [workspaces, subscriptions, periods] = await Promise.all([
      admin.from("workspaces").select("id,name").order("name"),
      admin.from("workspace_subscriptions").select("workspace_id,plan_key,subscription_status,stripe_subscription_id,current_period_end,courtesy_plan_key,courtesy_plan_expires_at"),
      admin.from("content_credit_periods").select("workspace_id,granted,ends_at,source_key").lte("starts_at", now).gt("ends_at", now),
    ]);
    if (workspaces.error || subscriptions.error || periods.error) throw new Error("Couldn't load subscribers");
    type Subscription = { workspace_id: string; plan_key: string | null; subscription_status: string | null; stripe_subscription_id: string | null; current_period_end: string | null; courtesy_plan_key: string | null; courtesy_plan_expires_at: string | null };
    type Period = { workspace_id: string; granted: number; ends_at: string };
    const byWorkspace = new Map<string, Subscription>(((subscriptions.data ?? []) as Subscription[]).map((s) => [s.workspace_id, s]));
    const creditByWorkspace = new Map<string, Period>(((periods.data ?? []) as Period[]).map((p) => [p.workspace_id, p]));
    return ((workspaces.data ?? []) as { id: string; name: string }[]).map((w) => {
      const s = byWorkspace.get(w.id);
      const p = creditByWorkspace.get(w.id);
      const courtesyActive = s?.courtesy_plan_key && (!s.courtesy_plan_expires_at || s.courtesy_plan_expires_at > now);
      return {
        id: w.id, name: w.name as string,
        plan: (courtesyActive ? s.courtesy_plan_key : s?.plan_key) ?? "free",
        status: s?.subscription_status ?? "free",
        billing: courtesyActive ? "Complimentary" : s?.stripe_subscription_id ? "Stripe" : "No Stripe subscription",
        credits: p?.granted as number | undefined,
        renewal: (p?.ends_at ?? s?.current_period_end ?? null) as string | null,
      };
    });
  });

export const deletePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await guard(context as Ctx);
    await assertDeletable(admin, context as Ctx, data.userId);
    // Agency clean-up first so client workspaces become unassigned, not orphaned.
    await admin.from("agency_client_links").update({ status: "disconnected", disconnected_at: new Date().toISOString() }).eq("agency_user_id", data.userId);
    await admin.from("agency_clients").update({ status: "disconnected", disconnected_at: new Date().toISOString() }).eq("agency_user_id", data.userId);
    await admin.from("agency_profiles").delete().eq("user_id", data.userId);
    const { error } = await admin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(`Delete failed: ${error.message}`);
    return { ok: true };
  });

export const remapWorkspaceAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ workspaceId: z.string().uuid(), agencyUserId: z.string().uuid().nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await guard(context as Ctx);
    const now = new Date().toISOString();
    if (data.agencyUserId) {
      const { data: agency, error: agencyError } = await admin.from("agency_profiles")
        .select("user_id").eq("user_id", data.agencyUserId).maybeSingle();
      if (agencyError || !agency) throw new Error("Agency not found");
    }
    const { data: ws, error: workspaceError } = await admin.from("workspaces")
      .select("name").eq("id", data.workspaceId).maybeSingle();
    if (workspaceError || !ws) throw new Error("Workspace not found");
    const { data: previousClients, error: previousError } = await admin.from("agency_clients")
      .select("agency_user_id").eq("workspace_id", data.workspaceId).eq("status", "active");
    if (previousError) throw new Error(`Re-map failed: ${previousError.message}`);
    const outgoingAgencyIds = [...new Set(((previousClients ?? []) as { agency_user_id: string }[])
      .map((client) => client.agency_user_id)
      .filter((id) => id !== data.agencyUserId))];
    const { data: owners, error: ownersError } = await admin.from("workspace_members")
      .select("user_id").eq("workspace_id", data.workspaceId).eq("role", "owner");
    if (ownersError) throw new Error(`Re-map failed: ${ownersError.message}`);
    const ownerIds: string[] = ((owners ?? []) as { user_id: string }[]).map((member) => member.user_id);
    const remainingOwnerId = ownerIds.find((id) => !outgoingAgencyIds.includes(id));
    if (ownerIds.some((id) => outgoingAgencyIds.includes(id)) && !remainingOwnerId) {
      throw new Error("Add another workspace owner before moving this client.");
    }
    const clearOutgoingSelection = async () => {
      if (outgoingAgencyIds.length === 0) return;
      const { error } = await admin.from("profiles").update({ primary_workspace_id: null })
        .in("id", outgoingAgencyIds).eq("primary_workspace_id", data.workspaceId);
      if (error) throw new Error(`Re-map failed: ${error.message}`);
      const { error: membershipError } = await admin.from("workspace_members").delete()
        .eq("workspace_id", data.workspaceId).eq("role", "owner").in("user_id", outgoingAgencyIds);
      if (membershipError) throw new Error(`Re-map failed: ${membershipError.message}`);
    };
    // Detach from any current agency.
    const { error: clientsError } = await admin.from("agency_clients").update({ status: "disconnected", disconnected_at: now }).eq("workspace_id", data.workspaceId).neq("status", "disconnected");
    if (clientsError) throw new Error(`Re-map failed: ${clientsError.message}`);
    const { error: linksError } = await admin.from("agency_client_links").update({ status: "disconnected", disconnected_at: now }).eq("workspace_id", data.workspaceId).neq("status", "disconnected");
    if (linksError) throw new Error(`Re-map failed: ${linksError.message}`);
    if (!data.agencyUserId) {
      await clearOutgoingSelection();
      return { ok: true };
    }

    const { data: existing } = await admin.from("agency_clients").select("id").eq("workspace_id", data.workspaceId).eq("agency_user_id", data.agencyUserId).maybeSingle();
    let clientId = existing?.id;
    if (clientId) {
      const { error } = await admin.from("agency_clients").update({ status: "active", disconnected_at: null }).eq("id", clientId);
      if (error) throw new Error(`Re-map failed: ${error.message}`);
    } else {
      const { data: ins, error } = await admin.from("agency_clients").insert({
        agency_user_id: data.agencyUserId, workspace_id: data.workspaceId, client_name: ws.name,
        client_user_id: remainingOwnerId ?? null, status: "active", onboarded_at: now,
      }).select("id").single();
      if (error) throw new Error(`Re-map failed: ${error.message}`);
      clientId = ins.id;
    }
    const { data: existingLink, error: lookupError } = await admin.from("agency_client_links")
      .select("id").eq("workspace_id", data.workspaceId).eq("agency_user_id", data.agencyUserId)
      .limit(1).maybeSingle();
    if (lookupError) throw new Error(`Re-map failed: ${lookupError.message}`);
    const linkValues = {
      client_user_id: remainingOwnerId ?? null, agency_client_id: clientId,
      status: "active", connected_at: now, disconnected_at: null,
    };
    const { error: linkError } = existingLink
      ? await admin.from("agency_client_links").update(linkValues).eq("id", existingLink.id)
      : await admin.from("agency_client_links").insert({
          ...linkValues, agency_user_id: data.agencyUserId, workspace_id: data.workspaceId,
        });
    if (linkError) throw new Error(`Re-map failed: ${linkError.message}`);
    await clearOutgoingSelection();
    return { ok: true };
  });
