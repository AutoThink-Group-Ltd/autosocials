import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Plus, Send, Building2, User, Mail, Globe, AtSign, Trash2 } from "lucide-react";
import { createAgencyClient } from "@/lib/invites.functions";
import { parseClientSocialProfile, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/client-social-profiles";
import { SocialChannelIcon } from "@/components/agency/SocialChannelIcon";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AgencyClientWelcomeSheet, type NewAgencyClient } from "@/features/agency/AgencyClientWelcomeSheet";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/router-compat";

type SocialEntry = { id: number; value: string; platform?: SocialPlatform };

interface InviteClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInviteSent?: () => void;
  mode?: "client" | "agency" | "personal";
}

const InviteClientDialog = ({ open, onOpenChange, onInviteSent, mode = "client" }: InviteClientDialogProps) => {
  const isClient = mode === "client";
  const isPersonal = mode === "personal";
  const create = useServerFn(createAgencyClient);
  const { refetchWorkspaces, setCurrentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [invite, setInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [socials, setSocials] = useState<SocialEntry[]>(isPersonal ? [{ id: 0, value: "", platform: "linkedin" }, { id: 1, value: "", platform: "facebook" }] : []);
  const [nextSocialId, setNextSocialId] = useState(isPersonal ? 2 : 0);
  const [createdClient, setCreatedClient] = useState<NewAgencyClient | null>(null);

  const updateSocial = (id: number, value: string) => setSocials((rows) => rows.map((row) => row.id === id ? { ...row, value, platform: parseClientSocialProfile(value)?.platform ?? (value.trim().startsWith("@") || !value.includes("/") ? row.platform : undefined) } : row));
  const addSocial = () => { setSocials((rows) => [...rows, { id: nextSocialId, value: "" }]); setNextSocialId((id) => id + 1); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) { toast.error(isPersonal ? "Your name is required" : "Business name is required"); return; }
    if (invite && !email.trim()) { toast.error("Add the client's email to invite them"); return; }
    const filledSocials = socials.filter((row) => row.value.trim());
    if (filledSocials.some((row) => !parseClientSocialProfile(row.value, row.platform))) {
      toast.error("Check each social link or choose a platform for a handle."); return;
    }
    setSending(true);
    try {
      const res = await create({ data: {
        name: companyName.trim(), kind: mode, website: isPersonal ? null : website.trim() || null, contactName: isClient ? contactName.trim() || null : null,
        inviteEmail: isClient && invite ? email.trim().toLowerCase() : null,
        socialProfiles: filledSocials.map((row) => ({ value: row.value.trim(), platform: parseClientSocialProfile(row.value, row.platform)!.platform })),
      } });
      toast.success(isClient ? (res.invited ? `${companyName} added and invite sent to ${email}` : `${companyName} added. Invite them any time from People.`) : `${companyName} workspace created.`);
      setCompanyName(""); setWebsite(""); setContactName(""); setEmail(""); setInvite(false); setSocials([]);
      onOpenChange(false);
      setCreatedClient({ workspaceId: res.workspaceId, clientName: res.clientName, website: res.website, socialProfiles: res.socialProfiles, isOwnBrand: !isClient, isPersonal });
      await refetchWorkspaces();
      onInviteSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add the client");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-foreground" />{isClient ? "Add client" : isPersonal ? "Personal brand" : "Your agency"}</DialogTitle>
          <DialogDescription>{isClient ? "Creates a separate workspace for this business. You can start working in it straight away and invite the client later." : isPersonal ? "Create a separate workspace for your personal brand and social profiles." : "Create a separate workspace for your agency’s brand and social profiles."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName" className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-muted-foreground" />{isPersonal ? "Your name" : isClient ? "Business name" : "Agency name"} <span className="text-destructive">*</span></Label>
            <Input id="companyName" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={isPersonal ? "e.g. Alex Smith" : "e.g. Acme Corp"} />
          </div>
          {!isPersonal && <div className="space-y-2">
            <Label htmlFor="website" className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-muted-foreground" />Website</Label>
            <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="acme.com" />
          </div>}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>{isPersonal ? "Your social profiles" : "Social profiles"}</Label>
              <Button type="button" variant="outline" size="sm" onClick={addSocial}><Plus className="mr-1 h-4 w-4" />Add social</Button>
            </div>
            {socials.map((row) => {
              const detected = parseClientSocialProfile(row.value)?.platform;
              const platform = detected ?? row.platform;
              return <div key={row.id} className="flex items-center gap-2">
                {platform ? <SocialChannelIcon platform={platform} className="h-5 w-5 shrink-0 text-muted-foreground" /> : <AtSign aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />}
                <Input aria-label={isPersonal && row.platform === "linkedin" ? "Your LinkedIn profile" : isPersonal && row.platform === "facebook" ? "Your Facebook page" : `Social profile ${row.id + 1}`} value={row.value} onChange={(e) => updateSocial(row.id, e.target.value)} placeholder={isPersonal && row.platform === "linkedin" ? "Your LinkedIn profile" : isPersonal && row.platform === "facebook" ? "Your Facebook page" : "Paste profile link or @handle"} />
                {!detected && <select aria-label={`Platform for social profile ${row.id + 1}`} className="h-10 max-w-28 rounded-md border border-input bg-background px-2 text-sm" value={row.platform ?? ""} onChange={(e) => setSocials((rows) => rows.map((item) => item.id === row.id ? { ...item, platform: e.target.value as SocialPlatform || undefined } : item))}>
                  <option value="">Platform</option>
                  {SOCIAL_PLATFORMS.map((item) => <option key={item} value={item}>{item === "x" ? "X" : item[0].toUpperCase() + item.slice(1)}</option>)}
                </select>}
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove social profile ${row.id + 1}`} onClick={() => setSocials((rows) => rows.filter((item) => item.id !== row.id))}><Trash2 className="h-4 w-4" /></Button>
              </div>;
            })}
            {socials.length > 0 && <p className="text-xs text-muted-foreground">Links detect their platform automatically. Choose a platform for a bare handle.</p>}
          </div>
          {isClient && <><div className="space-y-2">
            <Label htmlFor="contactName" className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-muted-foreground" />Contact name</Label>
            <Input id="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. John Smith" />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div><Label htmlFor="inviteNow" className="text-sm font-medium">Invite the client now</Label><p className="text-xs text-muted-foreground">Optional — you can do this later from People.</p></div>
            <Switch id="inviteNow" checked={invite} onCheckedChange={setInvite} />
          </div>
          {invite && (
            <div className="space-y-2">
              <Label htmlFor="inviteEmail" className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-muted-foreground" />Client email <span className="text-destructive">*</span></Label>
              <Input id="inviteEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@company.com" />
            </div>
          )}
          </>}
          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : invite ? <Send className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {isClient ? (invite ? "Create & send invite" : "Create client") : "Create workspace"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
      <AgencyClientWelcomeSheet client={createdClient} onOpenChange={(nextOpen) => {
        if (nextOpen || !createdClient) return;
        const id = createdClient.workspaceId;
        setCreatedClient(null);
        void (async () => {
          const { data, error } = await supabase.from("workspaces").select("*").eq("id", id).single();
          if (error || !data) { toast.error("Workspace created, but it could not be opened. Choose it from the dashboard."); return; }
          setCurrentWorkspace(data);
          navigate("/app/home");
        })();
      }} />
    </>
  );
};

export default InviteClientDialog;
