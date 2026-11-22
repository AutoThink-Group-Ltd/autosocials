import { Button } from "@/components/ui/button";
import { ArrowRight, Users, BarChart3, Shield, Sparkles } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";

const features = [
  { icon: Users, title: "Client Management", description: "Manage all your influencer marketing clients from a single dashboard." },
  { icon: BarChart3, title: "Performance Reports", description: "Generate branded reports and share them with clients in one click." },
  { icon: Shield, title: "White-Label Access", description: "Operate within client workspaces while maintaining your agency identity." },
  { icon: Sparkles, title: "AI-Powered Discovery", description: "Leverage AI to find the perfect creators for every client campaign." },
];

const AgencyPlatformPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-brand opacity-5" />
        <div className="relative max-w-5xl mx-auto px-6 py-24 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Sparkles className="w-4 h-4" /> Agency Partner Program
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight">
            Grow your agency with <span className="gradient-brand-text">AutoSocials</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Manage influencer campaigns for multiple clients, earn recurring commissions, and scale your agency with our white-label platform.
          </p>
          <div className="flex items-center gap-3 justify-center">
            <Button variant="brand" size="lg" onClick={() => navigate("/agency-signup")}>
              Become a Partner <ArrowRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate("/auth")}>
              Sign In
            </Button>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f) => (
            <div key={f.title} className="p-6 rounded-xl bg-card border border-border/60 space-y-3">
              <div className="w-10 h-10 rounded-lg gradient-brand flex items-center justify-center">
                <f.icon className="w-5 h-5 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-3xl mx-auto px-6 pb-20 text-center space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Ready to partner with us?</h2>
        <p className="text-muted-foreground">Earn 20% recurring commission on every client you refer.</p>
        <Button variant="brand" size="lg" onClick={() => navigate("/agency-signup")}>
          Get Started <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default AgencyPlatformPage;
