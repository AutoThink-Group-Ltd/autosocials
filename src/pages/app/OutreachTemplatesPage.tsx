import { useState, useEffect } from "react";
import { 
  Plus, Pencil, Trash2, Copy, Search, 
  Save, FileText, Eye, Send, Loader2, Users, Mail, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useCommissionSettings } from "@/hooks/useCommissionSettings";

// ─── Default system templates (seeded on first visit) ───────
const SYSTEM_TEMPLATES = [
  {
    name: "Affiliate Invite",
    emoji: "💰",
    template_type: "affiliate",
    description: "Invite creators to earn commission promoting your product",
    subject: "Partnership opportunity — earn commission promoting [Your Brand]",
    body: `Hi {name},

I've been following your {platform} content and love what you're doing in the {niche} space. Your audience of {followers} is exactly who we built [Your Brand] for.

We'd love to invite you to our affiliate program where you can earn {commission} commission on every sale you drive. We provide:

• Custom tracking links & discount codes
• Free product access
• Marketing materials & content ideas
• Dedicated support

Would you be interested in learning more? Happy to jump on a quick call.`,
  },
  {
    name: "Sponsorship Deal",
    emoji: "🤝",
    template_type: "sponsorship",
    description: "Propose a paid sponsorship or brand deal",
    subject: "Sponsorship opportunity with [Your Brand] — {name}",
    body: `Hi {name},

I'm reaching out from [Your Brand]. We've been watching your content on {platform} and think you'd be an amazing partner for a sponsored collaboration.

 Here's what we have in mind:

• 1-2 sponsored posts/videos
• Creative freedom to present our product authentically
• Competitive compensation based on your reach of {followers}

Your {niche} content resonates perfectly with our target audience, and we'd love to discuss how we can work together.

Are you open to a quick chat this week?`,
  },
  {
    name: "UGC Request",
    emoji: "🎬",
    template_type: "ugc",
    description: "Request user-generated content for ads and social",
    subject: "We'd love your content — UGC opportunity with [Your Brand]",
    body: `Hi {name},

We're huge fans of your {platform} content style! We're looking for talented creators to produce UGC (User Generated Content) for [Your Brand].

What we need:

• [X] short-form videos featuring our product
• Authentic, unscripted style (your natural voice!)
• Usage rights for our social channels & ads

We handle shipping, provide a creative brief, and pay per deliverable. Your {niche} expertise makes you a perfect fit.

Interested? I'll send over the details and rates.`,
  },
  {
    name: "Collaboration",
    emoji: "✨",
    template_type: "collab",
    description: "General collaboration or brand ambassador invite",
    subject: "Let's collaborate — {name} x [Your Brand]",
    body: `Hey {name}!

Quick intro — I'm [Your Name] from [Your Brand]. We've been admiring your work in the {niche} space and wanted to reach out about a potential collaboration.

We think there's a great synergy between your audience of {followers} and what we do. Some ideas:

• Co-created content series
• Exclusive discount for your community
• Product seeding & honest review
• Long-term brand ambassador role

We're flexible and open to ideas — what type of collaboration interests you most?`,
  },
  {
    name: "Product Seeding",
    emoji: "🎁",
    template_type: "product_seeding",
    description: "Send free product in exchange for organic content",
    subject: "Gift from [Your Brand] — no strings attached, {name}",
    body: `Hi {name},

I'm [Your Name] from [Your Brand]. We love your {platform} content in the {niche} space and wanted to send you our product — completely free, no strings attached.

We believe in letting creators share genuine experiences. If you love it, great! If you'd like to create content about it, even better. But there's absolutely no obligation.

Would you like us to send you [product]? Just reply with your shipping address and preference.`,
  },
  {
    name: "Event Invite",
    emoji: "🎉",
    template_type: "event_invite",
    description: "Invite creators to brand events or launches",
    subject: "VIP invite: [Your Brand] [event name] — {name}",
    body: `Hi {name},

We're hosting [event name] on [date] and would love for you to join us as a VIP guest!

Event details:

• Date: [date]
• Location: [venue/virtual link]
• What to expect: [brief description]

As a {niche} creator with {followers} followers, your perspective would be incredibly valuable. We'll cover [travel/accommodation/etc.] and you're welcome to create content during the event.

Would you like to attend? I can send over the full details.`,
  },
  {
    name: "Ad Whitelisting",
    emoji: "📱",
    template_type: "whitelisting",
    description: "Request permission to run ads through their account",
    subject: "Paid ad partnership — run ads on your {platform} account",
    body: `Hi {name},

I'm [Your Name] from [Your Brand]. We'd love to partner with you on a whitelisting/spark ads campaign.

How it works:

• We create or co-create content featuring our product
• You post it on your {platform} account
• We boost it as a paid ad through your handle
• You earn a flat fee + potential performance bonuses

Your {niche} audience of {followers} is a perfect fit. This is a great way to earn without creating extra content.

Interested in learning more about rates and terms?`,
  },
  {
    name: "Ambassador Program",
    emoji: "🏆",
    template_type: "long_term",
    description: "Invite to a long-term brand ambassador relationship",
    subject: "Join [Your Brand]'s Creator Ambassador Program — {name}",
    body: `Hi {name},

I'm reaching out because we're building an exclusive ambassador program at [Your Brand], and you're exactly the type of creator we're looking for.

What our ambassadors get:

• Monthly retainer fee
• Free products every month
• Exclusive discount code with {commission} commission
• Early access to new launches
• Priority for paid campaigns

Commitment: [X] posts per month on {platform} (creative freedom on content style).

With your {followers} followers and authentic {niche} content, you'd be an amazing fit. Want to hear more?`,
  },
  {
    name: "Podcast/Interview",
    emoji: "🎙️",
    template_type: "podcast_guest",
    description: "Invite a creator as a guest on your show",
    subject: "Guest invite: {name} on [Your Podcast Name]",
    body: `Hi {name},

I'm [Your Name], host of [Your Podcast Name]. I've been following your {platform} content and think your {niche} expertise would make for an amazing episode.

What I have in mind:

• A [30-60] minute conversation about [topic]
• We'd promote it across our channels ([audience size])
• Recorded via [Zoom/in-person]
• Published on [platforms]

Our audience would love to hear your perspective. Would you be open to being a guest?`,
  },
];

const EMOJI_OPTIONS = ["📧", "💰", "🤝", "🎬", "✨", "🎁", "🎉", "📱", "🏆", "🎙️", "✏️", "🚀", "💎", "🔥", "⚡", "💜", "🎯", "📣", "🤩", "👋"];

type Template = {
  id: string;
  workspace_id: string;
  name: string;
  emoji: string;
  description: string | null;
  subject: string;
  body: string;
  template_type: string;
  is_default: boolean;
  position: number;
  created_at: string | null;
  updated_at: string | null;
};

function stripLegacySignoff(text: string): string {
  return text
    .replace(/\n{2,}(best|cheers|kind regards|regards|sincerely)\s*,?\s*\n+\[(?:your name)\]\s*$/i, "")
    .replace(/\n{2,}(best|cheers|kind regards|regards|sincerely)\s*,?\s*\n+\{name\}\s*$/i, "")
    .trimEnd();
}

export default function OutreachTemplatesPage() {
  const { currentWorkspace } = useWorkspace();
  const { profile } = useAuth();
  const { resolveCommission, settings: commissionSettings } = useCommissionSettings();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  // Editor state
  const [editOpen, setEditOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Partial<Template> | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  // Preview dialog
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  // Send test state
  const [sendTestTemplate, setSendTestTemplate] = useState<Template | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [teamMembers, setTeamMembers] = useState<{ user_id: string; full_name: string; email: string }[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);

  // Load team members when send test dialog opens
  useEffect(() => {
    if (!sendTestTemplate || !currentWorkspace?.id) return;
    setLoadingTeam(true);
    setTestSent(false);
    supabase
      .rpc("get_workspace_members_with_email", { _workspace_id: currentWorkspace.id })
      .then(({ data }) => {
        setTeamMembers((data || []) as any[]);
        setLoadingTeam(false);
      });
  }, [sendTestTemplate, currentWorkspace?.id]);

  async function handleSendTest() {
    if (!testEmail.trim() || !sendTestTemplate || !currentWorkspace?.id) return;
    setSendingTest(true);

    // Resolve actual commission value
    const resolved = resolveCommission();
    let commissionLabel = "20%";
    if (commissionSettings) {
      const ct = commissionSettings.commission_type;
      if (ct === "percentage") commissionLabel = `${commissionSettings.default_percentage}%`;
      else if (ct === "flat_fee") commissionLabel = `${commissionSettings.currency} ${commissionSettings.default_flat_fee}`;
      else commissionLabel = `${commissionSettings.default_percentage}% + ${commissionSettings.currency} ${commissionSettings.default_flat_fee}`;
    }

    const brandName = currentWorkspace?.name || "Your Brand";
    const senderName = profile?.full_name?.split(/\s+/)[0] || "Your Name";
    const brandWebsite = currentWorkspace?.website || "";
    const brandLink = brandWebsite
      ? `<a href="${brandWebsite}" style="color:#E91E8C;text-decoration:underline;">${brandName}</a>`
      : brandName;

    const replaceBrandPlain = (text: string) =>
      text
        .replace(/\[Your Brand\]/gi, brandName)
        .replace(/\[Your Name\]/gi, senderName)
        .replace(/\{commission\}/gi, commissionLabel)
        .replace(/\[X\]%/gi, commissionLabel);

    const replaceBrandHtml = (text: string) =>
      text
        .replace(/\[Your Brand\]/gi, brandLink)
        .replace(/\[Your Name\]/gi, senderName)
        .replace(/\{commission\}/gi, commissionLabel)
        .replace(/\[X\]%/gi, commissionLabel);

    // Fill placeholders with sample data
    const fillSample = (text: string) =>
      text
        .replace(/\{name\}/gi, "Jane")
        .replace(/\{username\}/gi, "janedoe")
        .replace(/\{platform\}/gi, "TikTok")
        .replace(/\{niche\}/gi, "fitness")
        .replace(/\{followers\}/gi, "125K");

    const sampleBody = fillSample(replaceBrandPlain(stripLegacySignoff(sendTestTemplate.body)));
    const sampleSubject = fillSample(replaceBrandPlain(sendTestTemplate.subject));

    const htmlBody = fillSample(replaceBrandHtml(stripLegacySignoff(sendTestTemplate.body)))
      .split("\n")
      .map((line) => (line.trim() === "" ? "<br>" : `<p>${line}</p>`))
      .join("");

    try {
      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          workspace_id: currentWorkspace.id,
          to_email: testEmail.trim(),
          to_name: "Test Recipient",
          subject: `[TEST] ${sampleSubject}`,
          body_html: htmlBody,
          confirmed: true,
        },
      });
      if (error) throw error;
      setTestSent(true);
      toast.success(`Test email sent to ${testEmail.trim()}`);
      setTimeout(() => {
        setSendTestTemplate(null);
        setTestSent(false);
      }, 1500);
    } catch (err) {
      console.error("Send test failed:", err);
      toast.error("Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  }

  // Load templates
  useEffect(() => {
    if (currentWorkspace?.id) loadTemplates();
  }, [currentWorkspace?.id]);

  async function loadTemplates() {
    if (!currentWorkspace?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("outreach_templates")
      .select("*")
      .eq("workspace_id", currentWorkspace.id)
      .order("position", { ascending: true });

    if (error) {
      console.error("Error loading templates:", error);
      toast.error("Failed to load templates");
      setLoading(false);
      return;
    }

    // Seed defaults on first visit
    if (!data || data.length === 0) {
      await seedDefaults();
    } else {
      const sanitizedTemplates = (data as Template[]).map((template) => ({
        ...template,
        body: stripLegacySignoff(template.body),
      }));
      setTemplates(sanitizedTemplates);
    }
    setLoading(false);
  }

  async function seedDefaults() {
    if (!currentWorkspace?.id) return;
    const rows = SYSTEM_TEMPLATES.map((t, i) => ({
      workspace_id: currentWorkspace.id,
      name: t.name,
      emoji: t.emoji,
      template_type: t.template_type,
      description: t.description,
      subject: t.subject,
      body: t.body,
      is_default: true,
      position: i,
    }));

    const { data, error } = await supabase
      .from("outreach_templates")
      .insert(rows)
      .select();

    if (error) {
      console.error("Error seeding templates:", error);
      return;
    }
    setTemplates((data || []) as Template[]);
  }

  function openCreate() {
    setEditTemplate({
      name: "",
      emoji: "📧",
      description: "",
      subject: "",
      body: `Hi {name},\n\n[Write your message here]`,
      template_type: "custom",
      is_default: false,
    });
    setEditOpen(true);
  }

  function openEdit(t: Template) {
    setEditTemplate({ ...t });
    setEditOpen(true);
  }

  async function handleDuplicate(t: Template) {
    if (!currentWorkspace?.id) return;
    const { data, error } = await supabase
      .from("outreach_templates")
      .insert({
        workspace_id: currentWorkspace.id,
        name: `${t.name} (Copy)`,
        emoji: t.emoji,
        description: t.description,
        subject: t.subject,
        body: t.body,
        template_type: "custom",
        is_default: false,
        position: templates.length,
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to duplicate template");
      return;
    }
    setTemplates((prev) => [...prev, data as Template]);
    toast.success("Template duplicated!");
  }

  async function handleSave() {
    if (!editTemplate || !currentWorkspace?.id) return;
    if (!editTemplate.name?.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (!editTemplate.subject?.trim()) {
      toast.error("Subject line is required");
      return;
    }

    setSaving(true);

    if (editTemplate.id) {
      // Update
      const { error } = await supabase
        .from("outreach_templates")
        .update({
          name: editTemplate.name,
          ...(editTemplate.emoji !== undefined ? { emoji: editTemplate.emoji } : {}),
          description: editTemplate.description || null,
          subject: editTemplate.subject,
          body: editTemplate.body || "",
          updated_at: new Date().toISOString(),
        })
        .eq("id", editTemplate.id);

      if (error) {
        toast.error("Failed to save template");
        setSaving(false);
        return;
      }
      setTemplates((prev) =>
        prev.map((t) => (t.id === editTemplate.id ? { ...t, ...editTemplate } as Template : t))
      );
      toast.success("Template updated!");
    } else {
      // Insert
      const { data, error } = await supabase
        .from("outreach_templates")
        .insert({
          workspace_id: currentWorkspace.id,
          name: editTemplate.name,
          emoji: editTemplate.emoji || "📧",
          description: editTemplate.description || null,
          subject: editTemplate.subject,
          body: editTemplate.body || "",
          template_type: editTemplate.template_type || "custom",
          is_default: false,
          position: templates.length,
        })
        .select()
        .single();

      if (error) {
        toast.error("Failed to create template");
        setSaving(false);
        return;
      }
      setTemplates((prev) => [...prev, data as Template]);
      toast.success("Template created!");
    }

    setSaving(false);
    setEditOpen(false);
    setEditTemplate(null);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase
      .from("outreach_templates")
      .delete()
      .eq("id", deleteId);

    if (error) {
      toast.error("Failed to delete template");
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== deleteId));
    toast.success("Template deleted");
    setDeleteId(null);
  }

  const PLACEHOLDERS = ["{name}", "{username}", "{platform}", "{niche}", "{followers}", "{commission}"];

  const filtered = templates.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.template_type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Outreach Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage email templates for creator outreach. Use placeholders like {"{name}"} to auto-personalize.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          New Template
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="pl-9"
        />
      </div>

      {/* Templates grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-5 h-32" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">
            {search ? "No templates match your search" : "No templates yet — create your first one!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((t) => (
            <Card
              key={t.id}
              className="group hover:shadow-md transition-all border-border hover:border-primary/30"
            >
              <CardContent className="p-5 space-y-3">
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xl flex-shrink-0">{t.emoji}</span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{t.name}</h3>
                      {t.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{t.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewTemplate(t)} title="Preview">
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setTestEmail(""); setSendTestTemplate(t); }} title="Send Test">
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicate(t)} title="Duplicate">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(t.id)}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Subject preview */}
                <div className="bg-secondary/50 rounded-md px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Subject</p>
                  <p className="text-sm text-foreground truncate">{t.subject || "(no subject)"}</p>
                </div>

                {/* Body snippet */}
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {t.body?.split("\n").filter(Boolean)[0] || "(empty body)"}
                </p>

                {/* Quick preview button + tags */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{t.template_type}</Badge>
                    {t.is_default && <Badge variant="outline" className="text-[10px]">System</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => { setTestEmail(""); setSendTestTemplate(t); }}
                    >
                      <Send className="w-3 h-3" /> Send Test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setPreviewTemplate(t)}
                    >
                      <Eye className="w-3 h-3" /> Preview
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Edit/Create Dialog ──────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) { setEditOpen(false); setEditTemplate(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTemplate?.id ? "Edit Template" : "New Template"}</DialogTitle>
          </DialogHeader>

          {editTemplate && (
            <div className="space-y-5 py-2">
              {/* Emoji + Name */}
              <div className="flex gap-3">
                <div className="space-y-1.5">
                  <Label>Icon</Label>
                  <div className="flex flex-wrap gap-1 max-w-[180px]">
                    {EMOJI_OPTIONS.map((e) => (
                      <button
                        key={e}
                        onClick={() => setEditTemplate((prev) => prev ? { ...prev, emoji: e } : null)}
                        className={`w-8 h-8 rounded-md text-lg flex items-center justify-center transition-all ${
                          editTemplate.emoji === e
                            ? "bg-primary/10 ring-2 ring-primary/40"
                            : "hover:bg-secondary"
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <Label>Template Name *</Label>
                    <Input
                      value={editTemplate.name || ""}
                      onChange={(e) => setEditTemplate((prev) => prev ? { ...prev, name: e.target.value } : null)}
                      placeholder="e.g. Product Launch Invite"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input
                      value={editTemplate.description || ""}
                      onChange={(e) => setEditTemplate((prev) => prev ? { ...prev, description: e.target.value } : null)}
                      placeholder="Brief description of this template"
                    />
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Subject Line *</Label>
                  <div className="flex gap-1">
                    {PLACEHOLDERS.map((p) => (
                      <button
                        key={p}
                        onClick={() =>
                          setEditTemplate((prev) =>
                            prev ? { ...prev, subject: (prev.subject || "") + ` ${p}` } : null
                          )
                        }
                        className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  value={editTemplate.subject || ""}
                  onChange={(e) => setEditTemplate((prev) => prev ? { ...prev, subject: e.target.value } : null)}
                  placeholder="Email subject line..."
                />
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Email Body</Label>
                  <div className="flex gap-1">
                    {PLACEHOLDERS.map((p) => (
                      <button
                        key={p}
                        onClick={() =>
                          setEditTemplate((prev) =>
                            prev ? { ...prev, body: (prev.body || "") + p } : null
                          )
                        }
                        className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <Textarea
                  value={editTemplate.body || ""}
                  onChange={(e) => setEditTemplate((prev) => prev ? { ...prev, body: e.target.value } : null)}
                  rows={14}
                  className="resize-none font-mono text-sm leading-relaxed"
                  placeholder="Write your email body here..."
                />
              </div>

              {/* Placeholder legend */}
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs font-medium text-foreground mb-1.5">Available Placeholders</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span><code className="text-primary">{"{name}"}</code> — Creator's name</span>
                  <span><code className="text-primary">{"{username}"}</code> — Their handle</span>
                  <span><code className="text-primary">{"{platform}"}</code> — e.g. TikTok</span>
                  <span><code className="text-primary">{"{niche}"}</code> — Content niche</span>
                  <span><code className="text-primary">{"{followers}"}</code> — Follower count</span>
                  <span><code className="text-primary">{"{commission}"}</code> — From settings</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditOpen(false); setEditTemplate(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : editTemplate?.id ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Preview Dialog ──────────────────────────────────── */}
      <Dialog open={!!previewTemplate} onOpenChange={(o) => !o && setPreviewTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {previewTemplate && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="text-xl">{previewTemplate.emoji}</span>
                  {previewTemplate.name}
                </DialogTitle>
                {previewTemplate.description && (
                  <p className="text-sm text-muted-foreground">{previewTemplate.description}</p>
                )}
              </DialogHeader>

              <div className="space-y-4 mt-2">
                <div className="bg-secondary/50 rounded-lg px-4 py-3 border border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Subject</p>
                  <p className="text-sm text-foreground">{previewTemplate.subject}</p>
                </div>

                <div className="bg-secondary/30 rounded-lg px-4 py-4 border border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Body</p>
                  <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                    {previewTemplate.body}
                  </pre>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-muted-foreground mr-1">Placeholders:</span>
                  {["{name}", "{username}", "{platform}", "{niche}", "{followers}"].filter(p =>
                    previewTemplate.subject?.includes(p) || previewTemplate.body?.includes(p)
                  ).map(p => (
                    <Badge key={p} variant="secondary" className="text-[10px] font-mono">{p}</Badge>
                  ))}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => { setPreviewTemplate(null); openEdit(previewTemplate); }}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                </Button>
                <Button variant="outline" onClick={() => { handleDuplicate(previewTemplate); setPreviewTemplate(null); }}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Duplicate
                </Button>
                <Button onClick={() => { setTestEmail(""); setSendTestTemplate(previewTemplate); setPreviewTemplate(null); }}>
                  <Send className="w-3.5 h-3.5 mr-1.5" /> Send Test
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Send Test Dialog ─────────────────────────────────── */}
      <Dialog open={!!sendTestTemplate} onOpenChange={(o) => { if (!o) { setSendTestTemplate(null); setTestSent(false); } }}>
        <DialogContent className="max-w-md">
          {sendTestTemplate && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" />
                  Send Test Email
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Send a test of <span className="font-medium text-foreground">{sendTestTemplate.emoji} {sendTestTemplate.name}</span> with sample placeholder data.
                </p>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Manual email input */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Recipient Email</Label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="Enter email address..."
                      className="text-sm"
                    />
                  </div>
                </div>

                {/* Quick-add from team */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Users className="w-3 h-3" /> Quick Add from Team
                  </Label>
                  {loadingTeam ? (
                    <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading team members...
                    </div>
                  ) : teamMembers.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No team members found.</p>
                  ) : (
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {teamMembers.map((m) => (
                        <button
                          key={m.user_id}
                          onClick={() => setTestEmail(m.email)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                            testEmail === m.email
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-secondary border border-transparent"
                          }`}
                        >
                          <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground truncate text-xs">{m.full_name || "Team Member"}</p>
                            <p className="text-muted-foreground truncate text-[11px]">{m.email}</p>
                          </div>
                          {testEmail === m.email && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sample data info */}
                <div className="bg-secondary/50 rounded-lg p-3 border border-border">
                  <p className="text-[11px] text-muted-foreground">
                    Placeholders will be filled with sample data: <span className="font-mono text-primary">{"{name}"}</span> → Jane, <span className="font-mono text-primary">{"{platform}"}</span> → TikTok, <span className="font-mono text-primary">{"{followers}"}</span> → 125K
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setSendTestTemplate(null); setTestSent(false); }}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSendTest}
                  disabled={!testEmail.trim() || sendingTest || testSent}
                  className="gap-1.5"
                >
                  {sendingTest ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                  ) : testSent ? (
                    <><Check className="w-3.5 h-3.5" /> Sent!</>
                  ) : (
                    <><Send className="w-3.5 h-3.5" /> Send Test</>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation ──────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this template. You can always recreate it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
