import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { brandedSignUp } from "@/lib/branded-signup";

interface Profile {
  full_name: string;
  avatar_url: string;
  account_type: string;
  onboarding_completed: boolean;
  workspace_id: string | null;
  primary_workspace_id: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, metadata?: Record<string, string>) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  sendMagicLink: (email: string, metadata?: Record<string, string>) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  sendMagicLink: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const initRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, account_type, onboarding_completed, workspace_id, primary_workspace_id")
      .eq("id", userId)
      .single();
    setProfile(data as Profile | null);
  };

  // Session tracking
  const trackLogin = async (userId: string) => {
    const { data } = await supabase
      .from("user_sessions")
      .insert({
        user_id: userId,
        user_agent: navigator.userAgent,
      })
      .select("id")
      .single();
    if (data) sessionIdRef.current = data.id;
  };

  const trackLogout = () => {
    if (!sessionIdRef.current) return;
    // Use sendBeacon for reliability on tab close
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_sessions?id=eq.${sessionIdRef.current}`;
    const body = JSON.stringify({ logged_out_at: new Date().toISOString() });
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      // sendBeacon doesn't support auth headers, so we'll update via supabase client instead
    }
    // Fallback: fire-and-forget update
    supabase
      .from("user_sessions")
      .update({ logged_out_at: new Date().toISOString() })
      .eq("id", sessionIdRef.current)
      .then(() => {});
    sessionIdRef.current = null;
  };

  // Validate session token. Only an explicit auth rejection (401/403) signs the
  // user out — a network blip or a slow backend must never wipe a good session.
  const validateSession = async (currentSession: Session): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.getUser(currentSession.access_token);
      if (error) {
        const status = (error as { status?: number }).status;
        return !(status === 401 || status === 403);
      }
      return !!data.user;
    } catch {
      return true;
    }
  };

  // Process pending client invitation after signup + email verify
  const processClientInvite = async (userId: string, userMeta: Record<string, any>) => {
    const inviteToken = userMeta?.["invite_token"];
    if (!inviteToken) return;

    try {
      // Find the pending invitation
      const { data: found } = await (supabase.rpc("get_client_invitation" as never, { _token: inviteToken } as never).maybeSingle() as unknown as Promise<{ data: any }>);
      const invitation = found?.status === "pending" ? found : null;

      if (!invitation) return;

      // Get the user's auto-created workspace
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId)
        .eq("role", "owner")
        .single();

      const clientWorkspaceId = membership?.workspace_id;

      // Rename workspace to company name if provided
      if (clientWorkspaceId && invitation.client_company_name) {
        await supabase
          .from("workspaces")
          .update({ name: `${invitation.client_company_name}'s Workspace` })
          .eq("id", clientWorkspaceId);
      }

      // Mark invitation as accepted
      const { data: ok } = await supabase.rpc("accept_client_invitation" as never, { _token: inviteToken, _workspace_id: clientWorkspaceId ?? null } as never);
      if (!ok) return;

      // Create agency_clients record
      const { data: clientRecord } = await supabase
        .from("agency_clients")
        .insert({
          agency_user_id: invitation.agency_user_id,
          client_user_id: userId,
          workspace_id: clientWorkspaceId || invitation.workspace_id || "",
          client_name: (invitation.client_company_name ?? invitation.email?.split("@")[0]) ?? "",
          ...(invitation.contact_name != null ? { client_contact_name: invitation.contact_name } : {}),
          client_contact_email: invitation.email ?? "",
          status: "active",
        })
        .select("id")
        .single();

      // Create agency_client_links — links agency to client's workspace
      if (clientWorkspaceId) {
        await supabase.from("agency_client_links").insert({
          agency_user_id: invitation.agency_user_id,
          client_user_id: userId,
          workspace_id: clientWorkspaceId,
          ...(clientRecord?.id !== undefined ? { agency_client_id: clientRecord.id } : {}),
          status: "active",
        });

        // Add agency user as a member of the client's workspace so they can access it
        await supabase.from("workspace_members").insert({
          workspace_id: clientWorkspaceId,
          user_id: invitation.agency_user_id,
          role: "admin",
        });
      }

      // Clear the invite_token from user metadata so it doesn't re-process
      await supabase.auth.updateUser({ data: { "invite_token": null } });

      console.log("[AUTH] Client invitation processed successfully");
    } catch (err) {
      console.error("[AUTH] Error processing client invitation:", err);
    }
  };

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const timeout = setTimeout(() => setLoading(false), 12000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          setTimeout(() => fetchProfile(newSession.user.id), 0);
          if (event === "SIGNED_IN") {
            setTimeout(() => trackLogin(newSession.user.id), 0);
            // Process client invite if present in user metadata
            const meta = newSession.user.user_metadata;
            if (meta?.["invite_token"]) {
              setTimeout(() => processClientInvite(newSession.user.id, meta), 500);
            }
          }
        } else {
          setProfile(null);
        }
        setLoading(false);
        clearTimeout(timeout);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (initialSession) {
        const isValid = await validateSession(initialSession);
        if (!isValid) {
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          clearTimeout(timeout);
          return;
        }
        setSession(initialSession);
        setUser(initialSession.user);
        fetchProfile(initialSession.user.id);
        trackLogin(initialSession.user.id);
      }
      setLoading(false);
      clearTimeout(timeout);
    });

    // Track logout on tab close
    const handleUnload = () => trackLogout();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  const PRODUCTION_ORIGIN = "https://autosocials.com";

  const signUp = useCallback(async (email: string, password: string, metadata?: Record<string, string>) => {
    const { error } = await brandedSignUp(email, password, metadata, PRODUCTION_ORIGIN + "/app");
    return { error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const timeoutMsg = "We can't reach AutoSocials right now. Please try again in a minute.";
    let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"] | null = null;
    let error: any = null;
    try {
      const res = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error(timeoutMsg)), 15000)),
      ]);
      data = res.data; error = res.error;
    } catch (e) {
      return { error: { message: e instanceof Error && e.message === timeoutMsg ? timeoutMsg : timeoutMsg } };
    }
    if (error && /fetch/i.test(error.message ?? "")) error = { message: timeoutMsg };
    // Apply the new session directly so the page moves on even if the
    // auth-change event is slow or missed (e.g. inside the editor preview).
    if (!error && data?.session) {
      setSession(data.session);
      setUser(data.session.user);
      fetchProfile(data.session.user.id);
      setLoading(false);
    }
    return { error };
  }, []);

  const sendMagicLink = useCallback(async (email: string, metadata?: Record<string, string>) => {
    try {
      const { data, error } = await supabase.functions.invoke("send-magic-link", {
        body: { email, type: "magiclink", redirect_to: PRODUCTION_ORIGIN + "/app", metadata },
      });
      if (error) return { error };
      if (data?.error) return { error: { message: data.error } };
      return { error: null };
    } catch (e) {
      return { error: { message: e instanceof Error ? e.message : "Failed to send magic link" } };
    }
  }, []);

  const signOut = useCallback(async () => {
    trackLogout();
    setSession(null);
    setUser(null);
    setProfile(null);
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signUp, signIn, sendMagicLink, signOut, refreshProfile: async () => { if (user) await fetchProfile(user.id); } }}>
      {children}
    </AuthContext.Provider>
  );
};
