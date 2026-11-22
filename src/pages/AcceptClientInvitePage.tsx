import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { brandedSignUp } from "@/lib/branded-signup";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Mail, Lock, User, Loader2, ArrowRight, CheckCircle2,
  XCircle, ShieldAlert, Search, Users, BarChart3, TrendingUp,
  Check, Shield, Sparkles,
} from "lucide-react";
import logoWhite from "@/assets/logo-white.png";

const features = [
  { icon: Search, title: "AI Creator Discovery", desc: "Find creators in any niche with AI-powered search" },
  { icon: Users, title: "Smart Outreach", desc: "Contact creators with personalized AI emails" },
  { icon: BarChart3, title: "Campaign Pipelines", desc: "Track collaborations from contact to delivery" },
  { icon: TrendingUp, title: "Performance Analytics", desc: "Real-time engagement, reach, and ROI data" },
];

const AcceptClientInvitePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, user } = useAuth();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "form" | "accepting" | "accepted" | "invalid" | "self_invite">("loading");
  const [invitation, setInvitation] = useState<any>(null);
  const [agencyInfo, setAgencyInfo] = useState<any>(null);

  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<"signup" | "signin">("signup");

  useEffect(() => {
    if (token) verifyAndRoute();
    else setStatus("invalid");
  }, [token]);

  // Auto-accept when logged-in user arrives with valid invitation
  useEffect(() => {
    if (invitation && session && user && status === "form") {
      if (user.id === invitation.agency_user_id) {
        setStatus("self_invite");
        return;
      }
      handleAcceptLoggedIn();
    }
  }, [invitation, session, user?.id, status]);

  const verifyAndRoute = async () => {
    const { data } = await supabase
      .rpc("get_client_invitation" as never, { _token: token! } as never)
      .maybeSingle() as unknown as { data: any };

    if (!data) { setStatus("invalid"); return; }


    if (data.status === "accepted") { setStatus("accepted"); return; }
    if (data.status !== "pending") { setStatus("invalid"); return; }

    setInvitation(data);

    // Pre-fill form from invitation data
    if (data.contact_name) setFullName(data.contact_name);
    if (data.email) setEmail(data.email);

    // Fetch agency info
    const { data: agProfile } = await supabase
      .from("agency_profiles")
      .select("agency_name, agency_logo_url, contact_name, contact_email")
      .eq("user_id", data.agency_user_id)
      .single();
    setAgencyInfo(agProfile);

    setStatus("form");
  };

  const handleAcceptLoggedIn = async () => {
    setStatus("accepting");
    try {
      const { data: ok } = await supabase.rpc("accept_client_invitation" as never, { _token: token!, _workspace_id: null } as never);
      if (!ok) throw new Error("Invitation is no longer valid");

      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user!.id)
        .eq("role", "owner")
        .single();

      const wsId = membership?.workspace_id || invitation.workspace_id;

      // Rename workspace if company name provided
      if (wsId && invitation.client_company_name) {
        await supabase.from("workspaces").update({ name: `${invitation.client_company_name}'s Workspace` }).eq("id", wsId);
      }

      const { data: clientRecord } = await supabase
        .from("agency_clients")
        .insert({
          agency_user_id: invitation.agency_user_id,
          client_user_id: user!.id,
          workspace_id: wsId,
          client_name: invitation.client_company_name || user!.email?.split("@")[0] || "Client",
          client_contact_name: invitation.contact_name,
          client_contact_email: invitation.email,
          status: "active",
        })
        .select("id")
        .single();

      if (wsId) {
        await supabase.from("agency_client_links").insert({
          agency_user_id: invitation.agency_user_id,
          client_user_id: user!.id,
          workspace_id: wsId,
          agency_client_id: clientRecord?.id ?? null,
          status: "active",
        });

        // Add agency as admin of client workspace
        await supabase.from("workspace_members").upsert({
          workspace_id: wsId,
          user_id: invitation.agency_user_id,
          role: "admin",
        }, { onConflict: "user_id,workspace_id" });
      }

      toast.success("Invitation accepted! Welcome to AutoSocials.");
      setStatus("accepted");
      setTimeout(() => navigate("/app"), 2000);
    } catch (err) {
      console.error("Accept error:", err);
      toast.error("Failed to accept invitation");
      setStatus("form");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setSubmitting(true);

    const { error } = await brandedSignUp(email, password, {
      full_name: fullName,
      account_type: "direct",
      invite_token: token ?? "",
      company_name: invitation?.client_company_name || "",
    }, "https://autosocials.com/app");

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        toast.error("This email is already registered. Try signing in.");
        setTab("signin");
      } else {
        toast.error(error.message);
      }
      setSubmitting(false);
      return;
    }


    toast.success("Check your email to verify your account!");
    setSubmitting(false);
  };

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    }
    // Auto-accept will trigger via useEffect when session is established
  };

  const agencyName = agencyInfo?.agency_name || "Your Agency Partner";
  const agencyLogo = agencyInfo?.agency_logo_url;

  // Loading / Accepting / Accepted / Invalid / Self-invite states
  if (status === "loading" || status === "accepting") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">{status === "accepting" ? "Accepting invitation..." : "Verifying invitation..."}</p>
        </div>
      </div>
    );
  }

  if (status === "self_invite") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-md">
          <ShieldAlert className="w-14 h-14 text-yellow-500 mx-auto" />
          <h2 className="text-2xl font-bold text-foreground">Can't Accept Own Invitation</h2>
          <p className="text-muted-foreground">You're logged in as the agency that sent this invitation. Share this link with your client instead.</p>
          <Button variant="outline" onClick={() => navigate("/agency/invites")}>Go to Invitations</Button>
        </div>
      </div>
    );
  }

  if (status === "accepted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-md">
          <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />
          <h2 className="text-2xl font-bold text-foreground">Invitation Accepted!</h2>
          <p className="text-muted-foreground">{session ? "Redirecting you to the dashboard..." : "This invitation has already been used."}</p>
          <Button variant="brand" onClick={() => navigate(session ? "/app" : "/auth")}>
            {session ? "Go to Dashboard" : "Sign In"} <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-md">
          <XCircle className="w-14 h-14 text-destructive mx-auto" />
          <h2 className="text-2xl font-bold text-foreground">Invitation Link Unavailable</h2>
          <p className="text-muted-foreground">This link is invalid, expired, or has already been used.</p>
          <Button variant="outline" onClick={() => navigate("/auth")}>Go to Sign In</Button>
        </div>
      </div>
    );
  }

  // ─── Main: Form view (not logged in) ───
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-brand opacity-[0.04] dark:opacity-[0.08]" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-primary/5 dark:bg-primary/10 blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-accent/30 dark:bg-accent/20 blur-3xl translate-y-1/2 -translate-x-1/4" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Left - Hero Content */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-8">
              <div className="flex items-center gap-4">
                <img src={logoWhite} alt="AutoSocials" className="h-12 w-auto hidden dark:block" />
                <img src={logoWhite} alt="AutoSocials" className="h-12 w-auto dark:hidden block opacity-80" style={{ filter: "brightness(0.3)" }} />
              </div>

              {/* Invited by badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-primary/8 dark:bg-primary/15 border border-primary/15"
              >
                {agencyLogo && <img src={agencyLogo} alt={agencyName} className="w-6 h-6 rounded-full object-cover" />}
                <span className="text-sm font-medium text-primary">
                  {agencyName} has invited you
                </span>
              </motion.div>

              <div className="space-y-4">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground leading-[1.1] tracking-tight">
                  You're invited to{" "}
                  <span className="gradient-brand-text">AutoSocials</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
                  AI-powered creator discovery and outreach — find, vet, and collaborate with the perfect creators for your brand.
                </p>
              </div>

              {/* Features */}
              <div className="grid sm:grid-cols-2 gap-4 pt-4">
                {features.map((feat, i) => (
                  <motion.div
                    key={feat.title}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border/50 shadow-soft"
                  >
                    <div className="w-9 h-9 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0">
                      <feat.icon className="w-4.5 h-4.5 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{feat.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{feat.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Trust */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                {["50K+ creators indexed", "AI-powered matching", "Used by leading agencies"].map((point) => (
                  <div key={point} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary" />
                    {point}
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Right - Auth Form */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="lg:sticky lg:top-8"
            >
              <div className="bg-card rounded-2xl border border-border shadow-elevated p-6 sm:p-8 space-y-6">
                {/* Invitation info card */}
                {invitation && (
                  <div className="p-4 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/10 space-y-1.5">
                    <p className="text-sm font-medium text-foreground">
                      {invitation.client_company_name
                        ? `You've been invited to join ${invitation.client_company_name}`
                        : "You've been invited to join AutoSocials"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Invited email: <span className="text-foreground font-medium">{invitation.email}</span>
                    </p>
                  </div>
                )}

                {/* Tabs */}
                <div className="flex rounded-lg bg-secondary p-1">
                  <button
                    onClick={() => setTab("signup")}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                      tab === "signup" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                    }`}
                  >
                    Sign Up
                  </button>
                  <button
                    onClick={() => setTab("signin")}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                      tab === "signin" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                    }`}
                  >
                    Sign In
                  </button>
                </div>

                {tab === "signup" ? (
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="inv-name" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <User className="w-3.5 h-3.5" /> Full Name
                      </Label>
                      <Input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inv-email" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <Mail className="w-3.5 h-3.5" /> Email <span className="text-destructive">*</span>
                      </Label>
                      <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inv-password" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <Lock className="w-3.5 h-3.5" /> Password <span className="text-destructive">*</span>
                      </Label>
                      <Input id="inv-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" className="h-11" />
                    </div>
                    <Button type="submit" variant="brand" className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20" disabled={submitting}>
                      {submitting ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Creating account...</> : <>Accept & Get Started <ArrowRight className="w-5 h-5 ml-2" /></>}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleSignin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="inv-signin-email" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <Mail className="w-3.5 h-3.5" /> Email
                      </Label>
                      <Input id="inv-signin-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inv-signin-pw" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <Lock className="w-3.5 h-3.5" /> Password
                      </Label>
                      <Input id="inv-signin-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" className="h-11" />
                    </div>
                    <Button type="submit" variant="brand" className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20" disabled={submitting}>
                      {submitting ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Signing in...</> : <>Sign In & Accept <ArrowRight className="w-5 h-5 ml-2" /></>}
                    </Button>
                  </form>
                )}

                <div className="flex items-center justify-center gap-2 pt-2">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground/60" />
                  <p className="text-[11px] text-muted-foreground/60">Your data is encrypted and secure</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} AutoSocials. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
            {agencyInfo?.contact_name && <span>Questions? Contact {agencyInfo.contact_name}</span>}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AcceptClientInvitePage;
