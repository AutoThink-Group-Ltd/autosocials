import { validateAgencyDetails } from "@/lib/agency-signup";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Navigate, useSearchParams, Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { Mail, ArrowRight, User, Building2, Check } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { AppIcon } from "@/components/brand/AppIcon";
import { MODULES } from "@/brand/tokens";
import samPortrait from "@/assets/sam-portrait.jpg";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { landingPath } from "@/lib/landing";
import { CheckInboxScreen } from "@/features/auth/CheckInboxScreen";

type AuthTab = "signin" | "signup";
type SignInMode = "password" | "magic-link" | "forgot";
type SignUpMode = "password" | "magic-link";
type AccountType = "direct" | "agency";

const AuthPage = () => {
  const { session, loading, profile, signUp, signIn, sendMagicLink } = useAuth();
  const { isSuperAdmin, isLoading: adminLoading } = useSuperAdmin();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<AuthTab>("signin");
  const [signInMode, setSignInMode] = useState<SignInMode>("password");
  const [signUpMode, setSignUpMode] = useState<SignUpMode>("password");
  const [accountType, setAccountType] = useState<AccountType>("direct");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [agencyWebsite, setAgencyWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [magicLinkCooldown, setMagicLinkCooldown] = useState(0);
  const [sentTo, setSentTo] = useState<{ email: string; kind: "verify" | "magic" } | null>(null);

  const inviteToken = searchParams.get("invite");
  const employeeToken = searchParams.get("employee_token");
  const prefilledEmail = searchParams.get("email");
  const prefilledName = searchParams.get("name");

  useEffect(() => {
    if (prefilledEmail) setEmail(prefilledEmail);
    if (prefilledName) setFullName(prefilledName);
    if (inviteToken) {
      setTab("signup");
    }
    if (employeeToken) {
      setTab("signup");
      setAccountType("agency");
    }
  }, [prefilledEmail, prefilledName, inviteToken, employeeToken]);

  useEffect(() => {
    if (magicLinkCooldown <= 0) return;
    const interval = setInterval(() => setMagicLinkCooldown((c) => c - 1), 1000);
    return () => clearInterval(interval);
  }, [magicLinkCooldown]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (session && profile) {
    if (adminLoading) {
      return (
        <div className="h-screen flex items-center justify-center bg-background">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    return <Navigate to={landingPath({ isSuperAdmin, accountType: profile.account_type, primaryWorkspaceId: profile.primary_workspace_id })} replace />;
  }
  if (session && !profile) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Handle invite acceptance after signup
  const handlePostSignupInvites = async (userId: string) => {
    // Team invitation
    if (inviteToken) {
      // Mark workspace invitation as accepted — the actual invite acceptance
      // would be handled by an edge function in production
      console.log("Team invite token detected:", inviteToken);
    }

    // Employee invitation
    if (employeeToken) {
      try {
        // Find the invitation
        const { data: invitation } = await supabase
          .from("agency_employee_invitations")
          .select("*")
          .eq("token", employeeToken)
          .eq("status", "pending")
          .single();

        if (invitation) {
          // Mark invitation accepted
          await supabase
            .from("agency_employee_invitations")
            .update({
              status: "accepted",
              accepted_at: new Date().toISOString(),
              accepted_user_id: userId,
            })
            .eq("id", invitation.id);

          // Create agency employee record
          await supabase
            .from("agency_employees")
            .insert({
              agency_user_id: invitation.agency_user_id,
              employee_user_id: userId,
              invitation_id: invitation.id,
              full_name: fullName || invitation.full_name,
              email: email,
              role: invitation.role || "employee",
              client_access: invitation.client_access || "all",
              client_ids: invitation.client_ids,
            });

          // Set profile to agency type
          await supabase
            .from("profiles")
            .update({ account_type: "agency" })
            .eq("id", userId);

          // Add employee to accessible client workspaces
          if (invitation.client_access === "all") {
            const { data: clientLinks } = await supabase
              .from("agency_client_links")
              .select("workspace_id")
              .eq("agency_user_id", invitation.agency_user_id)
              .eq("status", "active");

            if (clientLinks) {
              for (const link of clientLinks) {
                await supabase
                  .from("workspace_members")
                  .upsert({
                    workspace_id: link.workspace_id,
                    user_id: userId,
                    role: "member",
                  }, { onConflict: "user_id,workspace_id" });
              }
            }
          }
        }
      } catch (err) {
        console.error("Error processing employee invitation:", err);
      }
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) toast.error(error.message);
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (magicLinkCooldown > 0) return;
    setSubmitting(true);
    const { error } = await sendMagicLink(email);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSentTo({ email, kind: "magic" });
      setMagicLinkCooldown(30);
    }
  };

  const agencyMeta = (): Record<string, string> | null => {
    if (accountType !== "agency") return {};
    const v = validateAgencyDetails(agencyName, agencyWebsite);
    if (!v.ok) { toast.error(v.error); return null; }
    return { agency_name: v.agency_name, agency_website: v.agency_website };
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    const extra = agencyMeta();
    if (!extra) return;
    setSubmitting(true);
    const metadata: Record<string, string> = { full_name: fullName, account_type: accountType, ...extra };
    // Store invite token in user metadata so it persists through email verification
    if (inviteToken) metadata["invite_token"] = inviteToken;
    const { error } = await signUp(email, password, metadata);
    setSubmitting(false);
    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        toast.error("This email is already registered. Switching to sign in...");
        setTab("signin");
        return;
      }
      toast.error(error.message);
    } else {
      setSentTo({ email, kind: "verify" });
    }
  };

  const handleSignupMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (magicLinkCooldown > 0) return;
    const extra = agencyMeta();
    if (!extra) return;
    setSubmitting(true);
    const { error } = await sendMagicLink(email, { full_name: fullName, account_type: accountType, ...extra });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSentTo({ email, kind: "verify" });
      setMagicLinkCooldown(30);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Enter your email first"); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-magic-link", {
        body: { email, type: "recovery", redirect_to: window.location.origin + "/reset-password" },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Failed to send reset email");
      } else {
        toast.success("Password reset email sent!");
      }
    } catch (err) {
      toast.error("Failed to send reset email");
    }
    setSubmitting(false);
  };

  const field = "h-11 rounded-[10px] border-border-control bg-surface text-base md:text-[15px] focus-visible:ring-ring";
  const label = "text-[13px] font-medium text-ink";
  const primaryBtn = "h-11 w-full rounded-[10px] bg-ink text-[14px] font-semibold text-inverse hover:bg-ink-hover";
  const secondaryBtn = "h-11 w-full rounded-[10px] border-border-control bg-surface text-[14px] font-semibold text-ink hover:bg-surface-subtle";
  const Divider = () => (
    <div className="relative my-1">
      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
      <div className="relative flex justify-center"><span className="bg-surface px-3 text-[12px] text-muted-foreground">or</span></div>
    </div>
  );

  const title =
    tab === "signup" ? "Create your account"
    : signInMode === "magic-link" ? "Email me a sign-in link"
    : signInMode === "forgot" ? "Reset your password"
    : "Welcome back";
  const subtitle =
    tab === "signup" ? "Set up your business and meet Sam."
    : signInMode === "magic-link" ? "We'll send a one-tap link to your inbox."
    : signInMode === "forgot" ? "We'll email you a link to choose a new one."
    : "Sign in to pick up your cycle where you left off.";

  return (
    <div className="flex min-h-screen flex-col bg-canvas lg:flex-row">
      {/* Carbon brand panel */}
      <aside className="flex shrink-0 flex-col bg-ink px-6 py-5 text-inverse lg:w-[46%] lg:px-14 lg:py-12">
        <Link to="/" aria-label="AutoSocials home" className="inline-flex w-fit"><Logo reversed size={24} /></Link>

        <p className="mt-4 font-display text-[22px] font-extrabold leading-tight tracking-[-0.03em] lg:hidden">
          Organic content. Paid growth. <span className="font-editorial font-normal italic">On repeat.</span>
        </p>

        <div className="hidden flex-1 flex-col justify-center lg:flex">
          <h1 className="font-display text-[clamp(44px,4.6vw,72px)] font-extrabold leading-[1.02] tracking-[-0.04em]">
            Organic content.<br />Paid growth.<br />
            <span className="font-editorial text-[1.1em] font-normal italic text-silver">On repeat.</span>
          </h1>

          <div className="mt-12 flex max-w-md items-start gap-4">
            <img src={samPortrait} alt="Sam, your AI social growth agent" className="h-14 w-14 shrink-0 rounded-full object-cover" />
            <div className="rounded-[14px] rounded-tl-[4px] border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent))] px-4 py-3">
              <p className="text-[13px] font-semibold">Sam <span className="font-normal text-silver">· AI social growth agent</span></p>
              <p className="mt-1 text-[15px] leading-relaxed">Sign in and I'll plan your first batch straight from your brand dossier.</p>
            </div>
          </div>
        </div>

        <ol className="mt-10 hidden grid-cols-5 gap-2 border-t border-[hsl(var(--sidebar-border))] pt-6 lg:grid">
          {MODULES.map((m) => (
            <li key={m.id} className="min-w-0">
              <span className="block text-[11px] tabular-nums text-silver">{m.number}</span>
              <span className="mt-1 flex items-start gap-1.5 text-[12px] font-medium leading-tight">
                <AppIcon name={m.id} size={14} className="mt-px text-silver" />
                <span>{m.label}</span>
              </span>
            </li>
          ))}
        </ol>
      </aside>

      {/* Form */}
      <main className="flex flex-1 items-center justify-center px-5 py-10 lg:px-10">
        <div className="w-full max-w-[500px]">
          <div role="tablist" aria-label="Account" className="mb-6 flex gap-6 border-b border-border">
            {(["signin", "signup"] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`-mb-px border-b-2 pb-3 text-[14px] font-semibold transition-colors ${tab === t ? "border-ink text-ink" : "border-transparent text-text-secondary hover:text-ink"}`}>
                {t === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <section className="rounded-[14px] border border-border bg-surface p-6 shadow-card sm:p-8">
            {sentTo ? (
              <CheckInboxScreen
                email={sentTo.email}
                kind={sentTo.kind}
                onResend={async () => {
                  const { error } = await sendMagicLink(sentTo.email);
                  if (error) { toast.error(error.message); return false; }
                  return true;
                }}
                onBack={() => setSentTo(null)}
              />
            ) : (<>
            <h2 className="font-display text-[24px] font-extrabold tracking-[-0.03em] text-ink">{title}</h2>
            <p className="mt-1 text-[14px] text-text-secondary">{subtitle}</p>

            <div className="mt-6 space-y-4">
              {tab === "signin" && (
                <>
                  {signInMode === "password" && (
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="login-email" className={label}>Email</Label>
                        <Input id="login-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required className={field} />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="login-password" className={label}>Password</Label>
                          <button type="button" onClick={() => setSignInMode("forgot")} className="text-[13px] font-medium text-text-secondary underline-offset-4 hover:text-ink hover:underline">Forgot password?</button>
                        </div>
                        <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className={field} />
                      </div>
                      <Button type="submit" className={primaryBtn} disabled={submitting}>
                        {submitting ? "Signing in…" : "Sign in"} <ArrowRight className="h-4 w-4" />
                      </Button>
                    </form>
                  )}
                  {signInMode === "magic-link" && (
                    <form onSubmit={handleMagicLink} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="ml-email" className={label}>Email</Label>
                        <Input id="ml-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required className={field} />
                      </div>
                      <Button type="submit" className={primaryBtn} disabled={submitting || magicLinkCooldown > 0}>
                        {magicLinkCooldown > 0 ? `Resend in ${magicLinkCooldown}s` : submitting ? "Sending…" : "Send sign-in link"}
                      </Button>
                    </form>
                  )}
                  {signInMode === "forgot" && (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="forgot-email" className={label}>Email</Label>
                        <Input id="forgot-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required className={field} />
                      </div>
                      <Button type="submit" className={primaryBtn} disabled={submitting}>
                        {submitting ? "Sending…" : "Send reset link"}
                      </Button>
                    </form>
                  )}
                  <Divider />
                  {signInMode !== "magic-link" && (
                    <Button variant="outline" className={secondaryBtn} onClick={() => setSignInMode("magic-link")}><Mail className="h-4 w-4" /> Email me a sign-in link</Button>
                  )}
                  {signInMode !== "password" && (
                    <Button variant="outline" className={secondaryBtn} onClick={() => setSignInMode("password")}>Sign in with password</Button>
                  )}
                </>
              )}

              {tab === "signup" && (
                <>
                  <fieldset className="space-y-1.5">
                    <legend className={`${label} mb-1.5`}>I'm signing up as</legend>
                    <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                      {([
                        { v: "direct", t: "Business", d: "One brand or product", I: User },
                        { v: "agency", t: "Agency", d: "Run several clients", I: Building2 },
                      ] as const).map((o) => (
                        <button key={o.v} type="button" aria-pressed={accountType === o.v} onClick={() => setAccountType(o.v)}
                          className={`flex items-start gap-2.5 rounded-[10px] border p-3 text-left transition-colors ${accountType === o.v ? "border-ink bg-canvas" : "border-border-control hover:bg-surface-subtle"}`}>
                          <o.I className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
                          <span className="min-w-0">
                            <span className="block text-[14px] font-semibold text-ink">{o.t}</span>
                            <span className="block text-[12px] text-text-secondary">{o.d}</span>
                          </span>
                          {accountType === o.v && <Check className="ml-auto h-4 w-4 shrink-0 text-ink" />}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {signUpMode === "password" && (
                    <form onSubmit={handleSignup} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="signup-name" className={label}>Full name</Label>
                        <Input id="signup-name" type="text" autoComplete="name" placeholder="Jane Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} />
                      </div>
                      {accountType === "agency" && (
                        <>
                          <div className="space-y-1.5">
                            <Label htmlFor="signup-agency" className={label}>Agency name</Label>
                            <Input id="signup-agency" type="text" autoComplete="organization" placeholder="Your agency" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} required maxLength={100} className={field} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="signup-website" className={label}>Agency website</Label>
                            <Input id="signup-website" type="text" inputMode="url" autoComplete="url" placeholder="youragency.com" value={agencyWebsite} onChange={(e) => setAgencyWebsite(e.target.value)} required maxLength={255} className={field} />
                          </div>
                        </>
                      )}
                      <div className="space-y-1.5">
                        <Label htmlFor="signup-email" className={label}>Work email</Label>
                        <Input id="signup-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required className={field} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="signup-password" className={label}>Password</Label>
                        <Input id="signup-password" type="password" autoComplete="new-password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className={field} />
                      </div>
                      <Button type="submit" className={primaryBtn} disabled={submitting}>
                        {submitting ? "Creating account…" : "Create account"} <ArrowRight className="h-4 w-4" />
                      </Button>
                    </form>
                  )}
                  {signUpMode === "magic-link" && (
                    <form onSubmit={handleSignupMagicLink} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="signup-ml-name" className={label}>Full name</Label>
                        <Input id="signup-ml-name" type="text" autoComplete="name" placeholder="Jane Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} />
                      </div>
                      {accountType === "agency" && (
                        <>
                          <div className="space-y-1.5">
                            <Label htmlFor="signup-ml-agency" className={label}>Agency name</Label>
                            <Input id="signup-ml-agency" type="text" autoComplete="organization" placeholder="Your agency" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} required maxLength={100} className={field} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="signup-ml-website" className={label}>Agency website</Label>
                            <Input id="signup-ml-website" type="text" inputMode="url" autoComplete="url" placeholder="youragency.com" value={agencyWebsite} onChange={(e) => setAgencyWebsite(e.target.value)} required maxLength={255} className={field} />
                          </div>
                        </>
                      )}
                      <div className="space-y-1.5">
                        <Label htmlFor="signup-ml-email" className={label}>Work email</Label>
                        <Input id="signup-ml-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required className={field} />
                      </div>
                      <Button type="submit" className={primaryBtn} disabled={submitting || magicLinkCooldown > 0}>
                        {magicLinkCooldown > 0 ? `Resend in ${magicLinkCooldown}s` : submitting ? "Sending…" : "Email me a sign-up link"}
                      </Button>
                    </form>
                  )}
                  <Divider />
                  {signUpMode !== "magic-link" && (
                    <Button variant="outline" className={secondaryBtn} onClick={() => setSignUpMode("magic-link")}><Mail className="h-4 w-4" /> Sign up with an email link</Button>
                  )}
                  {signUpMode !== "password" && (
                    <Button variant="outline" className={secondaryBtn} onClick={() => setSignUpMode("password")}>Sign up with a password</Button>
                  )}
                </>
              )}
            </div>
            </>)}
          </section>

          <p className="mt-6 text-center text-[12px] text-muted-foreground">
            By continuing you agree to our <Link to="/terms" className="underline underline-offset-2 hover:text-ink">Terms</Link> and <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
};

export default AuthPage;
