import { supabase } from "@/integrations/supabase/client";

/** Browser-side helpers for the Super Admin user switch. Session data stays in this tab only. */
const KEY = "as_impersonation";

export interface ImpersonationState {
  originalAccess: string;
  originalRefresh: string;
  targetName: string;
  eventId: string | null;
}

export function readImpersonation(): ImpersonationState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ImpersonationState) : null;
  } catch {
    return null;
  }
}

export async function beginSwitch(tokenHash: string, targetName: string, eventId: string | null, destination: "/agency" | "/app/create" = "/app/create") {
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  if (!s) throw new Error("Your own session has expired. Sign in again first.");
  // Keep the original super-admin session if we're hopping between users.
  const existing = readImpersonation();
  const state: ImpersonationState = {
    originalAccess: existing?.originalAccess ?? s.access_token,
    originalRefresh: existing?.originalRefresh ?? s.refresh_token,
    targetName,
    eventId,
  };
  sessionStorage.setItem(KEY, JSON.stringify(state));
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error) {
    sessionStorage.removeItem(KEY);
    await supabase.auth.setSession({ access_token: state.originalAccess, refresh_token: state.originalRefresh });
    throw new Error("Couldn't switch into that user.");
  }
  localStorage.removeItem("autosocials_workspace_id");
  if (destination === "/agency") sessionStorage.setItem("autosocials_impersonation_agency_dashboard", "1");
  window.location.assign(destination);
}

export async function returnToSelf(onEnded?: (eventId: string) => Promise<unknown>) {
  const st = readImpersonation();
  if (!st) return;
  // Revoke the borrowed session so it can't be reused, then restore our own.
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  const { error } = await supabase.auth.setSession({ access_token: st.originalAccess, refresh_token: st.originalRefresh });
  sessionStorage.removeItem(KEY);
  if (error) {
    await supabase.auth.signOut();
    window.location.assign("/auth");
    return;
  }
  if (st.eventId && onEnded) await onEnded(st.eventId).catch(() => undefined);
  localStorage.removeItem("autosocials_workspace_id");
  sessionStorage.removeItem("autosocials_impersonation_agency_dashboard");
  window.location.assign("/app/admin");
}
