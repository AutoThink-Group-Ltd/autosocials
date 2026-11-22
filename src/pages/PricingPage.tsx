import { useState } from "react";
import { toast } from "sonner";
import { Link } from "@/lib/router-compat";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { ContentCreditPlans } from "@/components/pricing/ContentCreditPlans";
import { CONTENT_CREDIT_PLANS } from "@/config/contentCreditPlans";
import { PLANS } from "@/config/stripePlans";
import { createCheckoutSession } from "@/hooks/useSubscription";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const { currentWorkspace } = useWorkspace();
  async function selectPlan(plan: (typeof CONTENT_CREDIT_PLANS)[number]) {
    if (plan.key === "free") { window.location.href = "/auth"; return; }
    setLoading(plan.key);
    try { await createCheckoutSession(PLANS[plan.key].prices.monthly.price_id, currentWorkspace?.id); }
    catch { toast.error("Could not open checkout. Please try again."); }
    finally { setLoading(null); }
  }
  return <div className="min-h-screen bg-background"><Navbar /><main className="px-6 pb-20 pt-28">
    <header className="mx-auto mb-12 max-w-3xl text-center"><p className="text-xs font-bold uppercase tracking-widest text-primary">Simple monthly pricing</p><h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">More ideas. More content. Your pace.</h1><p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">Choose the credits that fit your creative ambitions, from your first post to a full month of content.</p></header>
    <ContentCreditPlans onSelect={selectPlan} loading={loading} />
    <div className="mx-auto mt-10 max-w-3xl space-y-3 text-center text-sm text-muted-foreground"><p>Credits are used for content production. Each engine has its own credit price, shown before you create.</p><p>On Pro, create approximately one average video and two average images a day over 30 days.</p><p>Already have an account? <Link to="/auth" className="text-primary underline">Sign in</Link></p></div>
  </main><Footer /></div>;
}
