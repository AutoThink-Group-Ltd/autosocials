import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { startAutomaticBrandDiscovery } from "@/lib/brand-discovery.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationMatrix } from "@/components/settings/NotificationMatrix";
import { PublishingNotifications } from "@/components/settings/PublishingNotifications";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { creatorsApi } from "@/lib/api/creators";
import {
  User, Building2, Bell, Shield, Instagram, Mail, AtSign,
  CheckCircle2, Loader2, KeyRound, ChevronRight, Lock, Eye, EyeOff, Camera,
} from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { EmailSettingsTab } from "@/components/settings/EmailSettingsTab";
import { AgencyDisconnectSection } from "@/components/settings/AgencyDisconnectSection";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { ProfileForm } from "@/features/profile/ProfileForm";
import { ElevenLabsCard } from "@/features/integrations/ElevenLabsCard";
import { ClientSocialSettings } from "@/components/settings/ClientSocialSettings";

type SettingsTab = "profile" | "workspace" | "socials" | "integrations" | "email" | "notifications" | "security" | "connections";

const tabs = [
  { id: "profile" as SettingsTab, icon: User, label: "Profile" },
  { id: "workspace" as SettingsTab, icon: Building2, label: "Workspace" },
  { id: "socials" as SettingsTab, icon: AtSign, label: "Socials" },
  { id: "integrations" as SettingsTab, icon: KeyRound, label: "Integrations" },
  { id: "email" as SettingsTab, icon: Mail, label: "Email" },
  { id: "notifications" as SettingsTab, icon: Bell, label: "Notifications" },
  { id: "security" as SettingsTab, icon: Shield, label: "Security" },
  { id: "connections" as SettingsTab, icon: Instagram, label: "Connections" },
];

const SettingsPage = () => {
  const { user, profile } = useAuth();
  const { currentWorkspace, refetchWorkspaces } = useWorkspace();
  const navigate = useNavigate();
  const isAgencyManaging = profile?.account_type === "agency" && !!currentWorkspace;

  const visibleTabs = isAgencyManaging
    ? tabs.filter((t) => !["security"].includes(t.id))
    : tabs;

  const [activeTab, setActiveTab] = useState<SettingsTab>(isAgencyManaging ? "workspace" : "profile");

  // Agencies managing a client land on the client's workspace settings
  useEffect(() => {
    if (isAgencyManaging) setActiveTab("workspace");
  }, [currentWorkspace?.id, isAgencyManaging]);

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isAgencyManaging ? `Manage ${currentWorkspace?.name || "client"} workspace` : "Manage your account and workspace"}
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <nav className="md:w-52 flex-shrink-0">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                <tab.icon className="w-4 h-4 flex-shrink-0" />
                {tab.id === "workspace" ? currentWorkspace?.name || tab.label : tab.label}
              </button>
            ))}
            <Link to="/app/settings/deleted-items" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:bg-secondary/60 hover:text-foreground">
              <Trash2 className="size-4 shrink-0" aria-hidden />Deleted Items
            </Link>
            <Link to="/app/settings/agent-access" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:bg-secondary/60 hover:text-foreground">
              <KeyRound className="size-4 shrink-0" aria-hidden />API and AI agents
            </Link>
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === "profile" && <ProfileSection isAgencyManaging={isAgencyManaging} {...(currentWorkspace?.id !== undefined ? { workspaceId: currentWorkspace.id } : {})} />}
          {activeTab === "workspace" && <WorkspaceSection />}
          {activeTab === "socials" && (currentWorkspace ? <ClientSocialSettings workspaceId={currentWorkspace.id} website={currentWorkspace.website} /> : <p className="text-muted-foreground py-8">No workspace found.</p>)}
          {activeTab === "integrations" && (currentWorkspace ? <ElevenLabsCard workspaceId={currentWorkspace.id} /> : <p className="text-muted-foreground py-8">No workspace found.</p>)}
          {activeTab === "email" && <EmailSettingsTab />}
          {activeTab === "notifications" && <NotificationsSection />}
          {activeTab === "security" && !isAgencyManaging && <SecuritySection />}
          {activeTab === "connections" && <ConnectionsSection />}
        </div>
      </div>
    </div>
  );
};

/* ─── Profile ─── */
function ProfileSection(_: { isAgencyManaging: boolean; workspaceId?: string }) {
  return <ProfileForm />;
}

/* ─── Workspace ─── */
function WorkspaceSection() {
  const { currentWorkspace, refetchWorkspaces } = useWorkspace();
  const startBrandDiscovery = useServerFn(startAutomaticBrandDiscovery);
  const { profile } = useAuth();
  const [name, setName] = useState(currentWorkspace?.name || "");
  const [website, setWebsite] = useState(currentWorkspace?.website || "");
  const [phone, setPhone] = useState(currentWorkspace?.phone || "");
  const [address, setAddress] = useState(currentWorkspace?.address || "");
  const [contactName, setContactName] = useState(currentWorkspace?.contact_name || "");
  const [bookingLink, setBookingLink] = useState(currentWorkspace?.booking_link || "");
  const [clientEmail, setClientEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState(currentWorkspace?.logo_url || "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [timezone, setTimezone] = useState<string>(
    (currentWorkspace as any)?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );

  useEffect(() => {
    if (currentWorkspace) {
      setName(currentWorkspace.name || "");
      setWebsite(currentWorkspace.website || "");
      setPhone(currentWorkspace.phone || "");
      setAddress(currentWorkspace.address || "");
      setContactName(currentWorkspace.contact_name || "");
      setLogoUrl(currentWorkspace.logo_url || "");
      setBookingLink(currentWorkspace.booking_link || "");
      setTimezone(
        (currentWorkspace as any).timezone ||
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          "UTC",
      );
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    if (!currentWorkspace || profile?.account_type !== "agency") return;
    const fetchClientEmail = async () => {
      const { data } = await supabase
        .from("agency_clients")
        .select("client_contact_email")
        .eq("workspace_id", currentWorkspace.id)
        .maybeSingle();
      if (data?.client_contact_email) setClientEmail(data.client_contact_email);
    };
    fetchClientEmail();
  }, [currentWorkspace?.id, profile?.account_type]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentWorkspace) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File must be under 5MB"); return; }

    setUploadingLogo(true);
    const ext = file.name.split(".").pop();
    const filePath = `${currentWorkspace.id}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage.from("workspace-logos").upload(filePath, file, { upsert: true });
    if (uploadError) { toast.error("Upload failed: " + uploadError.message); setUploadingLogo(false); return; }

    const { data: urlData } = supabase.storage.from("workspace-logos").getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl + "?t=" + Date.now();

    const { error: updateError } = await supabase
      .from("workspaces")
      .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", currentWorkspace.id);

    if (updateError) toast.error(updateError.message);
    else {
      setLogoUrl(publicUrl);
      toast.success("Logo updated");
      await refetchWorkspaces();
    }
    setUploadingLogo(false);
  };

  const handleRemoveLogo = async () => {
    if (!currentWorkspace) return;
    setUploadingLogo(true);
    const { error } = await supabase
      .from("workspaces")
      .update({ logo_url: null, updated_at: new Date().toISOString() })
      .eq("id", currentWorkspace.id);
    if (error) toast.error(error.message);
    else {
      setLogoUrl("");
      toast.success("Logo removed");
      await refetchWorkspaces();
    }
    setUploadingLogo(false);
  };

  const handleSave = async () => {
    if (!currentWorkspace) return;
    setSaving(true);
    const { error } = await supabase
      .from("workspaces")
      .update({ name, website, phone, address, contact_name: contactName, booking_link: bookingLink || null, timezone, updated_at: new Date().toISOString() } as any)
      .eq("id", currentWorkspace.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Workspace updated");
      await refetchWorkspaces();
      void startBrandDiscovery({ data: { workspace_id: currentWorkspace.id } }).catch(() => toast.error("Brand scan could not start. You can retry from Brand assets."));
    }
    setSaving(false);
  };

  if (!currentWorkspace) {
    return <p className="text-muted-foreground py-8">No workspace found.</p>;
  }

  const wsInitial = currentWorkspace.name?.charAt(0) || "W";

  return (
    <>
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-lg">{currentWorkspace.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-5">
          <div className="relative group">
            {logoUrl ? (
              <img src={logoUrl} alt="Workspace logo" className="w-16 h-16 rounded-xl object-cover border-2 border-border" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center border-2 border-border">
                <span className="text-lg font-bold text-primary">{wsInitial}</span>
              </div>
            )}
            <button
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              {uploadingLogo ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
            </button>
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Workspace logo</p>
            <p className="text-xs text-muted-foreground">JPG, PNG, WebP or SVG. Max 5MB.</p>
            {logoUrl && (
              <button onClick={handleRemoveLogo} disabled={uploadingLogo} className="text-xs text-destructive hover:underline mt-1">
                Remove logo
              </button>
            )}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Workspace Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Contact Name</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          {clientEmail && (
            <div className="space-y-2">
              <Label>Client Email</Label>
              <Input value={clientEmail} disabled className="bg-secondary/50" />
            </div>
          )}
          <div className="space-y-2">
            <Label>Website</Label>
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Booking Link</Label>
            <Input value={bookingLink} onChange={(e) => setBookingLink(e.target.value)} placeholder="https://calendly.com/your-link" />
            <p className="text-xs text-muted-foreground">Auto-inserted into outreach emails as a clickable "Book a call" link</p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Timezone</Label>
            <Input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/London"
              list="tz-list"
            />
            <datalist id="tz-list">
              {[
                "UTC","Europe/London","Europe/Paris","Europe/Berlin","Europe/Madrid","Europe/Amsterdam",
                "America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Toronto",
                "America/Sao_Paulo","Asia/Dubai","Asia/Karachi","Asia/Kolkata","Asia/Singapore","Asia/Tokyo",
                "Asia/Hong_Kong","Australia/Sydney","Pacific/Auckland",
              ].map((tz) => (<option key={tz} value={tz} />))}
            </datalist>
            <p className="text-xs text-muted-foreground">All scheduled posts publish at this timezone's wall-clock time. Currently: {new Date().toLocaleString("en-GB", { timeZone: timezone, hour12: false })}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="brand" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.href = "/app/team"}>
            Manage Team
          </Button>
        </div>
      </CardContent>
    </Card>

    <AgencyDisconnectSection />
    </>
  );
}

/* ─── Notifications ─── */
function NotificationsSection() {
  const { currentWorkspace } = useWorkspace();
  const [emailDigest, setEmailDigest] = useState(true);
  const [newCreators, setNewCreators] = useState(true);
  const [collaborationUpdates, setCollaborationUpdates] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);

  return (
    <div className="space-y-6">
      {currentWorkspace && <PublishingNotifications workspaceId={currentWorkspace.id} />}
      <NotificationMatrix />

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg">Other Notifications</CardTitle>
          <p className="text-sm text-muted-foreground">General notification preferences for this workspace</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Weekly email digest</p>
              <p className="text-xs text-muted-foreground">Summary of your creator discovery activity</p>
            </div>
            <Switch checked={emailDigest} onCheckedChange={setEmailDigest} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">New creator matches</p>
              <p className="text-xs text-muted-foreground">Notify when new creators match your saved searches</p>
            </div>
            <Switch checked={newCreators} onCheckedChange={setNewCreators} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Collaboration updates</p>
              <p className="text-xs text-muted-foreground">Updates on active creator collaborations</p>
            </div>
            <Switch checked={collaborationUpdates} onCheckedChange={setCollaborationUpdates} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Marketing emails</p>
              <p className="text-xs text-muted-foreground">Product updates, tips, and offers</p>
            </div>
            <Switch checked={marketingEmails} onCheckedChange={setMarketingEmails} />
          </div>
          <p className="text-[11px] text-muted-foreground pt-2">
            Notification preferences are saved automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Security ─── */
function SecuritySection() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setSaving(false);
  };

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-lg">Security</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>New Password</Label>
          <div className="relative">
            <Input
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 characters"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowNew(!showNew)}
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Confirm New Password</Label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
          />
        </div>
        <Button variant="brand" onClick={handleChangePassword} disabled={saving || !newPassword}>
          {saving ? "Updating..." : "Update Password"}
        </Button>

        <Separator className="my-4" />
        <div>
          <p className="text-sm font-medium text-foreground mb-1">Two-Factor Authentication</p>
          <p className="text-xs text-muted-foreground mb-3">Add an extra layer of security to your account</p>
          <Button variant="outline" size="sm" disabled>
            <Lock className="w-3.5 h-3.5 mr-1.5" /> Coming Soon
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Connections ─── */
function ConnectionsSection() {
  const [metaStatus, setMetaStatus] = useState<{ connected: boolean; accounts: any[] }>({ connected: false, accounts: [] });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    checkMetaConnection();
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "instagram-connected") {
        toast.success(`Instagram connected! Found ${event.data.accountCount} account(s)`);
        checkMetaConnection();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  async function checkMetaConnection() {
    setIsChecking(true);
    const status = await creatorsApi.getMetaConnectionStatus();
    setMetaStatus(status);
    setIsChecking(false);
  }

  async function handleConnectInstagram() {
    setIsConnecting(true);
    try {
      const result = await creatorsApi.initInstagramOAuth();
      if (result.success && result.authUrl) {
        const w = 600, h = 700;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        window.open(result.authUrl, "instagram-oauth", `width=${w},height=${h},left=${left},top=${top}`);
      } else {
        toast.error(result.error || "Failed to start OAuth");
      }
    } catch {
      toast.error("Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-lg">Platform Connections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Publishing connections — links to the dedicated page */}
        <a
          href="/app/settings/connections"
          className="block rounded-lg border border-border bg-secondary/30 hover:bg-secondary p-4 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0">
              <Instagram className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Publishing accounts</h3>
              <p className="text-xs text-muted-foreground">
                Connect Facebook Pages, Instagram Business and TikTok to publish content.
              </p>
            </div>
            <span className="text-xs font-medium text-primary">Manage →</span>
          </div>
        </a>

        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
            <Instagram className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Instagram scanning (Graph API)</h3>
            <p className="text-xs text-muted-foreground">
              {isChecking
                ? "Checking..."
                : metaStatus.connected
                ? `Connected · ${metaStatus.accounts.length} IG account(s) linked`
                : "Connect to enable richer creator scanning data"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isChecking ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : metaStatus.connected ? (
              <div className="flex items-center gap-1.5 text-emerald-500">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-medium">Connected</span>
              </div>
            ) : (
              <Button size="sm" className="text-xs h-8 gap-1.5" onClick={handleConnectInstagram} disabled={isConnecting}>
                {isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Instagram className="w-3 h-3" />}
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            )}
          </div>
        </div>

        {metaStatus.connected && metaStatus.accounts.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            {metaStatus.accounts.map((acc: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                {acc.ig_profile_picture && (
                  <img src={acc.ig_profile_picture} alt="" className="w-6 h-6 rounded-full" />
                )}
                <span className="font-medium text-foreground">@{acc.ig_username}</span>
                <span className="text-muted-foreground">{acc.ig_followers?.toLocaleString()} followers</span>
                <span className="text-muted-foreground">· {acc.ig_media_count} posts</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SettingsPage;
