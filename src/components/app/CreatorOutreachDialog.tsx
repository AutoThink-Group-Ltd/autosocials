import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Copy, ExternalLink, Check, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type OutreachTemplate = {
  key: string;
  label: string;
  subject: string;
  body: string;
};

type CreatorData = {
  id: string;
  username: string;
  display_name: string | null;
  platform: string;
  follower_count: number | null;
  niches: string[] | null;
  bio: string | null;
  contact_email: string | null;
  raw_data: any;
};

function stripLegacySignoff(text: string): string {
  return text
    .replace(/\n{2,}(best|cheers|kind regards|regards|sincerely)\s*,?\s*\n+\[(?:your name)\]\s*$/i, "")
    .replace(/\n{2,}(best|cheers|kind regards|regards|sincerely)\s*,?\s*\n+\{name\}\s*$/i, "")
    .trimEnd();
}

const templates: OutreachTemplate[] = [
  {
    key: "affiliate",
    label: "Affiliate Invitation",
    subject: "Partnership opportunity — earn commission promoting {brand}",
    body: `Hi {{name}},

I've been following your {{platform}} content and love what you're doing in the {{niche}} space. Your audience of {{followers}} is exactly who we built {brand} for.

We'd love to invite you to our affiliate program where you can earn [X]% commission on every sale you drive. We provide:

• Custom tracking links & discount codes
• Free product access
• Marketing materials & content ideas
• Dedicated support

Would you be interested in learning more? Happy to jump on a quick call or share more details.`,
  },
  {
    key: "sponsorship",
    label: "Sponsorship Proposal",
    subject: "Sponsorship opportunity with {brand}",
    body: `Hi {{name}},

I'm reaching out from {brand}. We've been watching your content on {{platform}} and think you'd be an amazing partner for a sponsored collaboration.

Here's what we have in mind:

• [1-2 sponsored posts/videos]
• Creative freedom to present our product authentically
• Competitive compensation based on your reach

Your {{niche}} content resonates perfectly with our target audience, and we'd love to discuss how we can work together.

Are you open to a quick chat this week?`,
  },
  {
    key: "ugc",
    label: "UGC Request",
    subject: "We'd love your content — UGC opportunity",
    body: `Hi {{name}},

We're huge fans of your {{platform}} content style! We're looking for talented creators to produce UGC (User Generated Content) for {brand}.

What we need:

• [X] short-form videos featuring our product
• Authentic, unscripted style (your natural voice!)
• Usage rights for our social channels & ads

We handle shipping, provide a creative brief, and pay per deliverable. Your {{niche}} expertise makes you a perfect fit.

Interested? I'll send over the details and rates.`,
  },
  {
    key: "collab",
    label: "Collaboration Invite",
    subject: "Let's collaborate — {{name}} x {brand}",
    body: `Hey {{name}}!

Quick intro — I'm {your_name} from {brand}. We've been admiring your work in the {{niche}} space and wanted to reach out about a potential collaboration.

We think there's a great synergy between your audience and what we do. Some ideas:

• Co-created content series
• Exclusive discount for your community
• Product seeding & honest review
• Long-term brand ambassador role

We're flexible and open to ideas — what type of collaboration interests you most?

Looking forward to hearing from you!`,
  },
];

function fillTemplate(body: string, creator: CreatorData): string {
  const fullName = creator.display_name || creator.username;
  const name = fullName.split(/\s+/)[0] ?? fullName;
  const niche = creator.niches?.[0] || "content creation";
  const followers = creator.follower_count
    ? creator.follower_count >= 1_000_000
      ? `${(creator.follower_count / 1_000_000).toFixed(1)}M`
      : creator.follower_count >= 1_000
      ? `${(creator.follower_count / 1_000).toFixed(1)}K`
      : String(creator.follower_count)
    : "your";

  return body
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{platform\}\}/g, creator.platform)
    .replace(/\{\{niche\}\}/g, niche)
    .replace(/\{\{followers\}\}/g, followers);
}

export function CreatorOutreachDialog({ creator }: { creator: CreatorData }) {
  const [selectedTemplate, setSelectedTemplate] = useState("affiliate");
  const [emailBody, setEmailBody] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichedEmail, setEnrichedEmail] = useState<string | null>(null);

  const contactEmail = enrichedEmail || creator.contact_email || (creator.raw_data as any)?.contact_details?.email;

  function applyTemplate(key: string) {
    const t = templates.find((t) => t.key === key);
    if (!t) return;
    setSelectedTemplate(key);
    setEmailSubject(fillTemplate(t.subject, creator));
    setEmailBody(stripLegacySignoff(fillTemplate(t.body, creator)));
  }

  async function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      if (!emailBody) applyTemplate("affiliate");
      // Auto-enrich to find email if none exists
      if (!contactEmail) {
        setEnriching(true);
        try {
          const { data } = await supabase.functions.invoke("enrich-creator", {
            body: { creator_id: creator.id },
          });
          if (data?.success && data.data) {
            const enrichedContact = data.data.contact_email || data.data.raw_data?.contact_details?.email;
            if (enrichedContact) {
              setEnrichedEmail(enrichedContact);
              toast.success(`Email found: ${enrichedContact}`);
            }
          }
        } catch (err) {
          console.error("Enrichment failed:", err);
        } finally {
          setEnriching(false);
        }
      }
    }
  }

  async function generateWithAI() {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-outreach-email", {
        body: {
          creator: {
            username: creator.username,
            display_name: creator.display_name,
            platform: creator.platform,
            follower_count: creator.follower_count,
            niches: creator.niches,
            bio: creator.bio,
          },
          template_type: selectedTemplate,
        },
      });

      if (error) throw error;
      if (data?.subject) setEmailSubject(data.subject);
      if (data?.body) setEmailBody(stripLegacySignoff(data.body));
      toast.success("AI-generated email ready!");
    } catch (err) {
      console.error("AI generation failed:", err);
      toast.error("AI generation failed — using template instead");
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(`Subject: ${emailSubject}\n\n${emailBody}`);
    setCopied(true);
    toast.success("Email copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  function openDM() {
    const username = creator.username;
    const platform = creator.platform;
    let dmUrl = "";
    if (platform === "instagram") {
      dmUrl = `https://www.instagram.com/direct/t/${username}/`;
    } else if (platform === "tiktok") {
      dmUrl = `https://www.tiktok.com/@${username}`;
    }
    if (dmUrl) {
      window.open(dmUrl, "_blank");
    }
  }

  function openMailto() {
    if (!contactEmail) {
      toast.error("No email found for this creator");
      return;
    }
    const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(mailto, "_blank");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="brand" size="sm" className="gap-1.5 text-xs">
          <Mail className="w-3 h-3" /> Contact Creator
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="w-4 h-4 text-primary" />
            Contact {creator.display_name || creator.username}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Email status */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-border">
            {enriching ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Searching for contact email...</span>
              </>
            ) : (
              <>
                <div className={`w-2 h-2 rounded-full ${contactEmail ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span className="text-xs text-muted-foreground">
                  {contactEmail ? (
                    <>Email found: <span className="font-medium text-foreground">{contactEmail}</span></>
                  ) : (
                    "No email found — you can send a DM instead"
                  )}
                </span>
              </>
            )}
          </div>

          {/* Template selector */}
          <div className="flex items-center gap-2">
            <Select value={selectedTemplate} onValueChange={applyTemplate}>
              <SelectTrigger className="flex-1 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.key} value={t.key} className="text-xs">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-9 shrink-0"
              onClick={generateWithAI}
              disabled={generating}
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              AI Personalize
            </Button>
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject</label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Email Body</label>
            <Textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={12}
              className="text-sm resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={copyToClipboard}>
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy Email"}
            </Button>
            {contactEmail ? (
              <Button
                variant="brand"
                size="sm"
                className="flex-1 gap-1.5 text-xs"
                onClick={openMailto}
              >
                <ExternalLink className="w-3 h-3" /> Send via Email Client
              </Button>
            ) : (
              <Button
                variant="brand"
                size="sm"
                className="flex-1 gap-1.5 text-xs"
                onClick={openDM}
                disabled={enriching}
              >
                <ExternalLink className="w-3 h-3" /> Send DM on {creator.platform}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
