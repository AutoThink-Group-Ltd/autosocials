import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isInviteUsable, canManageAgency, type AgencyStaffRole, type InviteKind } from "./invites";
import { parseClientSocialProfile, SOCIAL_PLATFORMS } from "./client-social-profiles";

const email = z.string().trim().toLowerCase().email().max(255);
const name = z.string().trim().max(100).optional().nullable();

async function server() {
  const { requireUser, getAdminClient } = await import("./supabase-admin.server");
  const { renderEmail, sendViaSendGrid } = await import("./email-layout.server");
  return { requireUser, admin: getAdminClient(), renderEmail, sendViaSendGrid };
}

type Admin = Awaited<ReturnType<typeof server>>["admin"];

async function staffRole(admin: Admin, userId: string): Promise<{ role: AgencyStaffRole | null; owner: string | null }> {
  const [{ data: role }, { data: owner }] = await Promise.all([
    admin.rpc("agency_staff_role", { _user_id: userId }),
    admin.rpc("agency_staff_owner", { _user_id: userId }),
  ]);
  return { role: (role as AgencyStaffRole | null) ?? null, owner: (owner as string | null) ?? null };
}

async function canManageWorkspace(admin: Admin, userId: string, workspaceId: string) {
  const [{ data: owner }, { data: agency }, { data: m }] = await Promise.all([
    admin.rpc("is_workspace_owner", { _user_id: userId, _workspace_id: workspaceId }),
    admin.rpc("is_workspace_agency", { _user_id: userId, _workspace_id: workspaceId }),
    admin.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
  ]);
  return !!owner || !!agency || m?.role === "admin";
}

async function sendInviteEmail(s: Awaited<ReturnType<typeof server>>, to: { email: string; name?: string | null }, org: string, inviter: string | null, token: string, kind: InviteKind) {
  // Never construct a secret-bearing invite link from a request Origin header.
  const url = `https://autosocials.com/join/${encodeURIComponent(token)}`;
  const first = to.name?.split(" ")[0];
  const { html, text } = s.renderEmail({
    preheader: `Accept your invitation to ${org} on AutoSocials.`,
    heading: `Join ${org}`,
    accent: "on AutoSocials",
    intro: [
      `${first ? `Hi ${first}, ` : ""}${inviter ? `${inviter} has` : `${org} has`} invited you to join ${kind === "agency" ? `the ${org} agency team` : org} on AutoSocials.`,
      "Use the button below to accept. If you already have an account, sign in with the email address that received this invitation; otherwise, you'll create your account securely.",
      "This invitation is for you, works once and expires after 7 days.",
    ],
    ctaLabel: "Join the team",
    ctaUrl: url,
    footerNote: "Weren't expecting this? You can ignore this email and nothing will happen.",
  });
  await s.sendViaSendGrid({ to: to.email, subject: `You've been invited to join ${org} on AutoSocials`, html, text, categories: ["invite", kind], tracking: false });
}

async function inviterName(admin: Admin, userId: string) {
  const { data } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return data?.full_name || null;
}

async function agencyName(admin: Admin, owner: string) {
  const { data } = await admin.from("agency_profiles").select("agency_name, agency_logo_url").eq("user_id", owner).maybeSingle();
  return { name: data?.agency_name || "your agency", logo: data?.agency_logo_url || null };
}

async function validateAgencyClientScope(admin: Admin, owner: string, role: string, access: string, clientIds: string[]) {
  if (role !== "member" || access !== "specific") return;
  const ids = [...new Set(clientIds)];
  if (!ids.length) throw new Error("Choose at least one client.");
  const { data, error } = await admin.from("agency_clients").select("id").eq("agency_user_id", owner).eq("status", "active").in("id", ids);
  if (error || data?.length !== ids.length) throw new Error("Choose active clients from your agency.");
}

/* ---------- Agency team ---------- */

export const createAgencyInvite = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    email, fullName: name, role: z.enum(["admin", "member"]),
    clientAccess: z.enum(["all", "specific"]), clientIds: z.array(z.string().uuid()).max(500).default([]),
  }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const user = await s.requireUser();
    const { role, owner } = await staffRole(s.admin, user.id);
    if (!owner || !canManageAgency(role)) throw new Error("Only agency owners and admins can invite teammates.");
    await validateAgencyClientScope(s.admin, owner, data.role, data.clientAccess, data.clientIds);
    const { data: existing } = await s.admin.from("agency_employees").select("id").eq("agency_user_id", owner).ilike("email", data.email).eq("is_active", true).maybeSingle();
    if (existing) throw new Error("That person is already on your team.");
    await s.admin.from("agency_employee_invitations").update({ status: "cancelled" }).eq("agency_user_id", owner).ilike("email", data.email).eq("status", "pending");
    const { data: inv, error } = await s.admin.from("agency_employee_invitations").insert({
      agency_user_id: owner, email: data.email, full_name: data.fullName || null, role: data.role,
      client_access: data.role === "admin" ? "all" : data.clientAccess,
      client_ids: data.role === "member" && data.clientAccess === "specific" ? data.clientIds : null,
      status: "pending", sent_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    }).select("id, token").single();
    if (error || !inv?.token) throw new Error("Couldn't create the invitation.");
    const org = await agencyName(s.admin, owner);
    try { await sendInviteEmail(s, { email: data.email, name: data.fullName ?? null }, org.name, await inviterName(s.admin, user.id), inv.token, "agency"); }
    catch { await s.admin.from("agency_employee_invitations").update({ status: "cancelled" }).eq("id", inv.id).eq("status", "pending"); throw new Error("The invitation email could not be sent. Please try again."); }
    return { ok: true };
  });

export const updateAgencyMember = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    id: z.string().uuid(), role: z.enum(["admin", "member"]),
    clientAccess: z.enum(["all", "specific"]), clientIds: z.array(z.string().uuid()).max(500).default([]),
  }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const user = await s.requireUser();
    const { role, owner } = await staffRole(s.admin, user.id);
    if (!owner || !canManageAgency(role)) throw new Error("Not allowed.");
    await validateAgencyClientScope(s.admin, owner, data.role, data.clientAccess, data.clientIds);
    const { error } = await s.admin.from("agency_employees").update({
      role: data.role, client_access: data.role === "admin" ? "all" : data.clientAccess,
      client_ids: data.role === "member" && data.clientAccess === "specific" ? data.clientIds : null,
      updated_at: new Date().toISOString(),
    }).eq("id", data.id).eq("agency_user_id", owner);
    if (error) throw new Error("Couldn't update this teammate.");
    return { ok: true };
  });

/* ---------- Workspace people ---------- */

export const createWorkspaceInvite = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), email, fullName: name, role: z.enum(["admin", "member"]) }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const user = await s.requireUser();
    if (!(await canManageWorkspace(s.admin, user.id, data.workspaceId))) throw new Error("Only owners, admins or the managing agency can invite people.");
    const existingId = (await s.admin.rpc("find_user_id_by_email", { _email: data.email })).data as string | null;
    if (existingId) {
      const { data: m } = await s.admin.from("workspace_members").select("id").eq("workspace_id", data.workspaceId).eq("user_id", existingId).maybeSingle();
      if (m) throw new Error("That person is already in this workspace.");
    }
    await s.admin.from("workspace_invitations").update({ status: "cancelled" }).eq("workspace_id", data.workspaceId).ilike("email", data.email).eq("status", "pending");
    const { data: inv, error } = await s.admin.from("workspace_invitations").insert({
      workspace_id: data.workspaceId, email: data.email, full_name: data.fullName || null, role: data.role, invited_by: user.id,
    }).select("token").single();
    if (error || !inv) throw new Error("Couldn't create the invitation.");
    const { data: ws } = await s.admin.from("workspaces").select("name").eq("id", data.workspaceId).single();
    await sendInviteEmail(s, { email: data.email, name: data.fullName ?? null }, ws?.name || "a workspace", await inviterName(s.admin, user.id), inv.token, "workspace");
    return { ok: true };
  });

/* ---------- Resend / cancel ---------- */

const ref = z.object({ kind: z.enum(["agency", "workspace"]), id: z.string().uuid() });

async function authoriseInvite(s: Awaited<ReturnType<typeof server>>, userId: string, kind: InviteKind, id: string) {
  if (kind === "agency") {
    const { data: inv } = await s.admin.from("agency_employee_invitations").select("*").eq("id", id).maybeSingle();
    if (!inv) throw new Error("Invitation not found.");
    const { data: ok } = await s.admin.rpc("is_agency_admin_of", { _user_id: userId, _agency_owner: inv.agency_user_id });
    if (!ok) throw new Error("Not allowed.");
    return { inv, org: (await agencyName(s.admin, inv.agency_user_id)).name };
  }
  const { data: inv } = await s.admin.from("workspace_invitations").select("*").eq("id", id).maybeSingle();
  if (!inv) throw new Error("Invitation not found.");
  if (!(await canManageWorkspace(s.admin, userId, inv.workspace_id))) throw new Error("Not allowed.");
  const { data: ws } = await s.admin.from("workspaces").select("name").eq("id", inv.workspace_id).single();
  return { inv, org: ws?.name || "a workspace" };
}

export const resendInvite = createServerFn({ method: "POST" })
  .inputValidator((d) => ref.parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const user = await s.requireUser();
    const { inv, org } = await authoriseInvite(s, user.id, data.kind, data.id);
    if (inv.status !== "pending" || !inv.token) throw new Error("This invitation is no longer pending.");
    const table = data.kind === "agency" ? "agency_employee_invitations" : "workspace_invitations";
    await s.admin.from(table).update({ sent_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 864e5).toISOString() }).eq("id", data.id);
    await sendInviteEmail(s, { email: inv.email, name: inv.full_name }, org, await inviterName(s.admin, user.id), inv.token, data.kind);
    return { ok: true };
  });

export const cancelInvite = createServerFn({ method: "POST" })
  .inputValidator((d) => ref.parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const user = await s.requireUser();
    await authoriseInvite(s, user.id, data.kind, data.id);
    const table = data.kind === "agency" ? "agency_employee_invitations" : "workspace_invitations";
    await s.admin.from(table).update({ status: "cancelled" }).eq("id", data.id);
    return { ok: true };
  });

/* ---------- Accept (public, token-gated) ---------- */

async function findInvite(admin: Admin, token: string) {
  const { data: a } = await admin.from("agency_employee_invitations").select("*").eq("token", token).maybeSingle();
  if (a) {
    const org = await agencyName(admin, a.agency_user_id);
    return { kind: "agency" as const, inv: a, orgName: org.name, logo: org.logo };
  }
  const { data: w } = await admin.from("workspace_invitations").select("*").eq("token", token).maybeSingle();
  if (w) {
    const { data: ws } = await admin.from("workspaces").select("name, logo_url").eq("id", w.workspace_id).maybeSingle();
    return { kind: "workspace" as const, inv: w, orgName: ws?.name || "a workspace", logo: (ws as { logo_url?: string | null } | null)?.logo_url ?? null };
  }
  return null;
}

const tokenSchema = z.string().trim().min(16).max(128);

export const previewInvite = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { getAdminClient } = await import("./supabase-admin.server");
    const admin = getAdminClient();
    const found = await findInvite(admin, data.token);
    if (!found) return { valid: false as const, reason: "not_found" };
    const usable = isInviteUsable(found.inv.status, found.inv.expires_at);
    if (data.token && found.kind === "agency") {
      await admin.from("agency_employee_invitations").update({ link_opened_count: (found.inv.link_opened_count ?? 0) + 1, link_last_opened_at: new Date().toISOString() }).eq("id", found.inv.id);
    }
    if (!usable) return { valid: false as const, reason: found.inv.status === "accepted" ? "used" : "expired", orgName: found.orgName };
    const existing = !!(await admin.rpc("find_user_id_by_email", { _email: found.inv.email })).data;
    return { valid: true as const, kind: found.kind, orgName: found.orgName, logo: found.logo, email: found.inv.email, fullName: found.inv.full_name, existing };
  });

async function attach(admin: Admin, found: NonNullable<Awaited<ReturnType<typeof findInvite>>>, userId: string, fullName: string | null) {
  const now = new Date().toISOString();
  if (found.kind === "agency") {
    const i = found.inv;
    const { error } = await (admin as unknown as SupabaseClient).rpc("accept_agency_team_invitation", { _token: i.token, _user_id: userId, _full_name: fullName });
    if (error) throw new Error(error.message.includes("another agency") ? "This account already belongs to another agency. Contact your administrator." : "Couldn't accept this invitation. It may have expired or already been used.");
    return "/agency";
  }
  const i = found.inv;
  const { data: m } = await admin.from("workspace_members").select("id").eq("workspace_id", i.workspace_id).eq("user_id", userId).maybeSingle();
  if (!m) {
    const { error } = await admin.from("workspace_members").insert({ workspace_id: i.workspace_id, user_id: userId, role: i.role });
    if (error) throw new Error("Couldn't add you to the workspace.");
  }
  const { data: prof } = await admin.from("profiles").select("account_type, primary_workspace_id").eq("id", userId).maybeSingle();
  await admin.from("profiles").update({
    ...(prof?.account_type === "invited" || !prof?.account_type ? { account_type: "direct" } : {}),
    ...(prof?.primary_workspace_id ? {} : { primary_workspace_id: i.workspace_id, workspace_id: i.workspace_id }),
  }).eq("id", userId);
  await admin.from("workspace_invitations").update({ status: "accepted", accepted_at: now, accepted_user_id: userId }).eq("id", i.id);
  return "/app";
}

/** New person: creates the account with their chosen password (email proven by the link) and joins. */
export const acceptInviteNewUser = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: tokenSchema, fullName: z.string().trim().min(1).max(100), password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data }) => {
    const { getAdminClient } = await import("./supabase-admin.server");
    const admin = getAdminClient();
    const found = await findInvite(admin, data.token);
    if (!found || !isInviteUsable(found.inv.status, found.inv.expires_at)) throw new Error("This invitation link has expired or was already used.");
    if ((await admin.rpc("find_user_id_by_email", { _email: found.inv.email })).data) throw new Error("You already have an account. Sign in to accept.");
    const { data: created, error } = await admin.auth.admin.createUser({
      email: found.inv.email, password: data.password, email_confirm: true,
      user_metadata: { full_name: data.fullName, account_type: "invited" },
    });
    if (error || !created.user) throw new Error("Couldn't create your account. Please try again.");
    const redirect = await attach(admin, found, created.user.id, data.fullName);
    return { email: found.inv.email, redirect, workspaceId: found.kind === "workspace" ? found.inv.workspace_id : null };
  });

/** Existing account: must be signed in as the invited email. */
export const acceptInviteSignedIn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const user = await s.requireUser();
    const found = await findInvite(s.admin, data.token);
    if (!found || !isInviteUsable(found.inv.status, found.inv.expires_at)) throw new Error("This invitation link has expired or was already used.");
    if ((user.email ?? "").toLowerCase() !== found.inv.email.toLowerCase()) throw new Error(`This invitation is for ${found.inv.email}. Sign in with that email.`);
    const redirect = await attach(s.admin, found, user.id, (user.user_metadata?.["full_name"] as string | undefined) ?? null);
    return { redirect, workspaceId: found.kind === "workspace" ? found.inv.workspace_id : null };
  });

/* ---------- Agency clients (create without inviting) ---------- */

export const createAgencyClient = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    name: z.string().trim().min(1).max(100),
    kind: z.enum(["client", "agency", "personal"]).default("client"),
    website: z.string().trim().max(255).optional().nullable(),
    contactName: name,
    inviteEmail: email.optional().nullable(),
    socialProfiles: z.array(z.object({
      platform: z.enum(SOCIAL_PLATFORMS),
      value: z.string().trim().min(1).max(500),
    })).optional().default([]),
  }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const user = await s.requireUser();
    const { role, owner } = await staffRole(s.admin, user.id);
    if (!owner || !canManageAgency(role)) throw new Error("Only agency owners and admins can add clients.");
    const socialProfiles = data.socialProfiles.map(({ value, platform }) => {
      const parsed = parseClientSocialProfile(value, platform);
      if (!parsed || parsed.platform !== platform) throw new Error("Check the social profiles and their platforms.");
      return parsed;
    });
    const now = new Date().toISOString();
    const { data: ws, error: wErr } = await s.admin.from("workspaces")
      .insert({ name: data.name, website: data.website || null, contact_name: data.contactName || null, social_profiles: socialProfiles })
      .select("id").single();
    if (wErr || !ws) throw new Error("Couldn't create the client workspace.");
    const { data: client, error: cErr } = await s.admin.from("agency_clients").insert({
      agency_user_id: owner, workspace_id: ws.id, client_name: data.name, workspace_kind: data.kind,
      client_contact_name: data.contactName || null, client_contact_email: data.inviteEmail || null,
      social_profiles: socialProfiles,
      status: "active", onboarded_at: now,
    }).select("id").single();
    if (cErr || !client) { await s.admin.from("workspaces").delete().eq("id", ws.id); throw new Error("Couldn't add the client."); }
    const { error: lErr } = await s.admin.from("agency_client_links").insert({
      agency_user_id: owner, client_user_id: null, workspace_id: ws.id, agency_client_id: client.id, status: "active", connected_at: now,
    });
    if (lErr) throw new Error("Client added but couldn't link it to your agency.");
    let invited = false;
    if (data.inviteEmail) {
      const { data: inv } = await s.admin.from("workspace_invitations").insert({
        workspace_id: ws.id, email: data.inviteEmail, full_name: data.contactName || null, role: "admin", invited_by: user.id,
      }).select("token").single();
      if (inv) { await sendInviteEmail(s, { email: data.inviteEmail, name: data.contactName ?? null }, data.name, await inviterName(s.admin, user.id), inv.token, "workspace"); invited = true; }
    }
    if (data.website || socialProfiles.length) {
      const { queueAutomaticBrandDiscovery } = await import("./brand-discovery.server");
      queueAutomaticBrandDiscovery(ws.id, user.id);
    }
    return { workspaceId: ws.id, clientName: data.name, website: data.website || null, socialProfiles, invited };
  });
