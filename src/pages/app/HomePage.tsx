import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useUsageCounts } from "@/hooks/useUsageCounts";
import { useAgentRuns } from "@/hooks/useAgentRuns";
import { VibeAvatar } from "@/components/agent/VibeAvatar";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Search, Mail, MessageSquare, Users, BarChart3, Megaphone, Calendar, BookOpen, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const SUGGESTIONS = [
  { label: "Find creators for a launch", icon: Search },
  { label: "Draft a cold outreach sequence", icon: Mail },
  { label: "Summarise this week's replies", icon: MessageSquare },
  { label: "Build a creator shortlist", icon: Users },
  { label: "Analyse my campaign", icon: BarChart3 },
  { label: "Scan my brand's category", icon: Megaphone },
];

const ICON_MAP: Record<string, any> = {
  search: Search, mail: Mail, calendar: Calendar, users: Users,
  message: MessageSquare, sparkles: Sparkles, megaphone: Megaphone, chart: BarChart3,
};

type BrandPlan = {
  has_dossier: boolean;
  brand_name: string | null;
  headline: string;
  summary: string;
  suggestions: { title: string; prompt: string; why: string; icon?: string }[];
  plan: { day: string; platform: string; angle: string; hook: string }[];
};

export default function HomePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { counts } = useUsageCounts();
  const { activeRun } = useAgentRuns(currentWorkspace?.id, { limit: 1 });
  const [draft, setDraft] = useState("");
  const [brand, setBrand] = useState<BrandPlan | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!currentWorkspace?.id) return;
      setBrandLoading(true);
      const { data, error } = await supabase.functions.invoke("vibe-brand-plan", {
        body: { workspace_id: currentWorkspace.id },
      });
      if (!cancelled) {
        if (!error && data) setBrand(data as BrandPlan);
        setBrandLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [currentWorkspace?.id]);

  const firstName = useMemo(
    () => (profile?.full_name || "").trim().split(" ")[0] || "there",
    [profile?.full_name]
  );

  const statusLabel = activeRun
    ? `Vibe is ${activeRun.skill_id || "working"}…`
    : "All systems primed";

  function go(message?: string) {
    const m = (message ?? draft).trim();
    if (!m) {
      navigate("/app/ask-vibe");
      return;
    }
    navigate(`/app/ask-vibe?seed=${encodeURIComponent(m)}`);
  }

  const kpis = [
    { value: counts.searches, label: "Searches" },
    { value: counts.saved_creators, label: "Saved creators" },
    { value: counts.creator_lists, label: "Lists" },
    { value: counts.emails, label: "Emails sent" },
    { value: counts.vibe_conversations, label: "Vibe sessions" },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[hsl(var(--brand-pink)/0.04)] via-background to-background">
      <div className="mx-auto max-w-5xl px-6 pt-12 pb-24">
        {/* Status pill */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--brand-pink))] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--brand-pink))]" />
            </span>
            <span className="uppercase tracking-wider">{statusLabel}</span>
          </div>
        </div>

        {/* Greeting */}
        <h1 className="mt-6 text-center font-semibold tracking-tight text-foreground text-4xl md:text-5xl">
          {greeting()},{" "}
          <span
            className="italic font-serif"
            style={{
              backgroundImage:
                "linear-gradient(135deg, hsl(var(--brand-pink)), hsl(var(--brand-purple)))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {firstName}
          </span>
        </h1>
        <p className="mt-3 text-center text-muted-foreground">
          Your creator office is live. Tell Vibe what to move forward.
        </p>

        {/* Avatar — click to open full Vibe chat */}
        <div className="mt-10 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/app/ask-vibe")}
            aria-label="Open Vibe chat"
            className="rounded-full transition-transform hover:scale-[1.03] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-pink)/0.5)] focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            <VibeAvatar size={168} speaking={!!activeRun} />
          </button>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => navigate("/app/ask-vibe")}
              className="rounded-full border border-border bg-card px-2 py-0.5 font-medium hover:bg-secondary transition-colors"
            >
              Vibe
            </button>
            <span className="flex items-center gap-1 text-muted-foreground">
              <span className="inline-block h-1 w-1 rounded-full bg-[hsl(var(--brand-pink))]" />
              <span className="uppercase tracking-wider">{activeRun ? "Working" : "Ready"}</span>
            </span>
          </div>
        </div>

        {/* Command bar */}
        <div className="mx-auto mt-8 max-w-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go();
            }}
            className="group flex items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-card)] focus-within:border-[hsl(var(--brand-pink)/0.5)] focus-within:shadow-[0_0_0_4px_hsl(var(--brand-pink)/0.08)] transition-all"
          >
            <Sparkles className="ml-2 h-4 w-4 text-[hsl(var(--brand-pink))]" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask Vibe anything — or describe the creators you need…"
              className="flex-1 bg-transparent px-2 py-2 text-sm outline-hidden placeholder:text-muted-foreground"
            />
            <Button
              type="submit"
              size="sm"
              className="rounded-xl bg-gradient-to-r from-[hsl(var(--brand-pink))] to-[hsl(var(--brand-purple))] text-white hover:opacity-90"
            >
              Send <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </form>

          {/* Suggestions */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {(brand?.suggestions?.length
              ? brand.suggestions.map((s) => ({ label: s.title, icon: ICON_MAP[s.icon ?? "sparkles"] ?? Sparkles, prompt: s.prompt }))
              : SUGGESTIONS.map((s) => ({ label: s.label, icon: s.icon, prompt: s.label }))
            ).map((s) => (
              <button
                key={s.label}
                onClick={() => go(s.prompt)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-[hsl(var(--brand-pink)/0.4)] hover:text-foreground"
              >
                <s.icon className="h-3 w-3" />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Vibe knows your brand — dossier-grounded panel */}
        {(brandLoading || brand) && (
          <div className="mt-12 rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
            <div className="border-b border-border p-5 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-pink))] to-[hsl(var(--brand-purple))] text-white">
                <BookOpen className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">
                    {brand?.has_dossier
                      ? <>Vibe is dialled into <span className="text-[hsl(var(--brand-pink))]">{brand.brand_name || "your brand"}</span></>
                      : "Teach Vibe your brand"}
                  </h2>
                  {brandLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {brand?.headline || (brandLoading ? "Reading your dossier…" : "Upload a dossier so Vibe can plan around your brand.")}
                </p>
                {brand?.summary && (
                  <p className="mt-2 text-xs text-muted-foreground/80 leading-relaxed">{brand.summary}</p>
                )}
                {!brand?.has_dossier && !brandLoading && (
                  <Button size="sm" className="mt-3" onClick={() => navigate("/app/dossier")}>Open Dossier</Button>
                )}
              </div>
            </div>

            {brand?.suggestions && brand.suggestions.length > 0 && (
              <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:[&>*:nth-child(odd)]:border-r md:[&>*:nth-child(even)]:border-r-0">
                {brand.suggestions.map((s) => {
                  const Icon = ICON_MAP[s.icon ?? "sparkles"] ?? Sparkles;
                  return (
                    <button
                      key={s.title}
                      onClick={() => go(s.prompt)}
                      className="group flex items-start gap-3 p-4 text-left transition-colors hover:bg-[hsl(var(--brand-pink)/0.04)]"
                    >
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--brand-pink)/0.1)] text-[hsl(var(--brand-pink))]">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground">{s.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{s.why}</div>
                      </div>
                      <ArrowRight className="mt-1 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  );
                })}
              </div>
            )}

            {brand?.plan && brand.plan.length > 0 && (
              <div className="border-t border-border bg-secondary/30 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-[hsl(var(--brand-pink))]" />
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Sample week — drafted from your dossier</div>
                  </div>
                  <button
                    onClick={() => navigate("/app/publishing/plan-week")}
                    className="text-xs font-medium text-[hsl(var(--brand-pink))] hover:underline"
                  >
                    Plan the week →
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-5">
                  {brand.plan.map((p, i) => (
                    <div key={i} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span>{p.day}</span>
                        <span>{p.platform}</span>
                      </div>
                      <div className="mt-1.5 text-xs font-medium text-foreground line-clamp-3">{p.hook}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground line-clamp-1">{p.angle}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* KPI strip */}
        <div className="mt-14 grid grid-cols-2 gap-x-2 gap-y-6 md:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.label} className="text-center">
              <div className="font-serif text-3xl tabular-nums text-foreground">{k.value}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {k.label}
              </div>
            </div>
          ))}
        </div>

        {/* Vibe's Desk — drafts awaiting approval */}
        <div className="mt-14 rounded-2xl border-t-2 border-t-[hsl(var(--brand-pink))] border border-border bg-card shadow-[var(--shadow-card)]">
          <div className="border-b border-border p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[hsl(var(--brand-pink))]" />
              <h2 className="text-base font-semibold">Vibe's Desk</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Drafts waiting for your sign-off — nothing goes live until you approve.
            </p>
          </div>
          <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            <DeskCell
              title="Discover creators"
              body="Run a live scan across TikTok and Instagram for your next campaign."
              onClick={() => navigate("/app/discover")}
            />
            <DeskCell
              title="Review replies"
              body="Vibe will summarise inbound messages and draft on-brand answers."
              onClick={() => navigate("/app/messages")}
            />
            <DeskCell
              title="Plan with Vibe"
              body="Open a strategy session — angle, niches, keywords, ready in minutes."
              onClick={() => navigate("/app/ask-vibe")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DeskCell({ title, body, onClick }: { title: string; body: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start p-5 text-left transition-colors hover:bg-[hsl(var(--brand-pink)/0.04)]"
    >
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{body}</div>
      <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--brand-pink))]">
        Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
