import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { previewInvite, acceptInviteNewUser, acceptInviteSignedIn } from "@/lib/invites.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/Logo";
import { Loader2 } from "lucide-react";

type Preview = Awaited<ReturnType<typeof previewInvite>>;
const WS_KEY = "autosocials_workspace_id";

export default function JoinInvitePage({ token }: { token: string }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const preview = useServerFn(previewInvite);
  const acceptNew = useServerFn(acceptInviteNewUser);
  const acceptSigned = useServerFn(acceptInviteSignedIn);
  const [info, setInfo] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alreadySignedIn = !!(info?.valid && session?.user.email?.toLowerCase() === info.email.toLowerCase());

  useEffect(() => {
    preview({ data: { token } }).then((p) => { setInfo(p); if (p.valid && p.fullName) setName(p.fullName); })
      .catch(() => setInfo({ valid: false, reason: "not_found" } as Preview));
  }, [token]);

  const go = (redirect: string, workspaceId: string | null) => {
    if (workspaceId) localStorage.setItem(WS_KEY, workspaceId);
    else localStorage.removeItem(WS_KEY);
    window.location.assign(redirect); // full load so workspace + role context start fresh
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!info?.valid) return;
    setBusy(true); setError(null);
    try {
      if (info.existing) {
        if (!session || session.user.email?.toLowerCase() !== info.email.toLowerCase()) {
          const { error: err } = await supabase.auth.signInWithPassword({ email: info.email, password });
          if (err) throw new Error("That password didn't work. Use the password for your existing AutoSocials account.");
        }
        const r = await acceptSigned({ data: { token } });
        go(r.redirect, r.workspaceId);
      } else {
        if (password.length < 8) throw new Error("Choose a password with at least 8 characters.");
        const r = await acceptNew({ data: { token, fullName: name, password } });
        const { error: err } = await supabase.auth.signInWithPassword({ email: r.email, password });
        if (err) { navigate({ to: "/auth" }); return; }
        go(r.redirect, r.workspaceId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          {info?.valid && info.logo && <img src={info.logo} alt={info.orgName} className="h-10 w-10 rounded-lg object-cover" />}
        </div>
        {!info ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !info.valid ? (
          <div className="space-y-3">
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">
              {info.reason === "used" ? "This invitation was already used" : info.reason === "expired" ? "This invitation has expired" : "Invitation not found"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {info.reason === "used" ? "Sign in to carry on where you left off." : "Ask whoever invited you to send a fresh invitation."}
            </p>
            <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>Go to sign in</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">You're invited</p>
              <h1 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">
                Join {info.orgName} <span className="font-serif italic font-normal">on AutoSocials</span>
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {alreadySignedIn ? `You're signed in as ${info.email}. Accept to join the team.` : info.existing ? `Sign in as ${info.email} to accept.` : `Set up your account for ${info.email}.`}
              </p>
            </div>
            {!info.existing && (
              <div className="space-y-2">
                <Label htmlFor="join-name">Your name</Label>
                <Input id="join-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
            )}
            {!alreadySignedIn && <div className="space-y-2">
              <Label htmlFor="join-pass">{info.existing ? "Password" : "Choose a password"}</Label>
              <Input id="join-pass" type="password" required minLength={info.existing ? 1 : 8} value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete={info.existing ? "current-password" : "new-password"} />
              {!info.existing && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
            </div>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept invitation"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
