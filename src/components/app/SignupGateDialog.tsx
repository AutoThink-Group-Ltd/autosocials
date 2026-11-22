import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat";
import { ArrowRight, Lock, List, Download, Send, Sparkles } from "lucide-react";

interface SignupGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedCount: number;
  action?: string;
}

const gatedFeatures = [
  { icon: List, label: "Permanently save your lists" },
  { icon: Send, label: "Contact creators directly" },
  { icon: Download, label: "Export creator data" },
  { icon: Sparkles, label: "AI-powered outreach tools" },
];

export function SignupGateDialog({ open, onOpenChange, savedCount, action }: SignupGateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        {/* Gradient header */}
        <div className="gradient-brand p-6 pb-8 text-center">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-3">
            <Lock className="w-5 h-5 text-primary-foreground" />
          </div>
          <h2 className="text-lg font-bold text-primary-foreground mb-1">
            {action || "Sign up to unlock"}
          </h2>
          <p className="text-sm text-primary-foreground/80">
            You've saved {savedCount} creator{savedCount !== 1 ? "s" : ""} to your list.
            {" "}Create a free account to keep them permanently.
          </p>
        </div>

        <div className="p-6">
          {/* Feature list */}
          <div className="space-y-3 mb-6">
            {gatedFeatures.map((f) => (
              <div key={f.label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <f.icon className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm text-foreground">{f.label}</span>
              </div>
            ))}
          </div>

          {/* Warning */}
          <div className="rounded-lg bg-destructive/8 border border-destructive/15 p-3 mb-6">
            <p className="text-xs text-destructive font-medium">
              ⚠️ Your saved list is temporary — it will disappear when you close this browser tab.
            </p>
          </div>

          {/* CTAs */}
          <div className="space-y-2">
            <Link to="/auth" className="block">
              <Button variant="brand" size="lg" className="w-full group">
                Create Free Account
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </Link>
            <button
              onClick={() => onOpenChange(false)}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              Continue browsing
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
