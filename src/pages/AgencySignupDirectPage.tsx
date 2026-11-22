import { validateAgencyDetails } from "@/lib/agency-signup";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brandedSignUp } from "@/lib/branded-signup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate } from "@/lib/router-compat";
import { ArrowRight, Building2, Mail, Lock, User } from "lucide-react";
import logoSignup from "@/assets/logo-signup.png";
import iconWhite from "@/assets/icon-white.png";
import { CheckInboxScreen } from "@/features/auth/CheckInboxScreen";

const AgencySignupDirectPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [agencyWebsite, setAgencyWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    const v = validateAgencyDetails(agencyName, agencyWebsite);
    if (!v.ok) { toast.error(v.error); return; }
    setSubmitting(true);

    const { error, userId } = await brandedSignUp(email, password, { full_name: fullName, account_type: "agency", agency_name: v.agency_name, agency_website: v.agency_website }, "https://autosocials.com/agency");
    const data = { user: userId ? { id: userId } : null };

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        toast.error("This email is already registered.");
        navigate("/auth");
      } else {
        toast.error(error.message);
      }
      setSubmitting(false);
      return;
    }

    void data; // agency profile is created automatically with the account
    setSubmitting(false);
    setSentTo(email);
  };

  if (sentTo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-[420px] rounded-[14px] border border-border bg-surface p-6 shadow-card sm:p-8">
          <CheckInboxScreen
            email={sentTo}
            kind="verify"
            onResend={async () => {
              const { data, error } = await supabase.functions.invoke("send-magic-link", {
                body: { email: sentTo, type: "magiclink", redirect_to: "https://autosocials.com/agency" },
              });
              if (error || data?.error) { toast.error("We couldn't resend just now. Try again in a minute."); return false; }
              return true;
            }}
            onBack={() => setSentTo(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center justify-center gap-3">
          <img src={iconWhite} alt="AutoSocials Icon" className="h-16 w-16 object-contain" />
          <img src={logoSignup} alt="AutoSocials" className="h-24 w-auto object-contain" />
        </div>

        <Card className="border-border/60 shadow-card">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">Create Agency Account</CardTitle>
            <CardDescription>Start managing influencer campaigns for your clients</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label>Agency Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Your Agency" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} required className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Agency Website</Label>
                <Input placeholder="youragency.com" inputMode="url" value={agencyWebsite} onChange={(e) => setAgencyWebsite(e.target.value)} required maxLength={255} />
              </div>
              <div className="space-y-2">
                <Label>Your Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Jane Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="email" placeholder="you@agency.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="password" placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="pl-9" />
                </div>
              </div>
              <Button type="submit" variant="brand" className="w-full" disabled={submitting}>
                {submitting ? "Creating..." : "Create Agency Account"} <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
            <p className="text-center text-xs text-muted-foreground mt-4">
              Already have an account? <button onClick={() => navigate("/auth")} className="text-primary hover:underline">Sign in</button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AgencySignupDirectPage;
