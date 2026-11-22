import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Play, Pause, Star, Check, KeyRound, Server } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getIntegrationStatus, saveElevenLabsKey, removeElevenLabsKey, setUseOwnKey, testElevenLabs, listVoices, saveVoiceSettings, previewBuiltInVoice, setAutoPick, type Voice } from "@/lib/integrations.functions";
import type { VoicePick } from "@/lib/integrations";
import { cn } from "@/lib/utils";

const btn = "inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium disabled:opacity-40";
const ghost = cn(btn, "border border-border-control bg-surface hover:bg-surface-subtle");
const primary = cn(btn, "bg-ink text-inverse hover:bg-ink-hover");

/** workspaceId null = Super Admin platform key. */
export function ElevenLabsCard({ workspaceId }: { workspaceId: string | null }) {
  const qc = useQueryClient();
  const status = useServerFn(getIntegrationStatus);
  const save = useServerFn(saveElevenLabsKey);
  const remove = useServerFn(removeElevenLabsKey);
  const useOwn = useServerFn(setUseOwnKey);
  const test = useServerFn(testElevenLabs);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const { data, refetch } = useQuery({ queryKey: ["integrations", workspaceId], queryFn: () => status({ data: { workspace_id: workspaceId } }) });
  const platformMode = workspaceId === null;
  const ownChosen = !!data?.settings?.use_own_key;
  const current = platformMode ? data?.platform : data?.own;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); setKey(""); await refetch(); void qc.invalidateQueries({ queryKey: ["voices", workspaceId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {platformMode && data?.render && (
        <section className="rounded-[16px] border border-border bg-surface p-5">
          <div className="flex items-center gap-3"><Server className="h-5 w-5" /><h3 className="font-display text-[16px] font-bold">HyperFrames render server</h3>
            <span className={cn("ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold", data.render.ok ? "bg-ink text-inverse" : "border border-border-control")}>{data.render.ok ? "Connected" : "Not reachable"}</span></div>
          {data.render.ok && <p className="mt-2 text-[13px] text-muted-foreground">Renders {data.render.concurrency} videos at once · sizes {data.render.sizes?.join(", ")}</p>}
        </section>
      )}

      <section className="rounded-[16px] border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <KeyRound className="h-5 w-5" />
          <div><h3 className="font-display text-[16px] font-bold">ElevenLabs voices</h3>
            <p className="text-[12px] text-muted-foreground">{platformMode ? "Platform key used by every workspace that doesn't bring its own." : "Narration voices Sam uses in videos."}</p></div>
        </div>

        {!platformMode && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Which ElevenLabs account">
            {[{ v: false, t: "Use AutoSocials voices", d: data?.platform ? "Included, no setup needed." : "Not set up by AutoSocials yet." }, { v: true, t: "Use our own ElevenLabs account", d: "Your own voices and clones." }].map((o) => (
              <button key={o.t} type="button" role="radio" aria-checked={ownChosen === o.v} disabled={busy}
                onClick={() => void run(() => useOwn({ data: { workspace_id: workspaceId!, use_own_key: o.v } }), "Saved")}
                className={cn("rounded-[12px] border p-3 text-left", ownChosen === o.v ? "border-ink" : "border-border-control hover:bg-surface-subtle")}>
                <p className="text-[13px] font-semibold">{o.t}</p><p className="text-[12px] text-muted-foreground">{o.d}</p>
              </button>
            ))}
          </div>
        )}

        {(platformMode || ownChosen) && (
          <div className="mt-4">
            {current ? (
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-inverse">Connected</span>
                <span className="text-muted-foreground">Key ending ••••{current.last4}</span>
              </div>
            ) : <p className="text-[13px] text-muted-foreground">No key yet.</p>}
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => save({ data: { workspace_id: workspaceId, key } }), "Key verified and saved"); }}>
              <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={current ? "Paste a new key to replace" : "Paste your ElevenLabs API key"} aria-label="ElevenLabs API key" />
              <button type="submit" className={primary} disabled={busy || key.trim().length < 20}>{current ? "Replace" : "Save"}</button>
            </form>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className={ghost} disabled={busy} onClick={async () => {
            setBusy(true);
            try { const r = await test({ data: { workspace_id: workspaceId } }); setInfo(`Working · ${r.source === "platform" ? "AutoSocials" : "your"} account · ${r.tier} plan · ${r.used.toLocaleString()} of ${r.limit.toLocaleString()} characters used`); }
            catch (e) { setInfo(e instanceof Error ? e.message : "Test failed"); } finally { setBusy(false); }
          }}>Test connection</button>
          {current && <button type="button" className={ghost} disabled={busy} onClick={() => void run(() => remove({ data: { workspace_id: workspaceId } }), "Key removed")}>Remove key</button>}
          {info && <span className="text-[12px] text-muted-foreground" role="status">{info}</span>}
        </div>
      </section>

      {!platformMode && <VoiceLibrary workspaceId={workspaceId!} settings={data?.settings ?? null} />}
    </div>
  );
}

type Settings = { brand_voice_id: string | null; allowed: unknown; auto_pick?: boolean } | null;

function VoiceLibrary({ workspaceId, settings }: { workspaceId: string; settings: Settings }) {
  const list = useServerFn(listVoices);
  const save = useServerFn(saveVoiceSettings);
  const sample = useServerFn(previewBuiltInVoice);
  const autoPick = useServerFn(setAutoPick);
  const qc = useQueryClient();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["voices", workspaceId], queryFn: () => list({ data: { workspace_id: workspaceId } }), retry: false });
  const allowed = (settings?.allowed ?? []) as VoicePick[];
  const brandId = settings?.brand_voice_id ?? null;
  const brand = allowed.find((v) => v.id === brandId) ?? null;

  async function persist(nextBrand: VoicePick | null, nextAllowed: VoicePick[]) {
    try { await save({ data: { workspace_id: workspaceId, brand: nextBrand, allowed: nextAllowed } }); await qc.invalidateQueries({ queryKey: ["integrations", workspaceId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
  }
  const toPick = (v: Voice): VoicePick => ({ id: v.id, name: v.name, labels: v.labels });
  async function preview(v: Voice) {
    if (playing === v.id) { audio.current?.pause(); setPlaying(null); return; }
    audio.current?.pause();
    let url = v.preview_url;
    if (v.builtin) {
      setPlaying(v.id);
      try { url = (await sample({ data: { voice: v.name } })).url; } catch (e) { setPlaying(null); toast.error(e instanceof Error ? e.message : "Couldn't play sample"); return; }
    }
    if (!url) return;
    audio.current = new Audio(url); audio.current.onended = () => setPlaying(null);
    void audio.current.play(); setPlaying(v.id);
  }
  const voices = (data?.voices ?? []).filter((v) => !q || `${v.name} ${Object.values(v.labels).join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <section className="rounded-[16px] border border-border bg-surface p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1"><h3 className="font-display text-[16px] font-bold">Voice library</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">{settings?.auto_pick || !brand ? "Sam picks a free built-in voice to suit each batch. Star one to always use it." : `Sam narrates every video with ${brand.name} unless you say otherwise.`}</p>
          <label className="mt-2 flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={!!settings?.auto_pick} onChange={async (e) => { try { await autoPick({ data: { workspace_id: workspaceId, auto_pick: e.target.checked } }); await qc.invalidateQueries({ queryKey: ["integrations", workspaceId] }); } catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't save"); } }} />
            Let Sam choose from the free voices
          </label></div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a voice" className="w-56" aria-label="Find a voice" />
      </div>
      {isLoading && <p className="mt-4 text-[13px] text-muted-foreground">Loading voices…</p>}
      {error && <p className="mt-4 text-[13px] text-muted-foreground">{error instanceof Error ? error.message : "Couldn't load voices"}</p>}
      {data?.source === "none" && <p className="mt-4 text-[13px] text-muted-foreground">Built-in AutoSocials voices work with no setup. Add an ElevenLabs key above to see those voices too.</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {voices.map((v) => {
          const isBrand = v.id === brandId; const isAllowed = allowed.some((a) => a.id === v.id);
          return (
            <div key={v.id} className={cn("flex items-center gap-3 rounded-[12px] border p-3", isBrand ? "border-ink" : "border-border")}>
              <button type="button" aria-label={`Play ${v.name}`} onClick={() => preview(v)} disabled={!v.preview_url && !v.builtin} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-inverse disabled:opacity-30">
                {playing === v.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{v.name}</p>
                <p className="truncate text-[11px] capitalize text-muted-foreground">{[v.labels["accent"], v.labels["gender"], v.labels["age"], v.labels["use_case"] ?? v.labels["descriptive"]].filter(Boolean).join(" · ") || v.category}{v.builtin ? " · Built-in" : ""}</p>
              </div>
              <button type="button" aria-label={isBrand ? "Brand voice" : `Make ${v.name} the brand voice`} aria-pressed={isBrand}
                onClick={() => void persist(isBrand ? null : toPick(v), isAllowed ? allowed : [...allowed, toPick(v)])}
                className={cn("rounded-full p-1.5", isBrand ? "bg-ink text-inverse" : "hover:bg-surface-subtle")}><Star className="h-4 w-4" /></button>
              <button type="button" aria-label={isAllowed ? `Stop allowing ${v.name}` : `Allow ${v.name}`} aria-pressed={isAllowed} disabled={isBrand}
                onClick={() => void persist(brand, isAllowed ? allowed.filter((a) => a.id !== v.id) : [...allowed, toPick(v)])}
                className={cn("flex h-6 w-6 items-center justify-center rounded-[6px] border", isAllowed ? "border-ink bg-ink text-inverse" : "border-border-control")}>{isAllowed && <Check className="h-3.5 w-3.5" />}</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
