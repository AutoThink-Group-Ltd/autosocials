import { useParams, useNavigate } from "@/lib/router-compat";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brandedSignUp } from "@/lib/branded-signup";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Search, Users, Zap, TrendingUp, ArrowRight, Lock, Mail, User,
  Building2, Loader2, Check, Shield, BarChart3, Sparkles,
} from "lucide-react";
import logoWhite from "@/assets/logo-white.png";

const features = [
  { icon: Search, title: "AI Creator Discovery", desc: "Find perfect creators in any niche using AI-powered search across TikTok & Instagram" },
  { icon: Users, title: "Smart Outreach", desc: "Contact creators with AI-personalized emails that get responses" },
  { icon: BarChart3, title: "Campaign Tracking", desc: "Track collaborations from first contact to content delivery with visual pipelines" },
  { icon: TrendingUp, title: "Performance Insights", desc: "Real-time analytics on creator engagement, reach, and ROI" },
];

const trustPoints = [
  "50K+ creators indexed",
  "AI-powered matching",
  "Used by leading agencies",
];

const PublicReferralPage = () => {
  const { code, slug } = useParams();
  const navigate = useNavigate();
  const { session, user } = useAuth();
  const [agencyInfo, setAgencyInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (code) initPage();
    else setError(true);
  }, [code, slug]);

  const initPage = async () => {
    try {
      // Resolve agency info
      const { data, error: fnError } = await supabase.functions.invoke("agency-referral", {
        body: { action: "resolve", code },
      });

      if (fnError || data?.error) {
        setError(true);
        setLoading(false);
        return;
      }

      setAgencyInfo(data.profile);

      // Track click
      supabase.functions.invoke("agency-referral", {
        body: {
          action: "track_click",
          code,
          slug: slug || null,
          user_agent: navigator.userAgent,
          referrer: document.referrer || null,
        },
      }).catch(() => {});

      // Store referral data in localStorage
      localStorage.setItem("referral_code", code!);
      if (slug) localStorage.setItem("referral_slug", slug);
    } catch {
      setError(true);
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setSubmitting(true);

    const { error: signupError } = await brandedSignUp(email, password, {
      full_name: fullName,
      account_type: "direct",
      company_name: companyName,
      referral_code: code ?? "",
      ...(slug ? { referral_slug: slug } : {}),
    }, "https://autosocials.com/app");

    if (signupError) {
      if (signupError.message.toLowerCase().includes("already registered")) {
        toast.error("This email is already registered. Please sign in instead.");
      } else {
        toast.error(signupError.message);
      }
      setSubmitting(false);
      return;
    }


    toast.success("Check your email to verify your account!");
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-foreground">Invalid Referral Link</h2>
          <p className="text-muted-foreground">This referral code doesn't exist or has been deactivated.</p>
          <Button variant="brand" onClick={() => navigate("/auth")}>
            Sign Up Directly <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  const agencyName = agencyInfo?.agency_name || "Your Partner";
  const agencyLogo = agencyInfo?.agency_logo_url;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 gradient-brand opacity-[0.04] dark:opacity-[0.08]" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-primary/5 dark:bg-primary/10 blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-accent/30 dark:bg-accent/20 blur-3xl translate-y-1/2 -translate-x-1/4" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Left - Hero Content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-8"
            >
              {/* Logo */}
              <div className="flex items-center gap-4">
                <img src={logoWhite} alt="AutoSocials" className="h-12 w-auto hidden dark:block" />
                <img src={logoWhite} alt="AutoSocials" className="h-12 w-auto dark:hidden block opacity-80" style={{ filter: "brightness(0.3)" }} />
              </div>

              {/* Referred by badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-primary/8 dark:bg-primary/15 border border-primary/15"
              >
                {agencyLogo && (
                  <img src={agencyLogo} alt={agencyName} className="w-6 h-6 rounded-full object-cover" />
                )}
                <span className="text-sm font-medium text-primary">
                  Referred by {agencyName}
                </span>
              </motion.div>

              {/* Headline */}
              <div className="space-y-4">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground leading-[1.1] tracking-tight">
                  Find your next{" "}
                  <span className="gradient-brand-text">perfect creator</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
                  AI-powered discovery that finds, vets, and matches creators to your brand — in minutes, not weeks.
                </p>
              </div>

              {/* Feature grid */}
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

              {/* Trust indicators */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                {trustPoints.map((point) => (
                  <div key={point} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary" />
                    {point}
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Right - Signup Form */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="lg:sticky lg:top-8"
            >
              <div className="bg-card rounded-2xl border border-border shadow-elevated p-6 sm:p-8 space-y-6">
                <div className="text-center space-y-1.5">
                  <h2 className="text-xl font-bold text-foreground">Get started free</h2>
                  <p className="text-sm text-muted-foreground">Start discovering creators today</p>
                </div>

                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ref-company" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <Building2 className="w-3.5 h-3.5" />
                      Company Name
                    </Label>
                    <Input
                      id="ref-company"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Acme Corp"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ref-name" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <User className="w-3.5 h-3.5" />
                      Full Name
                    </Label>
                    <Input
                      id="ref-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jane Doe"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ref-email" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <Mail className="w-3.5 h-3.5" />
                      Email Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="ref-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ref-password" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <Lock className="w-3.5 h-3.5" />
                      Password <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="ref-password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="h-11"
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="brand"
                    className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Creating account...</>
                    ) : (
                      <>Get Started Free <ArrowRight className="w-5 h-5 ml-2" /></>
                    )}
                  </Button>
                </form>

                <div className="text-center">
                  <p className="text-xs text-muted-foreground">
                    Already have an account?{" "}
                    <button onClick={() => navigate("/auth")} className="text-primary hover:underline font-medium">
                      Sign in
                    </button>
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2 pt-2">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground/60" />
                  <p className="text-[11px] text-muted-foreground/60">
                    Your data is encrypted and secure
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} AutoSocials. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
            {agencyInfo?.contact_name && (
              <span>Questions? Contact {agencyInfo.contact_name}</span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicReferralPage;
