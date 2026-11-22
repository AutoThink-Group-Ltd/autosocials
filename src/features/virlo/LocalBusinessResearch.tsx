import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ExternalLink, LoaderCircle, Search } from "lucide-react";
import { searchLocalBusinesses, saveBusinessList, listBusinessLists, createBusinessList, deleteBusinessList, removeBusinessFromList } from "@/lib/local-business.functions";
import { listSavedVirloResearch, saveVirloResearch } from "@/lib/virlo.functions";
import { acquirePendingRequest, completePendingRequest, type PendingRequest } from "./pendingRequest";
import { ListResearchAction, type ListResearchResult } from "./ListResearch";

type Business = { name: string; address: string; website?: string; maps_url?: string; distance_miles?: number };
type BusinessData = { businesses: Business[]; location_label: string; radius_miles?: number; warnings: string[] };
type BusinessResult = { id: string; title: string; data: BusinessData };
const control = "w-full rounded-xl border border-border-control bg-surface px-3 py-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-inverse disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border-control bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-subtle disabled:opacity-50";

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
  } catch { /* Unusable links remain unlinked. */ }
}

export function BusinessResults({ data, onFindSocial, onOpenList, workspaceId, resultId }: { data: unknown; onFindSocial: (name: string) => void; onOpenList?: (id: string) => void; workspaceId?: string; resultId?: string }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number[]>([]);
  const [destination, setDestination] = useState('new');
  const [name, setName] = useState('');
  const [savedList, setSavedList] = useState<{ id: string; name: string; count: number } | null>(null);
  const lists = useQuery({ queryKey: ['business-lists', workspaceId], queryFn: () => listBusinessLists({ data: { workspace_id: workspaceId! } }), enabled: !!workspaceId && !!resultId });
  const saveList = useMutation({ mutationFn: () => saveBusinessList({ data: { workspace_id: workspaceId!, result_id: resultId!, indexes: selected, ...(destination === 'new' ? { title: name.trim() } : { list_id: destination }) } }), onSuccess: (saved) => { setSavedList({ id: saved.id, name: destination === 'new' ? name.trim() : lists.data?.find(list => list.id === destination)?.title || 'your list', count: selected.length }); setSelected([]); setName(''); void queryClient.invalidateQueries({ queryKey: ['business-lists', workspaceId] }); } });
  const result = data && typeof data === "object" ? data as Partial<BusinessData> : {};
  const businesses = Array.isArray(result.businesses) ? result.businesses : [];
  return <div className="space-y-4">
    {result.location_label && <p className="font-semibold text-ink">{result.radius_miles ? "Resolved search centre" : "Location searched"}: {result.location_label}</p>}
    <p className="text-sm text-text-secondary">{result.radius_miles ? `Within ${result.radius_miles} miles straight-line distance of this centre. ` : "Place searches may include nearby listings. "}Results are a sample of available listings, not a complete directory. Verify each business and its social profiles.</p>
    {Array.isArray(result.warnings) && result.warnings.filter(warning => warning !== 'Results are a limited selection, not a complete directory. Verify businesses and their social accounts before comparing them.').map((warning, i) => <p key={i} className="text-sm text-text-secondary">{warning}</p>)}
    {workspaceId && resultId && businesses.length > 0 && <div className="space-y-3 rounded-xl border border-border-control bg-surface p-4"><div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={selected.length === businesses.length} onChange={e => { setSavedList(null); setSelected(e.target.checked ? businesses.map((_, i) => i) : []); }} /> Select all</label><span className="text-sm text-text-secondary">{selected.length} selected</span></div><div className="flex flex-wrap items-end gap-3"><label className="min-w-48 text-sm font-medium">Save to list<select className={`${control} mt-1`} value={destination} onChange={e => setDestination(e.target.value)}><option value="new">Create a new list</option>{lists.data?.map(list => <option key={list.id} value={list.id}>{list.title}</option>)}</select></label>{destination === 'new' && <label className="min-w-48 text-sm font-medium">List name<input className={`${control} mt-1`} maxLength={200} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bradford competitors" /></label>}<button type="button" className={primary} disabled={!selected.length || saveList.isPending || (destination === 'new' && !name.trim())} onClick={() => { setSavedList(null); saveList.mutate(); }}>{saveList.isPending ? 'Saving…' : 'Save selected'}</button></div>{lists.isError && <p role="alert" className="text-sm text-danger">Existing lists are unavailable.</p>}{saveList.isError && <p role="alert" className="text-sm text-danger">{saveList.error instanceof Error ? saveList.error.message : 'Could not save the list.'}</p>}{savedList && <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-border-control bg-surface-subtle p-4 text-sm"><span className="font-semibold text-ink">{savedList.count} {savedList.count === 1 ? 'business' : 'businesses'} saved to {savedList.name}.</span>{onOpenList && <button type="button" className={secondary} onClick={() => onOpenList(savedList.id)}>View list</button>}</div>}</div>}
    {businesses.length ? <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{businesses.map((business, i) => {
      const website = safeUrl(business.website);
      const maps = safeUrl(business.maps_url);
      return <li key={`${business.name}-${business.address}-${i}`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        {workspaceId && resultId && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(i)} onChange={e => { setSavedList(null); setSelected(previous => e.target.checked ? [...previous, i] : previous.filter(index => index !== i)); }} /> Select {business.name}</label>}
        <div><h3 className="font-semibold text-ink">{business.name}</h3><p className="mt-1 text-sm text-text-secondary">{business.address || "Address unavailable"}</p>{typeof business.distance_miles === "number" && <p className="mt-1 text-xs text-text-secondary">{business.distance_miles.toFixed(1)} miles away · straight line</p>}</div>
        <div className="mt-auto flex flex-wrap items-center gap-3 text-sm">{website && <a href={website} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline">Website <ExternalLink size={13} className="inline" /></a>}{maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline">Map listing <ExternalLink size={13} className="inline" /></a>}<button type="button" className="font-medium text-ink underline" onClick={() => onFindSocial(business.name)}>Find social profiles</button></div>
      </li>;
    })}</ul> : <p className="rounded-2xl border border-border p-6 text-sm text-text-secondary">No matching businesses were returned. Try another category or location.</p>}
  </div>;
}

export function LocalBusinessResearch({ workspaceId, onFindSocial, onOpenList }: { workspaceId: string; onFindSocial: (name: string) => void; onOpenList: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState<"place" | "radius">("place");
  const [radius, setRadius] = useState("10");
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BusinessResult | null>(null);
  const [saved, setSaved] = useState(false);
  const search = useMutation({
    mutationFn: async (input: { query: string; location: string; radius_miles?: number; pending: PendingRequest }) => {
      const response = await searchLocalBusinesses({ data: { workspace_id: workspaceId, query: input.query, location: input.location, ...(input.radius_miles !== undefined ? { radius_miles: input.radius_miles } : {}), request_id: input.pending.id } });
      return { id: response.id, title: `${input.query} · ${input.location}`.slice(0, 200), data: response.data as unknown as BusinessData };
    },
    onSuccess: (value, input) => { completePendingRequest(input.pending); setResult(value); setSaved(false); setError(""); },
  });
  const save = useMutation({
    mutationFn: (value: BusinessResult) => saveVirloResearch({ data: { workspace_id: workspaceId, result_id: value.id, title: value.title } }),
    onSuccess: () => { setSaved(true); void queryClient.invalidateQueries({ queryKey: ["virlo-saved", workspaceId] }); },
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (preparing || search.isPending) return;
    setPreparing(true); setError("");
    const input = { query: query.trim(), location: location.trim(), ...(mode === "radius" ? { radius_miles: Number(radius) } : {}) };
    try { const pending = await acquirePendingRequest(workspaceId, { type: "local-businesses", ...input }); search.mutate({ ...input, pending }); }
    catch (e) { setError(e instanceof Error ? e.message : "Research could not start safely."); }
    finally { setPreparing(false); }
  };
  return <div className="space-y-5">
    <p className="text-sm text-text-secondary">Find businesses by category and area, then explore their social profiles. Listings come from Google Maps via SerpApi.</p>
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-sm font-medium text-ink">Business category<input className={control} required minLength={2} maxLength={120} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. restaurants" /></label><label className="space-y-1.5 text-sm font-medium text-ink">Town, city, country or address<input className={control} required minLength={2} maxLength={150} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Bradford, UK" /></label></div>
      <fieldset><legend className="mb-2 text-sm font-semibold text-ink">Search area</legend><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" name="business-location-mode" checked={mode === "place"} onChange={() => setMode("place")} />Town, city or country</label><label className="flex items-center gap-2"><input type="radio" name="business-location-mode" checked={mode === "radius"} onChange={() => setMode("radius")} />Within a mile radius</label></div></fieldset>
      {mode === "radius" && <label className="block max-w-48 space-y-1.5 text-sm font-medium text-ink">Radius in miles<input className={control} type="number" min="1" max="100" step="1" required value={radius} onChange={(e) => setRadius(e.target.value)} /><span className="block text-xs font-normal text-text-secondary">Measured straight-line from the location entered.</span></label>}
      <button type="submit" className={primary} disabled={preparing || search.isPending}><Search size={16} />{preparing || search.isPending ? "Searching…" : "Find businesses"}</button>
    </form>
    {(error || search.isError) && <p role="alert" className="rounded-xl bg-warning-surface p-4 text-sm text-warning">{error || (search.error instanceof Error ? search.error.message : "Business search could not be completed.")}</p>}
    {result && <section aria-label="Business results" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-ink">{result.title}</h2><button type="button" className={secondary} onClick={() => save.mutate(result)} disabled={save.isPending || saved}><Bookmark size={15} />{saved ? "Saved" : save.isPending ? "Saving…" : "Save search"}</button></div>{save.isError && <p role="alert" className="text-sm text-danger">Could not save this search.</p>}<BusinessResults key={result.id} data={result.data} workspaceId={workspaceId} resultId={result.id} onFindSocial={onFindSocial} onOpenList={onOpenList} /></section>}
  </div>;
}

export function BusinessLists({ workspaceId, onFindSocial, onOpenResearch, initialListId }: { workspaceId: string; onFindSocial: (name: string) => void; onOpenResearch: (result: ListResearchResult, initialBusiness?: string) => void; initialListId?: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [open, setOpen] = useState(initialListId || '');
  const [confirm, setConfirm] = useState('');
  const [individual, setIndividual] = useState<number | null>(null);
  const [confirmBusiness, setConfirmBusiness] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ activeIndex: number | null; statuses: ('pending' | 'complete' | 'partial')[]; running: boolean }>({ activeIndex: null, statuses: [], running: false });
  const lists = useQuery({ queryKey: ['business-lists', workspaceId], queryFn: () => listBusinessLists({ data: { workspace_id: workspaceId } }) });
  const research = useQuery({ queryKey: ['virlo-saved', workspaceId], queryFn: () => listSavedVirloResearch({ data: { workspace_id: workspaceId } }) });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['business-lists', workspaceId] }); };
  const create = useMutation({ mutationFn: () => createBusinessList({ data: { workspace_id: workspaceId, title: name.trim() } }), onSuccess: result => { setName(''); setOpen(result.id); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => deleteBusinessList({ data: { workspace_id: workspaceId, list_id: id } }), onSuccess: () => { setConfirm(''); setOpen(''); refresh(); } });
  const removeBusiness = useMutation({ mutationFn: ({ listId, index, business }: { listId: string; index: number; business: Business }) => removeBusinessFromList({ data: { workspace_id: workspaceId, list_id: listId, index, name: business.name, address: business.address || '' } }), onSuccess: () => { setConfirmBusiness(null); setIndividual(null); setProgress({ activeIndex: null, statuses: [], running: false }); refresh(); } });
  const current = lists.data?.find(list => list.id === open);
  const value = current?.data && typeof current.data === 'object' && !Array.isArray(current.data) ? current.data as { businesses?: Business[] } : {};
  const businesses = Array.isArray(value.businesses) ? value.businesses : [];
  const researchFor = (business: Business): ListResearchResult | undefined => {
    for (const item of research.data ?? []) {
      if (item.kind !== 'list_research' || !item.data || typeof item.data !== 'object' || Array.isArray(item.data)) continue;
      const data = item.data as unknown as ListResearchResult['data'];
      if (!Array.isArray(data.businesses)) continue;
      if (data.businesses.some(entry => entry.name === business.name && entry.address === (business.address || '') && entry.status !== 'pending')) return { id: item.id, data };
    }
  };
  return <section aria-label="Business lists" className="space-y-5"><div><h2 className="text-lg font-semibold">Lists</h2><p className="text-sm text-text-secondary">Organise businesses for this workspace.</p></div><form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); if (name.trim()) create.mutate(); }}><label className="min-w-56 text-sm font-medium">New list name<input className={`${control} mt-1`} required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label><button className={primary} disabled={create.isPending || !name.trim()}>{create.isPending ? 'Creating…' : 'Create list'}</button></form>
    {create.isError && <p role="alert" className="text-sm text-danger">Could not create the list.</p>}{lists.isPending ? <p className="text-sm text-text-secondary">Loading lists…</p> : lists.isError ? <p role="alert" className="text-sm text-danger">Could not load lists.</p> : !lists.data?.length ? <p className="text-sm text-text-secondary">No lists yet. Create one here or select businesses from a search.</p> : <div className="flex flex-wrap gap-2">{lists.data.map(list => <button type="button" key={list.id} onClick={() => { setOpen(list.id); setConfirm(''); setIndividual(null); setConfirmBusiness(null); setProgress({ activeIndex: null, statuses: [], running: false }); }} className={`${secondary} ${open === list.id ? 'ring-2 ring-ring' : ''}`}>{list.title}</button>)}</div>}
    {current && <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">{current.title} <span className="text-sm font-normal text-text-secondary">({businesses.length})</span></h3>{confirm === current.id ? <div className="flex items-center gap-2"><span className="text-sm">Delete this list?</span><button type="button" className={secondary} disabled={remove.isPending || progress.running} onClick={() => remove.mutate(current.id)}>Confirm delete</button><button type="button" className={secondary} onClick={() => setConfirm('')}>Cancel</button></div> : <button type="button" className={secondary} disabled={progress.running} onClick={() => setConfirm(current.id)}>Delete list</button>}</div>
      {remove.isError && <p role="alert" className="text-sm text-danger">Could not delete the list.</p>}
      <ListResearchAction key={current.id} workspaceId={workspaceId} listId={current.id} businessCount={businesses.length} disabled={individual !== null} onOpenReport={onOpenResearch} onProgress={setProgress} />
      {removeBusiness.isError && <p role="alert" className="text-sm text-danger">{removeBusiness.error instanceof Error ? removeBusiness.error.message : 'Could not remove this business.'}</p>}
      {businesses.length ? <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{businesses.map((business, i) => <li key={`${business.name}-${business.address}-${i}`} className={`space-y-2 rounded-2xl border bg-surface p-4 ${progress.activeIndex === i ? 'border-ink ring-2 ring-ring' : 'border-border'}`}>
        <div className="flex items-start justify-between gap-2"><h4 className="font-semibold">{business.name}</h4>{progress.activeIndex === i && <span role="status" className="flex items-center gap-1 text-xs text-text-secondary"><LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" /> Researching</span>}</div>
        <p className="text-sm text-text-secondary">{business.address || 'Address unavailable'}</p>
        {progress.statuses.length === businesses.length && progress.statuses[i] !== 'pending' && progress.activeIndex !== i && <p className="text-xs text-text-secondary">{progress.statuses[i] === 'partial' ? 'Checked · some sources unavailable' : 'Checked'}</p>}
        <div className="flex flex-wrap gap-3 text-sm">{safeUrl(business.website) && <a className="underline" href={safeUrl(business.website)} target="_blank" rel="noopener noreferrer">Website</a>}{safeUrl(business.maps_url) && <a className="underline" href={safeUrl(business.maps_url)} target="_blank" rel="noopener noreferrer">Map listing</a>}<button type="button" className="underline" onClick={() => onFindSocial(business.name)}>Find social profiles</button>{researchFor(business) && <button type="button" className="underline" onClick={() => { const report = researchFor(business); if (report) onOpenResearch(report, 'index:' + String(report.data.businesses.findIndex(entry => entry.name === business.name && entry.address === (business.address || '')))); }}>View gallery</button>}<button type="button" className="underline disabled:opacity-50" disabled={progress.running} onClick={() => setIndividual(individual === i ? null : i)}>Research business</button>{confirmBusiness === i ? <><button type="button" className="underline" disabled={removeBusiness.isPending || progress.running} onClick={() => removeBusiness.mutate({ listId: current.id, index: i, business })}>Confirm remove</button><button type="button" className="underline" onClick={() => setConfirmBusiness(null)}>Cancel</button></> : <button type="button" className="underline disabled:opacity-50" disabled={progress.running} onClick={() => setConfirmBusiness(i)}>Remove from list</button>}</div>
        {individual === i && <ListResearchAction key={`${current.id}-${i}`} workspaceId={workspaceId} listId={current.id} businessCount={1} businessIndex={i} businessName={business.name} businessAddress={business.address || ''} onOpenReport={onOpenResearch} onProgress={setProgress} />}
      </li>)}</ul> : <p className="text-sm text-text-secondary">This list is empty. Select businesses from a search to add them.</p>}
    </div>}
  </section>;
}
