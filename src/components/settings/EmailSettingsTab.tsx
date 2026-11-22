import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { SenderIdentitiesSection } from "@/components/settings/SenderIdentitiesSection";
import { DomainAuthSection } from "@/components/settings/DomainAuthSection";
import { EmailSignatureSection } from "@/components/settings/EmailSignatureSection";
import { CheckCircle2, Globe, Mail, FileSignature, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const STEPS = [
  { key: "domain", label: "Domain Authentication", icon: Globe, description: "Set up email infrastructure & verify your domain" },
  { key: "senders", label: "Sender Identities", icon: Mail, description: "Add the email addresses you send outreach from" },
  { key: "signatures", label: "Email Signatures", icon: FileSignature, description: "Create signatures to auto-append to emails" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

export function EmailSettingsTab() {
  const { currentWorkspace } = useWorkspace();
  const [activeStep, setActiveStep] = useState<StepKey>("domain");
  const [completedSteps, setCompletedSteps] = useState<Set<StepKey>>(new Set());

  const workspaceId = currentWorkspace?.id;

  // Check completion status for each step
  useEffect(() => {
    if (!workspaceId) return;

    const checkCompletion = async () => {
      const done = new Set<StepKey>();

      // Step 1: Domain — check if provisioned AND domain verified
      const { data: sgConfig } = await supabase
        .from("workspace_sendgrid_config")
        .select("id")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      const { data: domainRec } = await supabase
        .from("workspace_domains")
        .select("status")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (sgConfig && domainRec?.status === "verified") done.add("domain");

      // Step 2: Sender identities — check if at least one exists
      const { count: identityCount } = await supabase
        .from("sender_identities")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      if (identityCount && identityCount > 0) done.add("senders");

      // Step 3: Signatures — check if at least one exists
      const { count: sigCount } = await supabase
        .from("email_signatures")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      if (sigCount && sigCount > 0) done.add("signatures");

      setCompletedSteps(done);

      // Auto-navigate to first incomplete step
      if (!done.has("domain")) setActiveStep("domain");
      else if (!done.has("senders")) setActiveStep("senders");
      else if (!done.has("signatures")) setActiveStep("signatures");
      else setActiveStep("domain"); // all complete, show first
    };

    checkCompletion();
  }, [workspaceId]);

  const currentIndex = STEPS.findIndex((s) => s.key === activeStep);

  const goNext = () => {
    if (currentIndex < STEPS.length - 1) {
      setActiveStep(STEPS[currentIndex + 1]!.key);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setActiveStep(STEPS[currentIndex - 1]!.key);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stepper header */}
      <div className="flex items-center gap-0 w-full">
        {STEPS.map((step, i) => {
          const isActive = activeStep === step.key;
          const isComplete = completedSteps.has(step.key);
          const Icon = step.icon;

          return (
            <div key={step.key} className="flex items-center flex-1 min-w-0">
                <button
                onClick={() => setActiveStep(step.key)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-4 py-3 transition-all text-left w-full",
                  isActive
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-muted/50 border border-transparent",
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full shrink-0 text-sm font-semibold transition-colors",
                    isComplete
                      ? "bg-emerald-500/15 text-emerald-500"
                      : isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {isComplete ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <div className="hidden sm:block">
                  <p
                    className={cn(
                      "text-sm font-medium leading-none",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{step.description}</p>
                </div>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 mx-1 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div>
        {activeStep === "domain" && <DomainAuthSection />}
        {activeStep === "senders" && <SenderIdentitiesSection />}
        {activeStep === "signatures" && <EmailSignatureSection />}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={goPrev}
          disabled={currentIndex === 0}
        >
          Previous
        </Button>
        {currentIndex < STEPS.length - 1 && (
          <Button size="sm" onClick={goNext} className="gap-1.5">
            Next Step <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
