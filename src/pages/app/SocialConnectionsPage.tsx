import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { getInsightsPermissions } from "@/lib/social-insights.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Facebook, Instagram, Music2, Youtube, Twitter, Linkedin, Loader2, Plug, CheckCircle2, AlertCircle, Search } from "lucide-react";

type Platform = "facebook" | "instagram" | "tiktok" | "youtube" | "x" | "linkedin";

interface SocialAccount {
  id: string;
  platform: Platform;
  external_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  expires_at: string | null;
  last_error: string | null;
  is_enabled: boolean;
}

const PLATFORM_META: Record<Platform, { label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = {
  facebook: { label: "Facebook Page", icon: Facebook, description: "Publish to your Facebook Pages." },
  instagram: { label: "Instagram Business", icon: Instagram, description: "Publish photos, carousels and Reels." },
  tiktok: { label: "TikTok", icon: Music2, description: "Publish videos via the TikTok Content Posting API." },
  youtube: { label: "YouTube channel", icon: Youtube, description: "Upload and schedule reviewed videos to YouTube." },
  x: { label: "X account", icon: Twitter, description: "Publish and schedule posts to X." },
  linkedin: { label: "LinkedIn", icon: Linkedin, description: "Publish and schedule posts to a profile or Company Page." },
};

interface PendingPage {
  id: string;
  name: string;
  facebook_publishable?: boolean;
  instagram_publishable?: boolean;
  instagram_business_account?: { id: string; username?: string; name?: string } | null;
}
interface PendingYouTubeChannel { id: string; title: string; handle: string | null; avatar_url: string | null }
interface LinkedInPage { id: string; name: string; vanity?: string }

function LinkedInCompanyAvatar({ account, workspaceId, connected }: {
  account: SocialAccount;
  workspaceId: string;
  connected: boolean;
}) {
  const [avatarUrl, setAvatarUrl] = useState(account.avatar_url);
  const attempted = useRef(false);

  useEffect(() => {
    if (avatarUrl || !connected || attempted.current) return;
    attempted.current = true;
    void supabase.functions.invoke<{ avatar_url: string | null }>("linkedin-account", {
      body: { action: "refresh_company_avatar", social_account_id: account.id, workspace_id: workspaceId },
    }).then(({ data }) => {
      if (data?.avatar_url) setAvatarUrl(data.avatar_url);
    }).catch(() => {
      // The LinkedIn icon stays visible if the logo cannot be loaded.
    });
  }, [account.id, avatarUrl, connected, workspaceId]);

  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt=""
      className="w-9 h-9 shrink-0 rounded-full object-cover"
      onError={() => setAvatarUrl(null)}
    />
  ) : (
    <div className="w-9 h-9 shrink-0 rounded-full bg-secondary flex items-center justify-center">
      <Linkedin className="w-4 h-4 text-muted-foreground" />
    </div>
  );
}

export default function SocialConnectionsPage({ embedded = false, onAccountsChanged }: { embedded?: boolean; onAccountsChanged?: () => void } = {}) {
  const { currentWorkspace } = useWorkspace();
  const { isSuperAdmin } = useSuperAdmin();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [insightsPermissions, setInsightsPermissions] = useState<Record<string, boolean>>({});
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [search, setSearch] = useSearchParams();
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingPages, setPendingPages] = useState<PendingPage[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSaving, setPickerSaving] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerPlatform, setPickerPlatform] = useState("all");
  const [youtubePendingId, setYoutubePendingId] = useState<string | null>(null);
  const [youtubeChannels, setYoutubeChannels] = useState<PendingYouTubeChannel[]>([]);
  const [youtubeSelectedId, setYoutubeSelectedId] = useState("");
  const [youtubeSaving, setYoutubeSaving] = useState(false);
  const [linkedinPicker, setLinkedinPicker] = useState<{ id: string; workspace: string; pages: LinkedInPage[] } | null>(null);
  const [linkedinPage, setLinkedinPage] = useState("");
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinSaving, setLinkedinSaving] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<{ account: SocialAccount; workspace: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const lastLinkedinPicker = useRef("");

  const load = async () => {
    if (!currentWorkspace?.id) return;
    setLoading(true);
    setInsightsPermissions({});
    const permissions = getInsightsPermissions({ data: { workspace_id: currentWorkspace.id } }).catch(() => null);
    const { data, error } = await supabase
      .from("social_accounts")
      .select("id, platform, external_id, handle, display_name, avatar_url, status, expires_at, last_error, is_enabled")
      .eq("workspace_id", currentWorkspace.id)
      .order("platform", { ascending: true });
    if (error) toast.error(error.message);
    setAccounts((data ?? []) as SocialAccount[]);
    const insights = await permissions;
    if (insights) setInsightsPermissions(Object.fromEntries(insights.map(account => [account.id, account.hasInsights])));
    else toast.error("Could not check insights permissions.");
    setLoading(false);
    if (!error) onAccountsChanged?.();
  };

  useEffect(() => { load(); }, [currentWorkspace?.id]);

  // If this tab IS the OAuth popup, the callback redirected us back here with
  // ?status=… in the URL. Hand the result to the opener via BroadcastChannel
  // (postMessage doesn't survive Facebook's COOP) and close ourselves.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.name !== "autosocials-oauth") return;
    const status = search.get("status");
    if (!status) return;
    const payload = {
      source: "autosocials-oauth",
      status,
      meta_select: search.get("meta_select") ?? undefined,
      youtube_select: search.get("youtube_select") ?? undefined,
      linkedin_select: search.get("linkedin_select") ?? undefined,
      connected: search.get("connected") ?? undefined,
      error: search.get("error") ?? undefined,
    };
    try {
      const ch = new BroadcastChannel("autosocials-oauth");
      ch.postMessage(payload);
      ch.close();
    } catch { /* noop */ }
    try { window.opener?.postMessage(payload, window.location.origin); } catch { /* noop */ }
    setTimeout(() => { try { window.close(); } catch { /* noop */ } }, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Surface ?connected= / ?error= from OAuth callback redirects
  useEffect(() => {
    // Skip param handling in the popup window — the effect above forwards
    // the result and closes the tab.
    if (typeof window !== "undefined" && window.name === "autosocials-oauth") return;
    const connected = search.get("connected");
    const err = search.get("error");
    const metaSelect = search.get("meta_select");
    const youtubeSelect = search.get("youtube_select");
    const linkedinSelect = search.get("linkedin_select");
    if (connected) {
      toast.success(`${connected.charAt(0).toUpperCase() + connected.slice(1)} connected`);
      load();
      search.delete("connected"); setSearch(search, { replace: true });
    }
    if (err) {
      toast.error(`Connection failed: ${err}`);
      search.delete("error"); setSearch(search, { replace: true });
    }
    if (metaSelect) {
      void openPicker(metaSelect);
      search.delete("meta_select"); setSearch(search, { replace: true });
    }
    if (youtubeSelect) { void openYouTubePicker(youtubeSelect); search.delete("youtube_select"); setSearch(search, { replace: true }); }
    if (linkedinSelect && currentWorkspace?.id) { void openLinkedInPicker(linkedinSelect); search.delete("linkedin_select"); setSearch(search, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.toString(), currentWorkspace?.id]);

  const openPicker = async (id: string) => {
    setPendingId(id);
    setPickerOpen(true);
    setPickerLoading(true);
    setSelectedPageIds(new Set());
    setPickerQuery("");
    const { data, error } = await supabase.functions.invoke("meta-import-pages", { body: { pending_id: id, action: "list", workspace_id: currentWorkspace?.id } });
    setPickerLoading(false);
    if (error || data?.error || !data?.pages) { toast.error("This selection link expired. Please reconnect."); setPickerOpen(false); return; }
    setPendingPages(data.pages as PendingPage[]);
    setPickerPlatform("all");
  };
  const openYouTubePicker = async (id: string) => {
    setYoutubePendingId(id);
    const { data, error } = await supabase.functions.invoke("youtube-account", { body: { action:"list_pending", pending_id:id, workspace_id:currentWorkspace?.id } });
    if (error || data?.error || !Array.isArray(data?.channels) || !data.channels.length) { toast.error(data?.error ?? "No YouTube channels were available."); setYoutubePendingId(null); return; }
    setYoutubeChannels(data.channels as PendingYouTubeChannel[]); setYoutubeSelectedId(data.channels[0].id);
  };
  const selectYouTubeChannel = async () => {
    if (!youtubePendingId || !youtubeSelectedId || !currentWorkspace?.id) return;
    setYoutubeSaving(true);
    const { data,error } = await supabase.functions.invoke("youtube-account",{body:{action:"select_pending",pending_id:youtubePendingId,channel_id:youtubeSelectedId,workspace_id:currentWorkspace.id}});
    setYoutubeSaving(false);
    if(error||data?.error){toast.error(data?.error??"Could not connect this channel.");return;}
    setYoutubePendingId(null);setYoutubeChannels([]);toast.success(`Connected YouTube channel: ${data.channel}`);load();
  };
  const openLinkedInPicker = async (id: string) => {
    const workspace = currentWorkspace?.id;
    if (!workspace || lastLinkedinPicker.current === workspace + id) return;
    lastLinkedinPicker.current = workspace + id;
    setLinkedinPicker({ id, workspace, pages: [] });
    setLinkedinPage("");
    setLinkedinLoading(true);
    const { data, error } = await supabase.functions.invoke("linkedin-account", {
      body: { action: "list_pages", pending_id: id, workspace_id: workspace },
    });
    setLinkedinLoading(false);
    if (error || !Array.isArray(data?.pages) || !data.pages.length) {
      toast.error("Could not open the LinkedIn Page list. Please reconnect.");
      setLinkedinPicker(current => current?.id === id ? null : current);
      return;
    }
    setLinkedinPicker(current => current?.id === id ? { ...current, pages: data.pages as LinkedInPage[] } : current);
  };
  const selectLinkedInPage = async () => {
    if (!linkedinPage || !linkedinPicker || linkedinPicker.workspace !== currentWorkspace?.id) return;
    setLinkedinSaving(true);
    const { data, error } = await supabase.functions.invoke("linkedin-account", {
      body: { action: "select_page", pending_id: linkedinPicker.id, page_id: linkedinPage, workspace_id: linkedinPicker.workspace },
    });
    setLinkedinSaving(false);
    if (error || !data?.page) {
      toast.error("Could not connect this Page. Try again or reconnect if the selection expired.");
      return;
    }
    setLinkedinPicker(null);
    toast.success(`Connected LinkedIn Page: ${data.page}`);
    void load();
  };

  const togglePage = (id: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const importSelected = async () => {
    if (!pendingId || selectedPageIds.size === 0) return;
    setPickerSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-import-pages", {
        body: { pending_id: pendingId, account_keys: Array.from(selectedPageIds), workspace_id: currentWorkspace?.id },
      });
      if (error || data?.error) throw error ?? new Error(data.error);
      const imported = (data as { imported?: number })?.imported ?? 0;
      toast.success(`Connected ${imported} account${imported === 1 ? "" : "s"}`);
      setPickerOpen(false);
      setPendingId(null);
      setPendingPages([]);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setPickerSaving(false);
    }
  };

  const startOAuth = async (platform: Platform, analytics = false, sandbox = false, linkedinKind: "profile" | "company" = "profile") => {
    if (!currentWorkspace?.id) return;
    setConnecting(platform);
    // Open the popup synchronously inside the click handler so browsers don't
    // block it. We'll point it at the auth URL once the init function returns.
    const w = 600;
    const h = 720;
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
    const popup = window.open(
      "about:blank",
      "autosocials-oauth",
      `popup=yes,width=${w},height=${h},left=${left},top=${top}`,
    );
    if (!popup) {
      toast.error("Popup blocked. Allow popups for this site and try again.");
      setConnecting(null);
      return;
    }
    try {
      const fnName = platform === "linkedin" ? "linkedin-oauth-init" : platform === "x" ? "x-oauth-init" : platform === "tiktok" ? "tiktok-oauth-init" : platform === "youtube" ? "youtube-oauth-init" : "meta-oauth-init";
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: {
          workspace_id: currentWorkspace.id,
          analytics,
          sandbox,
          analytics_platform: platform,
          ...(platform === "linkedin" ? { account_kind: linkedinKind } : {}),
          // Public bridge page handles handoff back to this tab.
          redirect_to: `${window.location.origin}/oauth/bridge`,
        },
      });
      if (error) throw error;
      const authUrl = (data as { authUrl?: string; error?: string })?.authUrl;
      if (!authUrl) throw new Error((data as { error?: string })?.error ?? "No auth URL returned");
      // Drive the popup to the provider. The callback page will postMessage
      // back to us and close itself, so the Lovable preview iframe never
      // tries to embed Facebook/TikTok directly (they refuse, which produced
      // the grey screen).
      popup.location.href = authUrl;
    } catch (e) {
      try { popup.close(); } catch { /* noop */ }
      toast.error(e instanceof Error ? e.message : "Failed to start OAuth");
      setConnecting(null);
    }
  };

  // Listen for the popup callback handshake (BroadcastChannel for cross-COOP
  // popups, postMessage as a belt-and-braces fallback).
  useEffect(() => {
    if (typeof window !== "undefined" && window.name === "autosocials-oauth") return;
    const handle = (data: { source?: string; status?: string; meta_select?: string; youtube_select?: string; linkedin_select?: string; connected?: string; error?: string } | null) => {
      if (!data || data.source !== "autosocials-oauth") return;
      setConnecting(null);
      if (data.status === "error" && data.error) {
        toast.error(`Connection failed: ${data.error}`);
        return;
      }
      if (data.status === "meta_select" && data.meta_select) {
        void openPicker(data.meta_select);
        return;
      }
      if(data.status === "youtube_select" && data.youtube_select){void openYouTubePicker(data.youtube_select);return;}
      if (data.status === "linkedin_select" && data.linkedin_select) { void openLinkedInPicker(data.linkedin_select); return; }
      if (data.status === "connected" && data.connected) {
        toast.success(`${data.connected.charAt(0).toUpperCase() + data.connected.slice(1)} connected`);
        load();
      }
    };
    const onMessage = (ev: MessageEvent) => { if (ev.origin === window.location.origin) handle(ev.data); };
    window.addEventListener("message", onMessage);
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel("autosocials-oauth");
      ch.onmessage = (ev) => handle(ev.data);
    } catch { /* noop */ }
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== "autosocials-oauth" || !ev.newValue) return;
      try { handle(JSON.parse(ev.newValue)); } catch { /* noop */ }
      try { localStorage.removeItem("autosocials-oauth"); } catch { /* noop */ }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      try { ch?.close(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id]);

  const disconnect = async () => {
    if (!disconnectTarget || disconnectTarget.workspace !== currentWorkspace?.id || disconnecting) return;
    const { account, workspace } = disconnectTarget;
    const fnName = account.platform === "linkedin" ? "linkedin-account" : account.platform === "x" ? "x-account" : account.platform === "youtube" ? "youtube-account" : "meta-import-pages";
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke(fnName, { body: { action: "disconnect", social_account_id: account.id, workspace_id: workspace } });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Disconnect failed.");
      setDisconnectTarget(null);
      toast.success("Disconnected");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect this account.");
    } finally {
      setDisconnecting(false);
    }
  };

  const toggleEnabled = async (id: string, next: boolean) => {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, is_enabled: next } : a)));
    const { error } = await supabase
      .from("social_accounts")
      .update({ is_enabled: next })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    } else {
      onAccountsChanged?.();
    }
  };

  const bulkSet = async (platform: Platform, enabled: boolean) => {
    const ids = accounts.filter((a) => a.platform === platform && a.status !== "disconnected").map((a) => a.id);
    if (!ids.length) return;
    setAccounts((prev) => prev.map((a) => (ids.includes(a.id) ? { ...a, is_enabled: enabled } : a)));
    const { error } = await supabase
      .from("social_accounts")
      .update({ is_enabled: enabled })
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      load();
    } else {
      toast.success(enabled ? "All enabled" : "All hidden");
      onAccountsChanged?.();
    }
  };

  const pickerAccounts = pendingPages.flatMap(p => [
    { key: "facebook:" + p.id, name: p.name, platform: "facebook", handle: p.facebook_publishable ? "Facebook Page" : "Facebook Page · Publishing restricted" },
    ...(p.instagram_business_account ? [{ key: "instagram:" + p.instagram_business_account.id, name: p.instagram_business_account.name ?? p.instagram_business_account.username ?? p.name, platform: "instagram", handle: "@" + (p.instagram_business_account.username ?? "Instagram") + (p.instagram_publishable ? "" : " · Publishing restricted") }] : []),
  ]);
  const visiblePickerAccounts = pickerAccounts.filter(a => (pickerPlatform === "all" || a.platform === pickerPlatform) && (a.name + " " + a.handle).toLowerCase().includes(pickerQuery.trim().toLowerCase()));
  const q = query.trim().toLowerCase();
  const grouped = (["facebook", "instagram", "tiktok", "youtube", "x", "linkedin"] as Platform[]).map((p) => ({
    platform: p,
    items: accounts
      .filter((a) => a.platform === p && a.status !== "disconnected")
      .filter((a) => {
        if (!q) return true;
        return (
          (a.display_name ?? "").toLowerCase().includes(q) ||
          (a.handle ?? "").toLowerCase().includes(q) ||
          (a.external_id ?? "").toLowerCase().includes(q)
        );
      }),
  }));

  return (
    <div className={embedded ? "mx-auto w-full max-w-4xl space-y-4 p-6" : "max-w-4xl mx-auto p-6 space-y-6"}>
      <AlertDialog open={!!disconnectTarget && disconnectTarget.workspace === currentWorkspace?.id} onOpenChange={open => { if (!open && !disconnecting) setDisconnectTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {disconnectTarget?.account.display_name ?? disconnectTarget?.account.handle ?? "this account"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Pending deliveries to this account will stop. Published post history will be kept.
              {disconnectTarget?.account.platform === "youtube" && " Other apps can still use your Google connection."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={disconnecting} onClick={() => void disconnect()}>
              {disconnecting ? "Disconnecting…" : "Disconnect account"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={pickerOpen} onOpenChange={(o) => { if (!pickerSaving) setPickerOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose your accounts</DialogTitle>
            <DialogDescription>
              Select the Facebook Pages and Instagram accounts to connect. You can add more later.
            </DialogDescription>
          </DialogHeader>
          {pickerLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {(
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Search Pages or Instagram accounts…"
                    className="pl-9"
                  />
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{selectedPageIds.size} of {pickerAccounts.length} selected</span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => setSelectedPageIds(prev => new Set([...prev, ...visiblePickerAccounts.map(a => a.key)]))}
                  >
                    Select visible
                  </button>
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => setSelectedPageIds(new Set())}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="flex gap-2" aria-label="Filter accounts">
                {["all", "facebook", "instagram"].map(platform => <Button key={platform} size="sm" variant={pickerPlatform === platform ? "secondary" : "ghost"} onClick={() => setPickerPlatform(platform)}>{platform === "all" ? "All accounts" : platform === "facebook" ? "Facebook" : "Instagram"}</Button>)}
              </div>
              <ul className="max-h-[50vh] overflow-y-auto divide-y divide-border rounded-md border border-border">
                {visiblePickerAccounts.map(account => <li key={account.key}>
                  <label className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={selectedPageIds.has(account.key)} onCheckedChange={() => togglePage(account.key)} aria-label={"Connect " + account.name} />
                    {account.platform === "facebook" ? <Facebook className="w-4 h-4 text-muted-foreground shrink-0" /> : <Instagram className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <div className="min-w-0"><p className="text-sm font-medium truncate">{account.name}</p><p className="text-xs text-muted-foreground truncate">{account.handle}</p></div>
                  </label>
                </li>)}
                {visiblePickerAccounts.length === 0 && <li className="p-4 text-sm text-muted-foreground">No matching accounts.</li>}
              </ul>
            </>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPickerOpen(false)} disabled={pickerSaving}>Cancel</Button>
            <Button onClick={importSelected} disabled={pickerSaving || selectedPageIds.size === 0}>
              {pickerSaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Connect {selectedPageIds.size || ""} {selectedPageIds.size === 1 ? "account" : "accounts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(youtubePendingId)} onOpenChange={open => { if(!open){setYoutubePendingId(null);setYoutubeChannels([]);} }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Choose YouTube channel</DialogTitle><DialogDescription>Select the channel AutoSocials will use for uploads. Scheduled videos publish through YouTube at the time you choose.</DialogDescription></DialogHeader>
          <div className="space-y-2">{youtubeChannels.map(channel=><label key={channel.id} className="flex cursor-pointer items-center gap-3 rounded-md border p-3"><input type="radio" name="youtube-channel" checked={youtubeSelectedId===channel.id} onChange={()=>setYoutubeSelectedId(channel.id)} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{channel.title}</span><span className="block truncate text-xs text-muted-foreground">{channel.handle??channel.id}</span></span></label>)}</div>
          <DialogFooter><Button variant="outline" onClick={()=>setYoutubePendingId(null)}>Cancel</Button><Button disabled={!youtubeSelectedId||youtubeSaving} onClick={selectYouTubeChannel}>{youtubeSaving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:null}Connect selected channel</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkedinPicker && linkedinPicker.workspace === currentWorkspace?.id} onOpenChange={open => { if (!open && !linkedinSaving) setLinkedinPicker(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a LinkedIn Company Page</DialogTitle>
            <DialogDescription>Select the Page to use for publishing and scheduling in this workspace.</DialogDescription>
          </DialogHeader>
          {linkedinLoading ? <p role="status" className="text-sm text-muted-foreground">Loading your Pages…</p> : (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {linkedinPicker?.pages.map(page => (
                <label key={page.id} className="flex cursor-pointer items-center gap-3 rounded-md border p-3">
                  <input type="radio" name="linkedin-page" checked={linkedinPage === page.id} onChange={() => setLinkedinPage(page.id)} />
                  <span>{page.name}{page.vanity && <span className="block text-xs text-muted-foreground">/company/{page.vanity}</span>}</span>
                </label>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={linkedinSaving} onClick={() => setLinkedinPicker(null)}>Cancel</Button>
            <Button disabled={!linkedinPage || linkedinLoading || linkedinSaving} onClick={() => void selectLinkedInPage()}>Connect selected Page</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div>
        <h1 className="text-2xl font-semibold text-foreground">{embedded ? "Connect your accounts" : "Connected accounts"}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your Facebook Pages, Instagram Business accounts, TikTok, YouTube channels, X accounts and LinkedIn accounts to publish content from AutoSocials.
          Use the toggle to choose which accounts appear in the composer and scheduler.
        </p>
      </div>

      {accounts.length > 6 && (
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Pages or accounts…"
            className="pl-9"
          />
        </div>
      )}

      {grouped.map(({ platform, items }) => {
        const meta = PLATFORM_META[platform];
        const Icon = meta.icon;
        const active = accounts.filter(a => a.platform === platform && a.status !== "disconnected");
        const total = active.length;
        const enabledCount = active.filter(a => a.is_enabled).length;
        return (
          <Card key={platform}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                  <Icon className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">{meta.label}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {total > 0
                      ? `${enabledCount} of ${total} enabled · ${meta.description}`
                      : meta.description}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {platform === "tiktok" && isSuperAdmin && <Button variant="outline" size="sm" onClick={() => startOAuth("tiktok", true, true)} disabled={!!connecting || !currentWorkspace?.id}>Connect sandbox</Button>}
                {total > 1 && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => bulkSet(platform, true)}>
                      Enable all
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => bulkSet(platform, false)}>
                      Hide all
                    </Button>
                  </>
                )}
                {platform === "linkedin" && <Button size="sm" onClick={() => void startOAuth("linkedin", false, false, "company")} disabled={!!connecting || !currentWorkspace?.id}>Connect Company Page</Button>}
                <Button
                  variant={platform === "linkedin" ? "outline" : "default"}
                  size="sm"
                  onClick={() => startOAuth(platform)}
                  disabled={connecting === platform || !currentWorkspace?.id}
                >
                  {connecting === platform ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Plug className="w-4 h-4 mr-1.5" />
                  )}
                  {platform === "linkedin" ? "Connect profile" : "Connect"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No {meta.label} connected.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((a) => {
                    const expired = a.platform !== "youtube" && a.platform !== "x" && a.expires_at && new Date(a.expires_at) < new Date();
                    const ok = a.status === "connected" && !expired;
                    const companyPage = a.platform === "linkedin" && a.external_id.startsWith("organization:");
                    const sandbox = a.platform === "tiktok" && a.external_id.startsWith("sandbox:");
                    return (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center gap-3 py-3"
                      >
                        {companyPage && currentWorkspace?.id ? (
                          <LinkedInCompanyAvatar
                            key={`${currentWorkspace.id}:${a.avatar_url ?? ""}:${a.expires_at ?? ""}`}
                            account={a}
                            workspaceId={currentWorkspace.id}
                            connected={ok}
                          />
                        ) : a.avatar_url ? (
                          <img src={a.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {a.display_name ?? a.handle ?? a.external_id}
                          </p>
                          {a.platform === "tiktok" && a.external_id.startsWith("sandbox:") && <Badge variant="outline">Sandbox</Badge>}
                          {a.platform === "linkedin" && <Badge variant="outline">{a.external_id.startsWith("organization:") ? "Company Page" : "Personal profile"}</Badge>}
                          {a.handle && a.display_name && (
                            <p className="text-xs text-muted-foreground truncate">@{a.handle}</p>
                          )}
                          {a.last_error && <p className="text-xs text-destructive mt-0.5">{a.last_error}</p>}
                        </div>
                        {insightsPermissions[a.id] === false && <Button variant="outline" size="sm" onClick={() => startOAuth(a.platform, true, sandbox)} disabled={!!connecting || !currentWorkspace?.id}>Enable insights</Button>}
                        <Badge variant={ok ? "secondary" : "destructive"} className="gap-1">
                          {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          {a.last_error?.startsWith("Publishing restricted") ? "Publishing restricted" : ok ? "Connected" : expired ? "Reconnect needed" : a.status}
                        </Badge>
                        <div className="flex items-center gap-1.5 pl-1" title={a.is_enabled ? "Visible in composer" : "Hidden from composer"}>
                          <Switch
                            aria-label="Show this account in the composer and scheduler"
                            checked={a.is_enabled}
                            onCheckedChange={(v) => toggleEnabled(a.id, v)}
                          />
                        </div>
                        {(!ok || !a.is_enabled) && <Button variant="outline" size="sm" onClick={() => void startOAuth(a.platform, false, sandbox, companyPage ? "company" : "profile")} disabled={!!connecting || !currentWorkspace?.id}>Reconnect</Button>}
                        <Button variant="ghost" size="sm" onClick={() => { if (currentWorkspace?.id) setDisconnectTarget({ account: a, workspace: currentWorkspace.id }); }}>Disconnect</Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
