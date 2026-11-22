import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useNavigate } from "@/lib/router-compat";
import { Lock, Eye, EyeOff, CheckCircle2, ShieldCheck } from "lucide-react";
import logoDark from "@/assets/logo-dark.png";

const ResetPasswordPage = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user has an active session (set by verifyOtp on AuthConfirmPage)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setReady(true);
      }
      setChecking(false);
    };

    // Also listen for PASSWORD_RECOVERY event (hash-based flow)
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
      setChecking(false);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setChecking(false);
      }
    });

    checkSession();

    return () => subscription.unsubscribe();
  }, []);

  const passwordValid = password.length >= 8;
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!passwordsMatch) {
      toast.error("Passwords do not match");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully!");
      navigate("/app?welcome=true", { replace: true });
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md text-center space-y-6">
          <img src={logoDark} alt="AutoSocials" className="h-12 w-auto mx-auto" />
          <div className="rounded-2xl border border-border bg-card p-8 shadow-card space-y-4">
            <div className="w-14 h-14 rounded-xl gradient-brand mx-auto flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Link expired</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This password reset link is invalid or has expired. Please request a new one from the sign-in page.
            </p>
            <Button variant="brand" className="w-full" onClick={() => navigate("/auth")}>
              Back to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <img src={logoDark} alt="AutoSocials" className="h-20 w-auto mx-auto" />
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-card space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-xl gradient-brand mx-auto flex items-center justify-center mb-4">
              <Lock className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Set new password</h1>
            <p className="text-sm text-muted-foreground">
              Choose a strong password to secure your account
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-medium text-foreground">
                New password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="pl-9 pr-10 h-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${passwordValid ? "text-green-500" : "text-muted-foreground/40"}`} />
                  <span className={`text-xs ${passwordValid ? "text-green-600" : "text-muted-foreground"}`}>
                    At least 8 characters
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm font-medium text-foreground">
                Confirm password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="pl-9 h-11"
                />
              </div>
              {confirmPassword.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${passwordsMatch ? "text-green-500" : "text-destructive"}`} />
                  <span className={`text-xs ${passwordsMatch ? "text-green-600" : "text-destructive"}`}>
                    {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                  </span>
                </div>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold"
              variant="brand"
              disabled={submitting || !passwordValid || !passwordsMatch}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Updating...
                </span>
              ) : (
                "Update password"
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Remember your password?{" "}
          <a href="/auth" className="text-primary hover:underline font-medium">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
