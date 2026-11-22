import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Check, ChevronRight, Facebook, Instagram, Loader2, Search, ShieldCheck, Sparkles } from "lucide-react";

type PendingPage = {
  id: string;
  name: string;
  facebook_publishable?: boolean;
  instagram_publishable?: boolean;
  instagram_business_account?: { id: string; username?: string; name?: string } | null;
};

type Choice = {
  key: string;
  name: string;
  detail: string;
  platform: "facebook" | "instagram";
  publishable: boolean;
};

async function connectionError(error: unknown, data: { error?: string } | null, fallback: string): Promise<Error> {
  if (data?.error) return new Error(data.error);
  const response = (error as { context?: Response } | null)?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json() as { error?: string };
      if (body.error) return new Error(body.error);
    } catch { /* The gateway may return a non-JSON error. */ }
  }
  return new Error(fallback);
}

export function MetaConnectWizard({ workspaceId, onConnected }: { workspaceId: string | undefined; onConnected: () => void }) {
  const [step, setStep] = useState<"connect" | "choose" | "ready">("connect");
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pages, setPages] = useState<PendingPage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<"all" | "facebook" | "instagram">("all");
  const [error, setError] = useState<string | null>(null);
  const seenPending = useRef<string | null>(null);

  const choices = useMemo<Choice[]>(() => pages.flatMap((page) => [
    { key: `facebook:${page.id}`, name: page.name, detail: "Facebook Page", platform: "facebook" as const, publishable: !!page.facebook_publishable },
    ...(page.instagram_business_account ? [{
      key: `instagram:${page.instagram_business_account.id}`,
      name: page.instagram_business_account.name || page.instagram_business_account.username || page.name,
      detail: `@${page.instagram_business_account.username || "Instagram"}`,
      platform: "instagram" as const,
      publishable: !!page.instagram_publishable,
    }] : []),
  ]), [pages]);
  const visible = choices.filter((choice) =>
    (platform === "all" || choice.platform === platform) &&
    `${choice.name} ${choice.detail}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const openPicker = async (id: string) => {
    if (!workspaceId || seenPending.current === id) return;
    seenPending.current = id;
    setConnecting(false);
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const { data, error: requestError } = await supabase.functions.invoke("meta-import-pages", {
        body: { pending_id: id, action: "list", workspace_id: workspaceId },
      });
      if (requestError || data?.error || !Array.isArray(data?.pages)) throw await connectionError(requestError, data, "Could not load your Meta accounts. Connect again.");
      setPendingId(id);
      setPages(data.pages as PendingPage[]);
      setStep("choose");
    } catch (failure) {
      seenPending.current = null;
      setError(failure instanceof Error ? failure.message : "Could not load your accounts");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handle = (data: { source?: string; status?: string; meta_select?: string; error?: string } | null) => {
      if (data?.source !== "autosocials-oauth") return;
      setConnecting(false);
      if (data.status === "meta_select" && data.meta_select) void openPicker(data.meta_select);
      else if (data.status === "error") setError(data.error || "Meta connection did not complete");
    };
    const onMessage = (event: MessageEvent) => { if (event.origin === window.location.origin) handle(event.data); };
    window.addEventListener("message", onMessage);
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel("autosocials-oauth"); channel.onmessage = (event) => handle(event.data); } catch { /* Browser may not support this channel. */ }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "autosocials-oauth" || !event.newValue) return;
      try { handle(JSON.parse(event.newValue)); } catch { /* Ignore malformed events. */ }
      try { localStorage.removeItem("autosocials-oauth"); } catch { /* Ignore storage errors. */ }
    };
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("message", onMessage); window.removeEventListener("storage", onStorage); channel?.close(); };
  }, [workspaceId]);

  const startConnection = async () => {
    if (!workspaceId) return;
    const width = 600, height = 720;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    const popup = window.open("about:blank", "autosocials-oauth", `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
    if (!popup) { setError("Allow popups for AutoSocials, then try again."); return; }
    setConnecting(true);
    setError(null);
    seenPending.current = null;
    try {
      const { data, error: requestError } = await supabase.functions.invoke("meta-oauth-init", {
        body: { workspace_id: workspaceId, redirect_to: `${window.location.origin}/oauth/bridge` },
      });
      if (requestError || !data?.authUrl) throw await connectionError(requestError, data, "Could not start the Meta connection");
      popup.location.href = data.authUrl;
    } catch (failure) {
      popup.close();
      setConnecting(false);
      setError(failure instanceof Error ? failure.message : "Could not connect Meta");
    }
  };

  const importAccounts = async () => {
    if (!workspaceId || !pendingId || !selected.size) return;
    setSaving(true);
    setError(null);
    try {
      const { data, error: requestError } = await supabase.functions.invoke("meta-import-pages", {
        body: { pending_id: pendingId, account_keys: [...selected], workspace_id: workspaceId },
      });
      if (requestError || data?.error) throw await connectionError(requestError, data, "Could not connect your selected accounts");
      setStep("ready");
      toast.success(`${data?.imported ?? selected.size} social ${selected.size === 1 ? "account" : "accounts"} connected`);
      onConnected();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not connect your accounts");
    } finally { setSaving(false); }
  };

  return <div className="flex min-h-0 flex-1 flex-col overflow-auto px-6 py-7">
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-8 flex items-center justify-center gap-2 text-[11px] font-medium">
        {(["Connect Meta", "Choose accounts", "Ready"] as const).map((label, index) => {
          const current = step === "connect" ? 0 : step === "choose" ? 1 : 2;
          return <div key={label} className="flex items-center gap-2">
            {index > 0 && <span className="h-px w-5 bg-border sm:w-10" />}
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${index <= current ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
              {index < current ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            <span className={index <= current ? "text-foreground" : "text-muted-foreground"}>{label}</span>
          </div>;
        })}
      </div>

      {step === "connect" && <div className="space-y-6">
        <div className="text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="h-7 w-7" /></span>
          <h3 className="mt-5 text-xl font-semibold tracking-tight">Your feeds start here</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Connect Meta once, then choose the exact Pages and Instagram accounts you want in Publish.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-4"><Facebook className="h-5 w-5 text-primary" /><div className="mt-3 text-sm font-semibold">Facebook Pages</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">See published posts and schedule new content.</p></div>
          <div className="rounded-xl border bg-card p-4"><Instagram className="h-5 w-5 text-primary" /><div className="mt-3 text-sm font-semibold">Instagram professional</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Plan images, carousels and Reels.</p></div>
        </div>
        <Button className="w-full" size="lg" onClick={startConnection} disabled={connecting || loading || !workspaceId}>
          {connecting || loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronRight className="mr-2 h-4 w-4" />}
          {connecting ? "Connecting to Meta…" : loading ? "Finding your accounts…" : "Connect Meta"}
        </Button>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Nothing is added automatically. You choose each destination after Meta returns your accounts.</p>
      </div>}

      {step === "choose" && <div className="space-y-4">
        <div><h3 className="text-xl font-semibold tracking-tight">Choose your accounts</h3><p className="mt-1 text-sm text-muted-foreground">Select only the Pages and Instagram accounts you want to publish to. You can add more later.</p></div>
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all your Pages and accounts…" /></div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Filter accounts">
          {(["all", "facebook", "instagram"] as const).map((item) => <Button key={item} size="sm" variant={platform === item ? "secondary" : "ghost"} onClick={() => setPlatform(item)}>{item === "all" ? "All" : item === "facebook" ? "Facebook" : "Instagram"}</Button>)}
          <span className="ml-auto text-xs text-muted-foreground">{selected.size} of {choices.length} selected</span>
        </div>
        <div className="flex justify-end gap-4 text-xs"><button className="text-primary hover:underline" onClick={() => setSelected((previous) => new Set([...previous, ...visible.map((choice) => choice.key)]))}>Select visible</button><button className="text-muted-foreground hover:underline" onClick={() => setSelected(new Set())}>Clear</button></div>
        <div className="max-h-[45vh] overflow-auto rounded-xl border bg-card">
          {visible.map((choice) => <label key={choice.key} className="flex cursor-pointer items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-muted/40">
            <Checkbox checked={selected.has(choice.key)} onCheckedChange={() => setSelected((previous) => { const next = new Set(previous); if (next.has(choice.key)) next.delete(choice.key); else next.add(choice.key); return next; })} aria-label={`Connect ${choice.name}`} />
            {choice.platform === "facebook" ? <Facebook className="h-4 w-4 shrink-0 text-primary" /> : <Instagram className="h-4 w-4 shrink-0 text-primary" />}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{choice.name}</span><span className="block truncate text-xs text-muted-foreground">{choice.detail}</span></span>
            <span className={`shrink-0 text-[11px] ${choice.publishable ? "text-muted-foreground" : "text-destructive"}`}>{choice.publishable ? "Ready" : "Permission needed"}</span>
          </label>)}
          {!visible.length && <p className="p-5 text-center text-sm text-muted-foreground">{choices.length ? "No matching accounts" : "No Pages were returned. Try another Meta login."}</p>}
        </div>
        <Button className="w-full" size="lg" onClick={importAccounts} disabled={!selected.size || saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Connect {selected.size} {selected.size === 1 ? "account" : "accounts"}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => { setStep("connect"); setPendingId(null); seenPending.current = null; }}>Use a different Meta login</Button>
      </div>}

      {step === "ready" && <div className="py-10 text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="h-8 w-8" /></span><h3 className="mt-5 text-xl font-semibold">You’re ready to publish</h3><p className="mt-2 text-sm text-muted-foreground">Your selected accounts are loading into Live Feeds.</p></div>}
      {error && <div role="alert" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      <p className="mt-8 text-center text-xs text-muted-foreground">Already connected elsewhere? <Link to="/app/settings/connections" className="text-primary underline underline-offset-2">Manage connections</Link></p>
    </div>
  </div>;
}
