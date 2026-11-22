import { useState, useEffect, useCallback, useRef } from "react";
import confetti from "canvas-confetti";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Send, Loader2, MailCheck, AlertCircle, Sparkles, RefreshCw,
  ChevronLeft, ChevronRight, Bold, Italic, Link, List, ListOrdered,
  Type, Minus, Copy, Check, FileText, Wand2, Eye, Mail, UserPlus,
  Zap, Users, CheckSquare, Square, ArrowRight, ArrowLeft, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentRuns } from "@/hooks/useAgentRuns";
import { AgentStateStrip } from "@/components/agent/AgentStateStrip";

function BulkAgentStrip() {
  const { currentWorkspace } = useWorkspace();
  const { activeRun } = useAgentRuns(currentWorkspace?.id, { limit: 5 });
  if (!activeRun) return null;
  return (
    <div className="px-6 pt-1 pb-2">
      <AgentStateStrip run={activeRun} />
    </div>
  );
}
import { useCommissionSettings } from "@/hooks/useCommissionSettings";
import { useUsageGate } from "@/hooks/useUsageGate";
import { useUsageCounts } from "@/hooks/useUsageCounts";
import { UpgradeDialog } from "@/components/app/UpgradeDialog";

// ─── Types ──────────────────────────────────────────────────
export type OutreachCreator = {
  id: string;
  username: string;
  display_name: string | null;
  platform: string;
  follower_count: number | null;
  engagement_rate?: number | null;
  niches: string[] | null;
  bio: string | null;
  contact_email: string | null;
  avatar_url?: string | null;
};

type AIVariation = { subject: string; body: string };

type OutreachTemplate = {
  key: string;
  label: string;
  emoji: string;
  description: string;
  subject: string;
  body: string;
};

function stripLegacySignoff(text: string): string {
  return text
    .replace(/\n{2,}(best|cheers|kind regards|regards|sincerely)\s*,?\s*\n+\[(?:your name)\]\s*$/i, "")
    .replace(/\n{2,}(best|cheers|kind regards|regards|sincerely)\s*,?\s*\n+\{your_name\}\s*$/i, "")
    .replace(/\n{2,}(best|cheers|kind regards|regards|sincerely)\s*,?\s*\n+\{name\}\s*$/i, "")
    .trimEnd();
}

// ─── Templates ──────────────────────────────────────────────
const TEMPLATES: OutreachTemplate[] = [
  {
    key: "affiliate",
    label: "Affiliate Invite",
    emoji: "💰",
    description: "Invite creators to earn commission promoting your product",
    subject: "Partnership opportunity — earn commission promoting {brand}",
    body: `Hi {name},

I've been following your {platform} content and love what you're doing in the {niche} space. Your audience is exactly who we built {brand} for.

We'd love to invite you to our affiliate program where you can earn [X]% commission on every sale you drive. We provide:

• Custom tracking links & discount codes
• Free product access
• Marketing materials & content ideas
• Dedicated support

Would you be interested in learning more? Happy to jump on a quick call.`,
  },
  {
    key: "sponsorship",
    label: "Sponsorship Deal",
    emoji: "🤝",
    description: "Propose a paid sponsorship or brand deal",
    subject: "Sponsorship opportunity with {brand} — {name}",
    body: `Hi {name},

I'm reaching out from {brand}. We've been watching your content on {platform} and think you'd be an amazing partner for a sponsored collaboration.

Here's what we have in mind:

• 1-2 sponsored posts/videos
• Creative freedom to present our product authentically
• Competitive compensation based on your reach

Your {niche} content resonates perfectly with our target audience, and we'd love to discuss how we can work together.

Are you open to a quick chat this week?`,
  },
  {
    key: "ugc",
    label: "UGC Request",
    emoji: "🎬",
    description: "Request user-generated content for ads and social",
    subject: "We'd love your content — UGC opportunity with {brand}",
    body: `Hi {name},

We're huge fans of your {platform} content style! We're looking for talented creators to produce UGC (User Generated Content) for {brand}.

What we need:

• [X] short-form videos featuring our product
• Authentic, unscripted style (your natural voice!)
• Usage rights for our social channels & ads

We handle shipping, provide a creative brief, and pay per deliverable. Your {niche} expertise makes you a perfect fit.

Interested? I'll send over the details and rates.`,
  },
  {
    key: "collab",
    label: "Collaboration",
    emoji: "✨",
    description: "General collaboration or brand ambassador invite",
    subject: "Let's collaborate — {name} x {brand}",
    body: `Hey {name}!

Quick intro — I'm {your_name} from {brand}. We've been admiring your work in the {niche} space and wanted to reach out about a potential collaboration.

We think there's a great synergy between your audience and what we do. Some ideas:

• Co-created content series
• Exclusive discount for your community
• Product seeding & honest review
• Long-term brand ambassador role

We're flexible and open to ideas — what type of collaboration interests you most?

Looking forward to hearing from you!`,
  },
  {
    key: "product_seeding",
    label: "Product Seeding",
    emoji: "🎁",
    description: "Send free product in exchange for organic content",
    subject: "Gift from {brand} — no strings attached, {name}",
    body: `Hi {name},

I'm {your_name} from {brand}. We love your {platform} content in the {niche} space and wanted to send you our product — completely free, no strings attached.

We believe in letting creators share genuine experiences. If you love it, great! If you'd like to create content about it, even better. But there's absolutely no obligation.

Would you like us to send you [product]? Just reply with your shipping address and preference.`,
  },
  {
    key: "event_invite",
    label: "Event Invite",
    emoji: "🎉",
    description: "Invite creators to brand events or launches",
    subject: "VIP invite: {brand} [event name] — {name}",
    body: `Hi {name},

We're hosting [event name] on [date] and would love for you to join us as a VIP guest!

Event details:

• Date: [date]
• Location: [venue/virtual link]
• What to expect: [brief description]

As a {niche} creator, your perspective would be incredibly valuable. We'll cover [travel/accommodation/etc.] and you're welcome to create content during the event.

Would you like to attend? I can send over the full details.`,
  },
  {
    key: "whitelisting",
    label: "Ad Whitelisting",
    emoji: "📱",
    description: "Request permission to run ads through their account",
    subject: "Paid ad partnership — run ads on your {platform} account",
    body: `Hi {name},

I'm {your_name} from {brand}. We'd love to partner with you on a whitelisting/spark ads campaign.

How it works:

• We create or co-create content featuring our product
• You post it on your {platform} account
• We boost it as a paid ad through your handle
• You earn a flat fee + potential performance bonuses

Your {niche} audience is a perfect fit. This is a great way to earn without creating extra content.

Interested in learning more about rates and terms?`,
  },
  {
    key: "long_term",
    label: "Ambassador Program",
    emoji: "🏆",
    description: "Invite to a long-term brand ambassador relationship",
    subject: "Join {brand}'s Creator Ambassador Program — {name}",
    body: `Hi {name},

I'm reaching out because we're building an exclusive ambassador program at {brand}, and you're exactly the type of creator we're looking for.

What our ambassadors get:

• Monthly retainer fee
• Free products every month
• Exclusive discount code with commission
• Early access to new launches
• Priority for paid campaigns

Commitment: [X] posts per month on {platform} (creative freedom on content style).

With your authentic {niche} content, you'd be an amazing fit. Want to hear more?`,
  },
  {
    key: "podcast_guest",
    label: "Podcast/Interview",
    emoji: "🎙️",
    description: "Invite a creator as a guest on your show",
    subject: "Guest invite: {name} on [Your Podcast Name]",
    body: `Hi {name},

I'm {your_name}, host of [Your Podcast Name]. I've been following your {platform} content and think your {niche} expertise would make for an amazing episode.

What I have in mind:

• A [30-60] minute conversation about [topic]
• We'd promote it across our channels ([audience size])
• Recorded via [Zoom/in-person]
• Published on [platforms]

Our audience would love to hear your perspective. Would you be open to being a guest?`,
  },
  {
    key: "interest_check",
    label: "Interest Check",
    emoji: "💬",
    description: "Casually ask if a creator is open to partnerships",
    subject: "Quick question for you, {name}",
    body: `Hi {name},

Hope you don't mind me reaching out! I came across your {platform} content and really enjoy what you're putting out in the {niche} space.

I was wondering — are you currently taking on any sponsorships or affiliate partnerships? We're putting together a list of creators we'd love to work with at {brand} and wanted to check if that's something you'd be interested in.

No pressure at all — just gauging interest at this stage. If it sounds like something you'd be open to, I'd be happy to share more details.

Either way, keep up the great content!`,
  },
  {
    key: "custom",
    label: "Custom Template",
    emoji: "✏️",
    description: "Start from scratch with your own message",
    subject: "",
    body: `Hi {name},

[Write your custom message here]`,
  },
];

// ─── Helpers ────────────────────────────────────────────────
function formatFollowers(n: number | null): string {
  if (!n) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function fillPlaceholders(text: string, creator: OutreachCreator): string {
  const fullName = creator.display_name || creator.username;
  const name = fullName.split(/\s+/)[0] ?? fullName;
  const niche = creator.niches?.[0] || "content creation";
  const followers = formatFollowers(creator.follower_count) || "";
  return text
    .replace(/\{name\}/gi, name)
    .replace(/\{username\}/gi, creator.username)
    .replace(/\{platform\}/gi, creator.platform)
    .replace(/\{niche\}/gi, niche)
    .replace(/\s*of\s+\{followers\}/gi, followers ? ` of ${followers}` : "")
    .replace(/\{followers\}\s*/gi, followers ? `${followers} ` : "")
    ;
}

function fillBrandPlaceholders(text: string, brandName: string, userName: string, commissionLabel: string): string {
  return text
    .replace(/\{brand\}/gi, brandName)
    .replace(/\[Your Brand\]/gi, brandName)
    .replace(/\{your_name\}/gi, userName)
    .replace(/\[Your Name\]/gi, userName)
    .replace(/\{commission\}/gi, commissionLabel)
    .replace(/\[X\]%/gi, commissionLabel);
}

function hyperlinkBrandInHtml(html: string, brandName: string, brandWebsite: string): string {
  if (!brandWebsite || !brandName) return html;
  const escapedName = brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const brandLink = `<a href="${brandWebsite}" style="color:#E91E8C;text-decoration:underline;">${brandName}</a>`;
  return html.replace(new RegExp(escapedName, 'g'), brandLink);
}

const WARMUP_DAILY_LIMITS: Record<string, number> = {
  new: 1000,
  onboarding: 1000,
  warming: 2000,
  warm: 5000,
  graduated: Infinity,
};

function getErrorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
    const nestedError = (error as { error?: unknown }).error;
    if (typeof nestedError === "string") return nestedError;
  }
  return "";
}

function isDailyLimitError(message: string): boolean {
  return /daily send limit reached/i.test(message);
}

function textToHtml(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line.trim() === ""
        ? "<br />"
        : `<p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#333;">${line}</p>`
    )
    .join("");
}

function insertFormatting(
  textarea: HTMLTextAreaElement | null,
  body: string,
  setBody: (v: string) => void,
  wrapper: { before: string; after: string }
) {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = body.slice(start, end);
  const replacement = `${wrapper.before}${selected || "text"}${wrapper.after}`;
  const newBody = body.slice(0, start) + replacement + body.slice(end);
  setBody(newBody);
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(
      start + wrapper.before.length,
      start + wrapper.before.length + (selected || "text").length
    );
  }, 0);
}

// ─── Step indicator ─────────────────────────────────────────
function WizardSteps({ current }: { current: number }) {
  const steps = [
    { num: 1, label: "Compose" },
    { num: 2, label: "Review Creators" },
    { num: 3, label: "Review & Send" },
  ];
  return (
    <div className="flex items-center gap-1 px-6 py-3">
      {steps.map((step, i) => (
        <div key={step.num} className="flex items-center gap-1 flex-1">
          <div className="flex items-center gap-2 flex-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                current === step.num
                  ? "bg-primary text-primary-foreground"
                  : current > step.num
                  ? "bg-primary/20 text-primary"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {current > step.num ? <Check className="w-3.5 h-3.5" /> : step.num}
            </div>
            <span
              className={`text-xs font-medium whitespace-nowrap ${
                current === step.num ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-px flex-1 min-w-[20px] ${current > step.num ? "bg-primary/30" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creators: OutreachCreator[];
  selectedIds: Set<string>;
};

export function BulkOutreachDialog({ open, onOpenChange, creators, selectedIds }: Props) {
  const { currentWorkspace } = useWorkspace();
  const { profile, user } = useAuth();
  const { settings: commissionSettings } = useCommissionSettings();
  const { checkLimit, upgradeDialogProps } = useUsageGate();
  const { counts: usageCounts } = useUsageCounts();

  // Wizard step
  const [step, setStep] = useState(1);

  // Template & content
  const [selectedTemplate, setSelectedTemplate] = useState("affiliate");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [senderName, setSenderName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [composeMode, setComposeMode] = useState<"template" | "custom">("template");

  // Sender identities
  const [senderIdentities, setSenderIdentities] = useState<
    { id: string; sender_name: string; sender_email: string; is_default: boolean; is_verified: boolean }[]
  >([]);
  const [selectedSenderIdentity, setSelectedSenderIdentity] = useState("");

  // AI state
  const [aiVariations, setAiVariations] = useState<AIVariation[]>([]);
  const [aiIndex, setAiIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [aiPreviewCreator, setAiPreviewCreator] = useState<OutreachCreator | null>(null);

  // Send state
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0 });
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);

  // Textarea ref for formatting
  const [textareaRef, setTextareaRef] = useState<HTMLTextAreaElement | null>(null);

  // Email signature
  const [signatureHtml, setSignatureHtml] = useState("");

  // Test email
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testBcc, setTestBcc] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  // Step 2: Enrichment state
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(0);
  const [enrichTotal, setEnrichTotal] = useState(0);

  // Local mutable creators list (to update emails after enrichment)
  const [localCreators, setLocalCreators] = useState<OutreachCreator[]>([]);

  // Sync local creators from props when dialog opens
  useEffect(() => {
    if (open) {
      setLocalCreators(creators.filter((c) => selectedIds.has(c.id)));
    }
  }, [open, creators, selectedIds]);

  // Derived
  const withEmail = localCreators.filter((c) => c.contact_email);
  const withoutEmail = localCreators.length - withEmail.length;

  const getDailySendCapacity = useCallback(async () => {
    if (!currentWorkspace?.id) return null;

    const today = new Date().toISOString().substring(0, 10);
    const [{ data: config }, { data: todayMetrics }] = await Promise.all([
      supabase
        .from("workspace_sendgrid_config")
        .select("warmup_stage")
        .eq("workspace_id", currentWorkspace.id)
        .maybeSingle(),
      supabase
        .from("workspace_sending_metrics")
        .select("emails_sent")
        .eq("workspace_id", currentWorkspace.id)
        .eq("metric_date", today)
        .maybeSingle(),
    ]);

    const warmupStage = (config?.warmup_stage || "onboarding").toLowerCase();
    const dailyLimit = WARMUP_DAILY_LIMITS[warmupStage] ?? 1000;
    const sentToday = todayMetrics?.emails_sent || 0;

    if (dailyLimit === Infinity) {
      return { sentToday, dailyLimit, warmupStage, remaining: null as number | null };
    }

    return {
      sentToday,
      dailyLimit,
      warmupStage,
      remaining: Math.max(0, dailyLimit - sentToday),
    };
  }, [currentWorkspace?.id]);

  // Resolved brand values for previews — always use workspace sender identity
  const brandName = currentWorkspace?.name || "Your Brand";
  const activeIdentity = senderIdentities.find((i) => i.id === selectedSenderIdentity);
  const userName = senderName || activeIdentity?.sender_name?.split(/\s+/)[0] || "Your Name";
  const commissionLabel = (() => {
    if (!commissionSettings) return "20%";
    const ct = commissionSettings.commission_type;
    if (ct === "percentage") return `${commissionSettings.default_percentage}%`;
    if (ct === "flat_fee") return `${commissionSettings.currency} ${commissionSettings.default_flat_fee}`;
    return `${commissionSettings.default_percentage}% + ${commissionSettings.currency} ${commissionSettings.default_flat_fee}`;
  })();

  // Load sender identities
  useEffect(() => {
    async function load() {
      if (!currentWorkspace?.id) return;
      const { data } = await supabase
        .from("sender_identities")
        .select("id, sender_name, sender_email, is_default, is_verified")
        .eq("workspace_id", currentWorkspace.id)
        .order("is_default", { ascending: false });
      const ids = (data || []) as any[];
      setSenderIdentities(ids);
      if (ids.length > 0 && !selectedSenderIdentity) {
        const defaultId = ids.find((i) => i.is_default) || ids[0];
        setSelectedSenderIdentity(defaultId.id);
        if (!senderName) setSenderName(defaultId.sender_name);
        if (!replyTo) setReplyTo(defaultId.sender_email);
      }
    }
    if (open) load();
  }, [open, currentWorkspace?.id]);

  // Load email signature for selected sender identity
  useEffect(() => {
    async function loadSignature() {
      if (!currentWorkspace?.id) return;
      let query = supabase
        .from("email_signatures")
        .select("html_content, sender_identity_id, is_default")
        .eq("workspace_id", currentWorkspace.id);

      if (selectedSenderIdentity) {
        const { data: linked } = await query.eq("sender_identity_id", selectedSenderIdentity).limit(1);
        if (linked && linked.length > 0) {
          setSignatureHtml(linked[0]!.html_content);
          return;
        }
      }
      const { data: defaults } = await supabase
        .from("email_signatures")
        .select("html_content")
        .eq("workspace_id", currentWorkspace.id)
        .eq("is_default", true)
        .limit(1);
      setSignatureHtml(defaults?.[0]?.html_content || "");
    }
    if (open) loadSignature();
  }, [open, currentWorkspace?.id, selectedSenderIdentity]);

  // Set test email default
  useEffect(() => {
    if (open && user?.email) setTestEmailTo(user.email);
  }, [open, user?.email]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSendResult(null);
      setLimitNotice(null);
      setAiVariations([]);
      setAiIndex(0);
      setStep(1);
      setEnriching(false);
      setEnrichProgress(0);
      setEnrichTotal(0);
    }
  }, [open]);

  // Apply template on first open
  useEffect(() => {
    if (open && !emailBody) {
      applyTemplate("affiliate");
    }
  }, [open]);

  function applyTemplate(key: string) {
    const t = TEMPLATES.find((t) => t.key === key);
    if (!t) return;
    setSelectedTemplate(key);
    setEmailSubject(t.subject);
    setEmailBody(stripLegacySignoff(t.body));
    setAiVariations([]);
    setAiIndex(0);
  }

  // ─── AI Generation ───────────────────────────────────────
  async function generateAI() {
    const previewCreator = withEmail[0] || localCreators[0];
    if (!previewCreator) return;

    setGenerating(true);
    setAiPreviewCreator(previewCreator);

    try {
      const { data, error } = await supabase.functions.invoke("generate-outreach-email", {
        body: {
          creator: {
            username: previewCreator.username,
            display_name: previewCreator.display_name,
            platform: previewCreator.platform,
            follower_count: previewCreator.follower_count,
            engagement_rate: previewCreator.engagement_rate,
            niches: previewCreator.niches,
            bio: previewCreator.bio,
          },
          template_type: selectedTemplate,
          variations: 3,
          current_subject: emailSubject,
          current_body: emailBody,
        },
      });

      if (error) throw error;

      const variations: AIVariation[] = data?.variations || [];
      if (data?.subject && data?.body) {
        variations.unshift({ subject: data.subject, body: data.body });
      }

      if (variations.length > 0) {
        setAiVariations(variations);
        setAiIndex(0);
        setEmailSubject(variations[0]!.subject);
        setEmailBody(stripLegacySignoff(variations[0]!.body));
        toast.success(`Generated ${variations.length} AI variation${variations.length !== 1 ? "s" : ""}!`);
      } else {
        toast.error("AI generation returned no results");
      }
    } catch (err) {
      console.error("AI generation failed:", err);
      toast.error("AI generation failed — try again");
    } finally {
      setGenerating(false);
    }
  }

  function navigateAI(direction: -1 | 1) {
    const newIdx = aiIndex + direction;
    if (newIdx < 0 || newIdx >= aiVariations.length) return;
    setAiIndex(newIdx);
    setEmailSubject(aiVariations[newIdx]!.subject);
    setEmailBody(stripLegacySignoff(aiVariations[newIdx]!.body));
  }

  // ─── Bulk Enrichment (Step 2) ────────────────────────────
  async function enrichEmails() {
    const creatorsToEnrich = localCreators.filter((c) => !c.contact_email);
    if (creatorsToEnrich.length === 0) {
      toast.info("All creators already have emails!");
      return;
    }

    setEnriching(true);
    setEnrichTotal(creatorsToEnrich.length);
    setEnrichProgress(0);

    const batchSize = 10;
    let totalFound = 0;

    for (let i = 0; i < creatorsToEnrich.length; i += batchSize) {
      const batch = creatorsToEnrich.slice(i, i + batchSize);
      const batchIds = batch.map((c) => c.id);

      try {
        const { data, error } = await supabase.functions.invoke("bulk-enrich-emails", {
          body: { creator_ids: batchIds, force: false },
        });

        if (!error && data?.results) {
          const enriched = data.results.filter((r: any) => r.email && r.source !== "existing");
          totalFound += enriched.length;

          setLocalCreators((prev) =>
            prev.map((c) => {
              const match = data.results.find((r: any) => r.id === c.id && r.email);
              if (match) {
                return { ...c, contact_email: match.email };
              }
              return c;
            })
          );
        }
      } catch (e) {
        console.error("Enrichment batch error:", e);
      }

      setEnrichProgress(Math.min(i + batchSize, creatorsToEnrich.length));
    }

    setEnriching(false);
    toast.success(`Found ${totalFound} email${totalFound !== 1 ? "s" : ""} out of ${creatorsToEnrich.length} creators`);
  }

  // ─── Send ────────────────────────────────────────────────
  async function handleSend() {
    if (!emailSubject.trim() || !emailBody.trim()) {
      toast.error("Subject and body are required");
      return;
    }

    if (!currentWorkspace?.id) {
      toast.error("No workspace selected");
      return;
    }

    // Check plan-level email limit
    if (!checkLimit("emails", usageCounts.emails)) return;

    const formatLimitMessage = (dailyLimit: number, warmupStage: string, sentToday: number) =>
      `Daily send limit reached (${dailyLimit} emails for "${warmupStage}" warmup stage). ${sentToday} already sent today. Try again tomorrow.`;

    setSending(true);
    setSendProgress({ sent: 0, total: withEmail.length });
    setLimitNotice(null);

    let sent = 0;
    let failed = 0;
    let dailyLimitReachedMessage: string | null = null;

    try {
      const capacity = await getDailySendCapacity();

      if (capacity && capacity.remaining === 0 && capacity.dailyLimit !== Infinity) {
        dailyLimitReachedMessage = formatLimitMessage(capacity.dailyLimit, capacity.warmupStage, capacity.sentToday);
        setLimitNotice(dailyLimitReachedMessage);
        setSendResult({ sent: 0, failed: 0, skipped: withEmail.length + withoutEmail });
        toast.error(dailyLimitReachedMessage);
        return;
      }

      const remainingCapacity = capacity?.remaining ?? null;

      const sendBrandName = currentWorkspace?.name || "Your Brand";
      let sendCommissionLabel = "20%";
      if (commissionSettings) {
        const ct = commissionSettings.commission_type;
        if (ct === "percentage") sendCommissionLabel = `${commissionSettings.default_percentage}%`;
        else if (ct === "flat_fee") sendCommissionLabel = `${commissionSettings.currency} ${commissionSettings.default_flat_fee}`;
        else sendCommissionLabel = `${commissionSettings.default_percentage}% + ${commissionSettings.currency} ${commissionSettings.default_flat_fee}`;
      }

      const sendUserName = senderName || activeIdentity?.sender_name?.split(/\s+/)[0] || "Your Name";
      const brandSubject = fillBrandPlaceholders(emailSubject, sendBrandName, sendUserName, sendCommissionLabel);
      const brandBody = fillBrandPlaceholders(emailBody, sendBrandName, sendUserName, sendCommissionLabel);

      for (const creator of withEmail) {
        if (remainingCapacity !== null && sent >= remainingCapacity) {
          dailyLimitReachedMessage = formatLimitMessage(
            capacity?.dailyLimit ?? 50,
            capacity?.warmupStage ?? "onboarding",
            capacity?.sentToday ?? 0,
          );
          break;
        }

        const personalizedSubject = fillPlaceholders(brandSubject, creator);
        const personalizedBody = stripLegacySignoff(fillPlaceholders(brandBody, creator));
        const htmlBody = hyperlinkBrandInHtml(textToHtml(personalizedBody), sendBrandName, currentWorkspace?.website || "");

        try {
          const { data, error } = await supabase.functions.invoke("send-email", {
            body: {
              workspace_id: currentWorkspace.id,
              to_email: creator.contact_email,
              to_name: creator.display_name || creator.username,
              subject: personalizedSubject,
              body_html: htmlBody,
              sender_identity_id: selectedSenderIdentity || null,
              confirmed: true,
            },
          });

          const functionError = getErrorMessage(error);
          const dataError = typeof data === "object" && data !== null && "error" in data
            ? getErrorMessage((data as { error?: unknown }).error)
            : "";
          const resolvedError = functionError || dataError;

          if (resolvedError) {
            if (isDailyLimitError(resolvedError)) {
              dailyLimitReachedMessage = resolvedError;
              break;
            }
            failed++;
            continue;
          }

          sent++;
          setSendProgress({ sent, total: withEmail.length });
        } catch (err) {
          const resolvedError = getErrorMessage(err);
          if (isDailyLimitError(resolvedError)) {
            dailyLimitReachedMessage = resolvedError;
            break;
          }
          failed++;
        }
      }

      const skippedDueToLimit = dailyLimitReachedMessage
        ? Math.max(0, withEmail.length - sent - failed)
        : 0;

      setSendResult({ sent, failed, skipped: withoutEmail + skippedDueToLimit });

      if (dailyLimitReachedMessage) {
        setLimitNotice(dailyLimitReachedMessage);
        toast.error(dailyLimitReachedMessage);
      } else if (failed > 0) {
        toast.error(`Sent ${sent} email${sent !== 1 ? "s" : ""}, ${failed} failed.`);
      } else if (sent > 0) {
        toast.success(`Sent ${sent} email${sent !== 1 ? "s" : ""}!`);
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.6 },
          colors: ["#E91E8C", "#7c3aed", "#ec4899", "#a855f7", "#f472b6"],
        });
        setTimeout(() => {
          confetti({
            particleCount: 80,
            spread: 120,
            origin: { y: 0.5, x: 0.3 },
            colors: ["#E91E8C", "#7c3aed", "#ec4899"],
          });
        }, 300);
        setTimeout(() => {
          confetti({
            particleCount: 80,
            spread: 120,
            origin: { y: 0.5, x: 0.7 },
            colors: ["#a855f7", "#f472b6", "#7c3aed"],
          });
        }, 500);
      }

      if (sent > 0 || failed > 0) {
        supabase.functions.invoke("test-notification", {
          body: {
            type: "outreach_summary",
            workspace_id: currentWorkspace.id,
            summary: {
              total_creators: localCreators.length,
              with_email: withEmail.length,
              without_email: withoutEmail,
              sent,
              failed,
              skipped: withoutEmail + skippedDueToLimit,
            },
          },
        }).catch(() => {});
      }
    } finally {
      setSending(false);
    }
  }

  // ─── Test Send ───────────────────────────────────────────
  async function handleTestSend() {
    if (!testEmailTo.trim() || !emailSubject.trim() || !emailBody.trim()) {
      toast.error("Subject, body, and test email are required");
      return;
    }
    setSendingTest(true);
    const testCreator = previewCreator || localCreators[0];
    if (!testCreator) { setSendingTest(false); return; }

    const personalizedSubject = fillPlaceholders(
      fillBrandPlaceholders(emailSubject, brandName, userName, commissionLabel),
      testCreator
    );
    const personalizedBody = stripLegacySignoff(
      fillPlaceholders(fillBrandPlaceholders(emailBody, brandName, userName, commissionLabel), testCreator)
    );
    const htmlBody = hyperlinkBrandInHtml(textToHtml(personalizedBody), brandName, currentWorkspace?.website || "");

    try {
      const bccList = testBcc.split(",").map(e => e.trim()).filter(Boolean);
      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          workspace_id: currentWorkspace?.id,
          to_email: testEmailTo.trim(),
          to_name: "Test Email",
          subject: `[TEST] ${personalizedSubject}`,
          body_html: htmlBody,
          sender_identity_id: selectedSenderIdentity || null,
          bcc: bccList.length > 0 ? bccList : undefined,
          confirmed: true,
        },
      });
      if (error) throw error;
      toast.success(`Test email sent to ${testEmailTo}`);
    } catch (err) {
      console.error("Test send failed:", err);
      toast.error("Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  }

  const fmt = useCallback(
    (before: string, after: string) => insertFormatting(textareaRef, emailBody, setEmailBody, { before, after }),
    [textareaRef, emailBody]
  );

  // Preview first creator's personalized version
  const previewCreator = aiPreviewCreator || withEmail[0] || localCreators[0];

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[780px] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Send className="w-5 h-5 text-primary" />
            Creator Outreach
          </DialogTitle>
          <DialogDescription>
            Send to {localCreators.length} creator{localCreators.length !== 1 ? "s" : ""}
            {withoutEmail > 0 && (
              <span className="text-amber-500"> ({withoutEmail} without email)</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {sendResult ? (
          <div className="p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <MailCheck className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Outreach Complete!</h3>
            </div>
            {limitNotice && (
              <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
                {limitNotice}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-emerald-500/10 rounded-lg p-3">
                <div className="text-2xl font-bold text-emerald-500">{sendResult.sent}</div>
                <div className="text-xs text-muted-foreground">Sent</div>
              </div>
              <div className="bg-destructive/10 rounded-lg p-3">
                <div className="text-2xl font-bold text-destructive">{sendResult.failed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
              <div className="bg-secondary rounded-lg p-3">
                <div className="text-2xl font-bold text-muted-foreground">{sendResult.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <WizardSteps current={step} />
            <BulkAgentStrip />

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              {/* ═══ STEP 1: Compose ═══ */}
              {step === 1 && (
                <div className="space-y-4">
                  {/* Template grid - collapsible */}
                  <Collapsible defaultOpen>
                    <CollapsibleTrigger className="flex items-center justify-between w-full group">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer">Choose a template</Label>
                      <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="grid grid-cols-2 gap-2">
                        {TEMPLATES.map((t) => (
                          <button
                            key={t.key}
                            onClick={() => applyTemplate(t.key)}
                            className={`text-left p-3 rounded-lg border transition-all hover:shadow-xs ${
                              selectedTemplate === t.key
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                : "border-border hover:border-primary/30"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-base">{t.emoji}</span>
                              <span className="text-xs font-semibold text-foreground">{t.label}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">{t.description}</p>
                          </button>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  <Collapsible defaultOpen>
                    <CollapsibleTrigger className="flex items-center justify-between w-full group">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer">Compose Email</Label>
                      <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 space-y-4">
                  {/* Sender identity */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sender</Label>
                    {senderIdentities.length > 0 ? (
                      <>
                        <Select value={selectedSenderIdentity} onValueChange={(v) => {
                          setSelectedSenderIdentity(v);
                          const identity = senderIdentities.find((i) => i.id === v);
                          if (identity) {
                            setSenderName(identity.sender_name);
                            setReplyTo(identity.sender_email);
                          }
                        }}>
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {senderIdentities.map((i) => (
                              <SelectItem key={i.id} value={i.id} className="text-xs">
                                {i.sender_name} &lt;{i.sender_email}&gt;
                                {i.is_default && " (default)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(() => {
                          const activeSender = senderIdentities.find((s) => s.id === selectedSenderIdentity);
                          if (activeSender && !activeSender.is_verified) {
                            return (
                              <div className="flex items-center gap-2 bg-destructive/10 rounded-lg px-3 py-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                                <span className="text-[10px] text-destructive">This sender identity is not verified</span>
                                <Badge variant="destructive" className="text-[9px] px-1 py-0">Unverified</Badge>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No sender identities configured. Go to Settings → Email to set up a sender.
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Your Name</Label>
                      <Input
                        placeholder={(() => {
                          const active = senderIdentities.find((i) => i.id === selectedSenderIdentity);
                          return active ? active.sender_name : "e.g. John from BrandX";
                        })()}
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Reply-To Email</Label>
                      <Input
                        type="email"
                        placeholder={(() => {
                          const active = senderIdentities.find((i) => i.id === selectedSenderIdentity);
                          return active ? active.sender_email : "your@email.com";
                        })()}
                        value={replyTo}
                        onChange={(e) => setReplyTo(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>

                  {/* Subject line */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Subject Line</Label>
                      <div className="flex items-center gap-1">
                        {["{name}", "{niche}", "{platform}", "{brand}"].map((p) => (
                          <button
                            key={p}
                            onClick={() => setEmailSubject((s) => s + ` ${p}`)}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Input
                      placeholder={`e.g. Partnership opportunity with ${currentWorkspace?.name || 'Your Brand'}`}
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>

                  {/* AI toolbar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-8"
                      onClick={generateAI}
                      disabled={generating}
                    >
                      {generating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      {generating ? "Generating..." : "AI Personalize"}
                    </Button>

                    {aiVariations.length > 0 && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-xs h-8"
                          onClick={() => generateAI()}
                          disabled={generating}
                        >
                          <RefreshCw className="w-3 h-3" /> Regenerate
                        </Button>
                        <div className="flex items-center gap-1 ml-auto">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigateAI(-1)}
                            disabled={aiIndex === 0}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
                            {aiIndex + 1} / {aiVariations.length}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigateAI(1)}
                            disabled={aiIndex >= aiVariations.length - 1}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>

                  {aiPreviewCreator && aiVariations.length > 0 && (
                    <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
                      {aiPreviewCreator.avatar_url && (
                        <img src={aiPreviewCreator.avatar_url} className="w-5 h-5 rounded-full object-cover" alt="" />
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        AI personalized for <span className="font-semibold text-foreground">@{aiPreviewCreator.username}</span>
                        {" "}— placeholders will personalize for each creator
                      </span>
                    </div>
                  )}

                  {/* Formatting toolbar */}
                  <div className="flex items-center gap-0.5 border border-border rounded-lg p-1 bg-secondary/30">
                    <button
                      onClick={() => fmt("**", "**")}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Bold"
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => fmt("_", "_")}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Italic"
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-4 bg-border mx-0.5" />
                    <button
                      onClick={() => fmt("\n• ", "")}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Bullet list"
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => fmt("\n1. ", "")}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Numbered list"
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-4 bg-border mx-0.5" />
                    <button
                      onClick={() => fmt("[", "](https://)")}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Insert link"
                    >
                      <Link className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => fmt("\n---\n", "")}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Horizontal rule"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex-1" />
                    <div className="flex items-center gap-1">
                      {["{name}", "{username}", "{niche}", "{platform}", "{brand}"].map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            if (textareaRef) {
                              const start = textareaRef.selectionStart;
                              const newBody = emailBody.slice(0, start) + p + emailBody.slice(textareaRef.selectionEnd);
                              setEmailBody(newBody);
                              setTimeout(() => {
                                textareaRef.focus();
                                textareaRef.setSelectionRange(start + p.length, start + p.length);
                              }, 0);
                            } else {
                              setEmailBody((b) => b + p);
                            }
                          }}
                          className="text-[8px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Email body */}
                  <Textarea
                    ref={(el) => setTextareaRef(el)}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    rows={10}
                    className="resize-none text-sm leading-relaxed"
                    style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
                    placeholder="Write your email body here..."
                   />

                    </CollapsibleContent>
                  </Collapsible>

                  {/* Signature preview - always visible */}
                  {signatureHtml && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Email Signature (auto-appended)</Label>
                      <div className="rounded-lg border border-border bg-white p-3 overflow-hidden">
                        <div
                          style={{ transform: "scale(0.8)", transformOrigin: "top left", pointerEvents: "none" }}
                          dangerouslySetInnerHTML={{ __html: signatureHtml }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ STEP 2: Review Creators ═══ */}
              {step === 2 && (
                <div className="space-y-4">
                  {/* Summary stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
                      <div className="text-xl font-bold text-foreground">{localCreators.length}</div>
                      <div className="text-[10px] text-muted-foreground">Total Creators</div>
                    </div>
                    <div className="rounded-lg border border-border bg-emerald-500/5 p-3 text-center">
                      <div className="text-xl font-bold text-emerald-500">{withEmail.length}</div>
                      <div className="text-[10px] text-muted-foreground">With Email</div>
                    </div>
                    <div className="rounded-lg border border-border bg-amber-500/5 p-3 text-center">
                      <div className="text-xl font-bold text-amber-500">{withoutEmail}</div>
                      <div className="text-[10px] text-muted-foreground">Missing Email</div>
                    </div>
                  </div>

                  {/* Enrich button */}
                  {withoutEmail > 0 && (
                    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-primary" />
                          <span className="text-sm font-semibold text-foreground">Find Missing Emails</span>
                        </div>
                        <Button
                          variant="brand"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={enrichEmails}
                          disabled={enriching}
                        >
                          {enriching ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Zap className="w-3.5 h-3.5" />
                          )}
                          {enriching ? "Enriching..." : `Enrich ${withoutEmail} Creators`}
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Our enrichment pipeline will search for contact emails across bio links, websites, and public directories.
                      </p>

                      {/* Enrichment progress */}
                      {enriching && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-foreground font-medium">Enriching emails...</span>
                            <span className="text-muted-foreground">
                              {enrichProgress} / {enrichTotal}
                            </span>
                          </div>
                          <Progress value={enrichTotal > 0 ? (enrichProgress / enrichTotal) * 100 : 0} className="h-2" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Creator list */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Creator List ({localCreators.length})
                    </Label>
                    <ScrollArea className="h-[340px] rounded-lg border border-border">
                      <div className="divide-y divide-border">
                        {localCreators.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/30 transition-colors"
                          >
                            {c.avatar_url ? (
                              <img
                                src={c.avatar_url}
                                className="w-8 h-8 rounded-full object-cover shrink-0"
                                alt=""
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <Users className="w-4 h-4 text-primary" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground truncate">
                                  {c.display_name || c.username}
                                </span>
                                <span className="text-[10px] text-muted-foreground">@{c.username}</span>
                                {c.follower_count && (
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                    {formatFollowers(c.follower_count)}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">
                                  {c.platform}
                                </Badge>
                                {c.niches?.[0] && (
                                  <span className="text-[10px] text-muted-foreground">{c.niches[0]}</span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              {c.contact_email ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                  <span className="text-[10px] text-emerald-600 font-medium max-w-[160px] truncate">
                                    {c.contact_email}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                                  <span className="text-[10px] text-amber-500 font-medium">No email</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  {withoutEmail > 0 && (
                    <div className="flex items-start gap-2 bg-secondary/50 rounded-lg p-2.5 text-xs">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        {withoutEmail} creator{withoutEmail !== 1 ? "s" : ""} without emails will be skipped when sending.
                        Use the enrich button above to find their contact details.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ STEP 3: Review & Send ═══ */}
              {step === 3 && (
                <div className="space-y-4">
                  {previewCreator ? (
                    <>
                      {/* Sender info bar */}
                      {(() => {
                        const active = senderIdentities.find(s => s.id === selectedSenderIdentity);
                        return active ? (
                          <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 text-xs">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              From: <span className="font-semibold text-foreground">{active.sender_name}</span>
                              {" "}&lt;{active.sender_email}&gt;
                            </span>
                          </div>
                        ) : null;
                      })()}

                      {/* Preview creator selector */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Preview for:</span>
                        {previewCreator.avatar_url && (
                          <img src={previewCreator.avatar_url} className="w-5 h-5 rounded-full object-cover" alt="" referrerPolicy="no-referrer" />
                        )}
                        <span className="font-semibold text-foreground">
                          {previewCreator.display_name || previewCreator.username}
                        </span>
                        <span>@{previewCreator.username}</span>
                        {previewCreator.contact_email && (
                          <span className="text-primary">({previewCreator.contact_email})</span>
                        )}
                      </div>

                      {/* Full email preview */}
                      <div className="border border-border rounded-lg overflow-hidden">
                        <div className="bg-secondary/30 px-4 py-2.5 border-b border-border">
                          <div className="text-xs text-muted-foreground">Subject:</div>
                          <div className="text-sm font-medium text-foreground">
                            {fillPlaceholders(fillBrandPlaceholders(emailSubject, brandName, userName, commissionLabel), previewCreator) || "(no subject)"}
                          </div>
                        </div>
                        <div className="px-4 py-4 bg-white">
                          <div
                            className="text-sm leading-relaxed whitespace-pre-wrap"
                            style={{ fontFamily: "system-ui, sans-serif", color: "#333" }}
                            dangerouslySetInnerHTML={{
                              __html: hyperlinkBrandInHtml(
                                (fillPlaceholders(fillBrandPlaceholders(emailBody, brandName, userName, commissionLabel), previewCreator) || "(no body)")
                                  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
                                brandName,
                                currentWorkspace?.website || ""
                              )
                            }}
                          />
                          {signatureHtml && (
                            <div
                              style={{ marginTop: "8px" }}
                              dangerouslySetInnerHTML={{ __html: signatureHtml }}
                            />
                          )}
                        </div>
                      </div>

                      {/* Test email section */}
                      <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Send className="w-4 h-4 text-primary" />
                          <span className="text-xs font-semibold text-foreground">Send Test Email</span>
                          <span className="text-[10px] text-muted-foreground">— check before sending for real</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[11px]">Send test to</Label>
                            <Input
                              value={testEmailTo}
                              onChange={(e) => setTestEmailTo(e.target.value)}
                              placeholder="your@email.com"
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">BCC (optional, comma separated)</Label>
                            <Input
                              value={testBcc}
                              onChange={(e) => setTestBcc(e.target.value)}
                              placeholder="team@company.com, boss@company.com"
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={handleTestSend}
                          disabled={sendingTest || !testEmailTo.trim() || !emailSubject.trim() || !emailBody.trim()}
                        >
                          {sendingTest ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Mail className="w-3.5 h-3.5" />
                          )}
                          {sendingTest ? "Sending..." : "Send Test Email"}
                        </Button>
                      </div>

                      {/* Creator list for preview selection */}
                      {withEmail.length > 1 && (
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">
                            Click a creator to preview their personalized email ({withEmail.length} will receive):
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {withEmail.slice(0, 30).map((c) => (
                              <Badge
                                key={c.id}
                                variant={previewCreator?.id === c.id ? "default" : "secondary"}
                                className="text-[10px] gap-1 cursor-pointer hover:bg-primary/10"
                                onClick={() => setAiPreviewCreator(c)}
                              >
                                {c.avatar_url && (
                                  <img src={c.avatar_url} className="w-3.5 h-3.5 rounded-full object-cover" alt="" referrerPolicy="no-referrer" />
                                )}
                                @{c.username}
                              </Badge>
                            ))}
                            {withEmail.length > 30 && (
                              <Badge variant="secondary" className="text-[10px]">
                                +{withEmail.length - 30} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Eye className="w-8 h-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">No creators with email to preview</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── Footer ─────────────────────────────────── */}
            <div className="px-6 py-3 border-t border-border flex items-center justify-between bg-background">
              <div>
                {step === 1 ? (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => setStep(step - 1)}
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {step === 1 && (
                  <Button
                    variant="brand"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => setStep(2)}
                    disabled={!emailSubject.trim() || !emailBody.trim()}
                  >
                    Review Creators <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
                {step === 2 && (
                  <Button
                    variant="brand"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => setStep(3)}
                    disabled={enriching}
                  >
                    Review & Send <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
                {step === 3 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={handleTestSend}
                      disabled={sendingTest || !testEmailTo.trim() || !emailSubject.trim() || !emailBody.trim()}
                    >
                      {sendingTest ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Mail className="w-3.5 h-3.5" />
                      )}
                      {sendingTest ? "Sending..." : "Send Test"}
                    </Button>
                    <Button
                      variant="brand"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={handleSend}
                      disabled={sending || !emailSubject.trim() || !emailBody.trim() || withEmail.length === 0}
                    >
                      {sending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      {sending ? `Sending ${sendProgress.sent}/${sendProgress.total}...` : `Send to ${withEmail.length}`}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    <UpgradeDialog
      open={upgradeDialogProps.open}
      onOpenChange={upgradeDialogProps.onOpenChange}
      limitType={upgradeDialogProps.limitType}
      {...(upgradeDialogProps.currentUsage !== undefined ? { currentUsage: upgradeDialogProps.currentUsage } : {})}
      {...(upgradeDialogProps.currentLimit !== undefined ? { currentLimit: upgradeDialogProps.currentLimit } : {})}
    />
    </>
  );
}
