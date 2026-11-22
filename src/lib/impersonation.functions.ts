import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Super Admin "switch into user". Every function re-verifies the caller holds
 * the super_admin role through their own RLS-scoped client before touching the
 * privileged client. Super admins can never be switched into.
 */

type Ctx = { supabase: any; userId: string };

async function assertSuperAdmin(ctx: Ctx) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  if (error || !data) throw new Error("Forbidden");
}

async function superAdminIds(admin: any): Promise<Set<string>> {
  const { data, error } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
  if (error) throw new Error("Could not verify protected accounts");
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
}

export const listSwitchableUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ query: z.string().max(120).default(""), accountType: z.literal("agency").optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as Ctx);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const blocked = await superAdminIds(admin);

    const users: { id: string; email: string; last_sign_in_at: string | null }[] = [];
    for (let page = 1; page <= 5; page++) {
      const { data: res, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error("Couldn't load users");
      for (const u of res.users) users.push({ id: u.id, email: u.email ?? "", last_sign_in_at: u.last_sign_in_at ?? null });
      if (res.users.length < 200) break;
    }

    const ids = users.map((u) => u.id);
    const { data: profiles } = await admin.from("profiles").select("id, full_name, account_type, primary_workspace_id").in("id", ids);
    const pMap = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));
    const wsIds = [...new Set(((profiles ?? []) as any[]).map((p) => p.primary_workspace_id).filter(Boolean))];
    const { data: ws } = wsIds.length ? await admin.from("workspaces").select("id, name").in("id", wsIds) : { data: [] };
    const wMap = new Map(((ws ?? []) as any[]).map((w) => [w.id, w.name]));

    const q = data.query.trim().toLowerCase();
    return users
      .filter((u) => !blocked.has(u.id))
      .map((u) => {
        const p = pMap.get(u.id);
        return {
          id: u.id,
          email: u.email,
          name: (p?.full_name as string | null) || null,
          accountType: (p?.account_type as string | null) ?? null,
          workspace: p?.primary_workspace_id ? (wMap.get(p.primary_workspace_id) as string | undefined) ?? null : null,
          lastSignIn: u.last_sign_in_at,
        };
      })
      .filter((u) => !data.accountType || u.accountType === data.accountType)
      .filter((u) => !q || u.email.toLowerCase().includes(q) || (u.name ?? "").toLowerCase().includes(q) || (u.workspace ?? "").toLowerCase().includes(q))
      .sort((a, b) => (b.lastSignIn ?? "").localeCompare(a.lastSignIn ?? ""))
      .slice(0, 50);
  });

export const startImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ targetId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertSuperAdmin(ctx);
    if (data.targetId === ctx.userId) throw new Error("You're already signed in as yourself.");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const blocked = await superAdminIds(admin);
    if (blocked.has(data.targetId)) throw new Error("Super admins can't be switched into.");

    const { data: target, error: tErr } = await admin.auth.admin.getUserById(data.targetId);
    if (tErr || !target.user?.email) throw new Error("That user has no email address to sign in with.");

    const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: target.user.email });
    if (lErr || !link.properties?.hashed_token) throw new Error("Couldn't start the switch. Try again.");

    const { data: event, error: eventError } = await admin
      .from("impersonation_events" as any)
      .insert({ actor_id: ctx.userId, target_id: data.targetId } as any)
      .select("id")
      .single();

    if (eventError || !event?.id) throw new Error("Could not record the switch. Try again.");

    const { data: profile } = await admin.from("profiles").select("full_name, account_type").eq("id", data.targetId).maybeSingle();
    return {
      tokenHash: link.properties.hashed_token,
      destination: profile?.account_type === "agency" ? "/agency" as const : "/app/create" as const,
      targetName: (profile?.full_name as string | null) || target.user.email,
      eventId: ((event as any)?.id as string | undefined) ?? null,
    };
  });

export const endImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertSuperAdmin(ctx);
    await ctx.supabase
      .from("impersonation_events")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", data.eventId)
      .eq("actor_id", ctx.userId);
    return { ok: true };
  });
