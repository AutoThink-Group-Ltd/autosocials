import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseClientSocialProfile, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/client-social-profiles";
import { discoverWorkspaceSocialProfiles, getWorkspaceSocialProfiles, saveWorkspaceSocialProfiles } from "@/lib/client-social.functions";
import { SocialChannelIcon } from "@/components/agency/SocialChannelIcon";

type Row = { id: number; value: string; platform?: SocialPlatform; source?: "website" | "search" };
const platformLabels: Record<SocialPlatform, string> = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", linkedin: "LinkedIn", x: "X", youtube: "YouTube", pinterest: "Pinterest", threads: "Threads", snapchat: "Snapchat", substack: "Substack", reddit: "Reddit" };

export function ClientSocialSettings({ workspaceId, website }: { workspaceId: string; website: string | null }) {
  const { currentWorkspace } = useWorkspace();
  const isPersonal = currentWorkspace?.id === workspaceId && currentWorkspace.workspace_kind === "personal";
  const getProfiles = useServerFn(getWorkspaceSocialProfiles);
  const findProfiles = useServerFn(discoverWorkspaceSocialProfiles);
  const saveProfiles = useServerFn(saveWorkspaceSocialProfiles);
  const nextId = useRef(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [finding, setFinding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [message, setMessage] = useState("");
  const newRow = (value: string, platform?: SocialPlatform, source?: Row["source"]): Row => ({ id: nextId.current++, value, platform, source });

  useEffect(() => {
    let active = true;
    setLoading(true); setRows([]); setMessage("");
    void (async () => {
      try {
        const saved = await getProfiles({ data: { workspaceId } });
        if (!active) return;
        setCanEdit(saved.canEdit);
        setRows(saved.profiles.map((profile) => newRow(profile.url ?? `@${profile.handle}`, profile.platform)));
        setLoading(false);
        if (!website) return;
        setFinding(true);
        const found = await findProfiles({ data: { workspaceId } });
        if (!active) return;
        setRows((current) => {
          const existing = new Set(current.map((row) => { const parsed = parseClientSocialProfile(row.value, row.platform); return parsed ? `${parsed.platform}:${parsed.handle.toLowerCase()}` : ""; }));
          return [...current, ...found.profiles.filter((profile) => !existing.has(`${profile.platform}:${profile.handle.toLowerCase()}`)).map((profile) => newRow(profile.url ?? `@${profile.handle}`, profile.platform, profile.source))];
        });
        setMessage(found.profiles.length ? "Found profiles from the business website for review. Save them when they look right." : "No additional matching profiles found. You can add them manually.");
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Couldn't load social profiles.");
      } finally {
        if (active) { setLoading(false); setFinding(false); }
      }
    })();
    return () => { active = false; };
  }, [workspaceId]);

  const discover = async () => {
    setFinding(true); setMessage("");
    try {
      const found = await findProfiles({ data: { workspaceId } });
      setRows((current) => {
        const existing = new Set(current.map((row) => { const parsed = parseClientSocialProfile(row.value, row.platform); return parsed ? `${parsed.platform}:${parsed.handle.toLowerCase()}` : ""; }));
        return [...current, ...found.profiles.filter((profile) => !existing.has(`${profile.platform}:${profile.handle.toLowerCase()}`)).map((profile) => newRow(profile.url ?? `@${profile.handle}`, profile.platform, profile.source))];
      });
      setMessage(found.profiles.length ? "Found profiles for review. Save them when they look right." : "No matching profiles found. You can add them manually.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't find social profiles."); }
    finally { setFinding(false); }
  };

  const save = async () => {
    const filled = rows.filter((row) => row.value.trim());
    const profiles = filled.map((row) => ({ value: row.value.trim(), platform: parseClientSocialProfile(row.value, row.platform)?.platform }));
    if (profiles.some((profile) => !profile.platform)) { toast.error("Check each link or choose a platform for a handle."); return; }
    setSaving(true);
    try {
      const saved = await saveProfiles({ data: { workspaceId, profiles: profiles as { value: string; platform: SocialPlatform }[] } });
      setRows(saved.map((profile) => newRow(profile.url ?? `@${profile.handle}`, profile.platform)));
      setMessage(""); toast.success("Social profiles saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't save social profiles."); }
    finally { setSaving(false); }
  };

  return <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-lg font-semibold text-foreground">Socials</h2><p className="text-sm text-muted-foreground">{isPersonal ? "Add your public profiles so Sam can review your social presence. Profile links are separate from connected accounts." : "Saved workspace profiles, including those entered when an agency added this client. Add more or find them from the saved website."}</p></div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void discover()} disabled={finding || loading || !website || !canEdit}>
          {finding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}Find profiles
        </Button>
      </div>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Add a social channel">
      {SOCIAL_PLATFORMS.map((platform) => <Button key={platform} type="button" variant="outline" size="sm" disabled={!canEdit || loading} onClick={() => setRows((current) => [...current, newRow("", platform)])}>
        <SocialChannelIcon platform={platform} className="mr-1.5 h-4 w-4" /><Plus className="mr-1 h-3 w-3" />{platformLabels[platform]}
      </Button>)}
    </div>
    {loading && <p className="text-xs text-muted-foreground">Loading profiles…</p>}
    {finding && <p className="text-xs text-muted-foreground">Checking the business website and public profile results…</p>}
    {rows.map((row) => {
      const detected = parseClientSocialProfile(row.value)?.platform;
      const platform = detected ?? row.platform;
      const handle = parseClientSocialProfile(row.value, platform)?.handle;
      return <div key={row.id} className="space-y-1">
        <div className="flex items-center gap-2">
          {platform ? <SocialChannelIcon platform={platform} className="h-5 w-5 shrink-0 text-muted-foreground" /> : <AtSign aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />}
          <Input aria-label={`Social profile ${row.id + 1}`} value={row.value} disabled={!canEdit} placeholder="Paste profile link or @handle" onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, value: event.target.value, platform: parseClientSocialProfile(event.target.value)?.platform ?? item.platform, source: undefined } : item))} />
          {!detected && <select aria-label={`Platform for social profile ${row.id + 1}`} disabled={!canEdit} className="h-10 max-w-28 rounded-md border border-input bg-background px-2 text-sm" value={row.platform ?? ""} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, platform: event.target.value as SocialPlatform || undefined } : item))}>
            <option value="">Platform</option>
            {SOCIAL_PLATFORMS.map((item) => <option key={item} value={item}>{item === "x" ? "X" : item[0].toUpperCase() + item.slice(1)}</option>)}
          </select>}
          {canEdit && <Button type="button" variant="ghost" size="icon" aria-label={`Remove social profile ${row.id + 1}`} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 className="h-4 w-4" /></Button>}
        </div>
        {(handle || row.source) && <p className="pl-7 text-xs text-muted-foreground">{handle && `@${handle}`}{row.source && ` · ${row.source === "website" ? "Linked from business website" : "AI search suggestion — verify before saving"}`}</p>}
      </div>;
    })}
    {message && <p className="text-xs text-muted-foreground">{message}</p>}
    {!website && !isPersonal && <p className="text-xs text-muted-foreground">Save a business website to enable discovery.</p>}
    {canEdit && <Button type="button" size="sm" onClick={() => void save()} disabled={saving || loading || finding}>{saving ? "Saving…" : "Save social profiles"}</Button>}
  </div>;
}
