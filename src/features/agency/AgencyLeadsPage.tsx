import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useNavigate } from "@/lib/router-compat";
import { addAgencyLead, getAgencyLeadOffers, getAgencyLeadSamples, listAgencyLeads, revokeAgencyLeadOffer, shareAgencyLeadOffer } from "@/lib/agency-leads.functions";
import { leadInputSchema, offerAssetKey, offerAssetLabel, offerPrice, offerPriceMinor, type OfferAsset } from "@/lib/agency-leads";

type Lead = Awaited<ReturnType<typeof listAgencyLeads>>[number];

function AddLead({ close }: { close: () => void }) {
  const add = useServerFn(addAgencyLead);
  const query = useQueryClient();
  const { refetchWorkspaces } = useWorkspace();
  const [leadId, setLeadId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const values = new FormData(event.currentTarget);
    const id = leadId ?? crypto.randomUUID();
    const fields = { contact: String(values.get("contact")), company: String(values.get("company")), website: String(values.get("website")), linkedin: String(values.get("linkedin")) };
    const parsed = leadInputSchema.safeParse({ leadId: id, ...fields });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the lead details."); return; }
    setLeadId(id);
    setSaving(true);
    setError("");
    try {
      await add({ data: parsed.data });
      await Promise.all([query.invalidateQueries({ queryKey: ["agency-leads"] }), refetchWorkspaces()]);
      toast.success("Lead added. Sam is checking the supplied sources.");
      close();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not add this lead.");
    } finally { setSaving(false); }
  }

  return <form className="space-y-4" onSubmit={submit}>
    <div><Label htmlFor="lead-contact">Contact name</Label><Input id="lead-contact" name="contact" required maxLength={100} /></div>
    <div><Label htmlFor="lead-company">Company name</Label><Input id="lead-company" name="company" maxLength={100} /></div>
    <div><Label htmlFor="lead-website">Company website</Label><Input id="lead-website" name="website" placeholder="example.co.uk" maxLength={255} /></div>
    <div><Label htmlFor="lead-linkedin">LinkedIn URL</Label><Input id="lead-linkedin" name="linkedin" placeholder="https://www.linkedin.com/in/…" maxLength={500} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={saving}>{saving ? "Adding lead…" : "Add lead"}</Button>
  </form>;
}

async function copyOffer(url: string) {
  try { await navigator.clipboard.writeText(url); toast.success("Offer link copied."); }
  catch { toast.error("Could not copy the link. Use the link field to copy it manually."); }
}

function LeadOffers({ lead }: { lead: Lead }) {
  const read = useServerFn(getAgencyLeadOffers);
  const readSamples = useServerFn(getAgencyLeadSamples);
  const create = useServerFn(shareAgencyLeadOffer);
  const revoke = useServerFn(revokeAgencyLeadOffer);
  const [adding, setAdding] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const [offerId, setOfferId] = useState<string>();
  const [selected, setSelected] = useState<OfferAsset[]>([]);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState<string>();
  const [newUrl, setNewUrl] = useState<string>();
  const offers = useQuery({ queryKey: ["agency-lead-offers", lead.id], queryFn: () => read({ data: { leadId: lead.id } }) });
  const samples = useQuery({ queryKey: ["agency-lead-samples", lead.id], queryFn: () => readSamples({ data: { leadId: lead.id } }), enabled: adding });
  const keys = new Set(selected.map(offerAssetKey));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight) return;
    const form = new FormData(event.currentTarget);
    const priceMinor = offerPriceMinor(String(form.get("price")));
    if (!priceMinor || !selected.length) { setError("Enter a valid price and select at least one sample."); return; }
    const id = offerId ?? crypto.randomUUID();
    setOfferId(id);
    setInFlight(true);
    setError("");
    try {
      const result = await create({ data: { leadId: lead.id, offerId: id, title: String(form.get("title")),
        description: String(form.get("description")), nextSteps: String(form.get("nextSteps")), priceMinor,
        currency: form.get("currency") as "GBP" | "USD" | "EUR", cadence: form.get("cadence") as "monthly" | "one_off",
        assets: selected } });
      setNewUrl(result.url);
      setAdding(false);
      setSelected([]);
      setOfferId(undefined);
      await offers.refetch();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create the offer link.");
    } finally { setInFlight(false); }
  }

  async function revokeLink(id: string) {
    setInFlight(true);
    try {
      await revoke({ data: { leadId: lead.id, offerId: id } });
      setRevoking(undefined);
      setNewUrl(undefined);
      await offers.refetch();
    } catch { toast.error("Could not revoke this link."); }
    finally { setInFlight(false); }
  }

  return <div className="space-y-5">
    {newUrl && <div className="space-y-2"><Label htmlFor="new-offer-url">Your offer link</Label><div className="flex gap-2">
      <Input id="new-offer-url" value={newUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
      <Button onClick={() => void copyOffer(newUrl)}>Copy link</Button>
    </div></div>}
    {offers.isPending ? <p role="status">Loading offers…</p> : offers.isError ? <Button variant="outline" onClick={() => void offers.refetch()}>Retry loading offers</Button> :
      offers.data.map((offer) => <div className="space-y-2 rounded-xl border p-4" key={offer.id}>
        <h3 className="font-semibold">{offer.title}</h3>
        <p className="text-sm">{offerPrice(offer.price_minor, offer.currency, offer.cadence)} · {offer.decision ?? (offer.url ? "Awaiting response" : "Revoked")}{offer.decided_at && ` · ${new Date(offer.decided_at).toLocaleDateString()}`}</p>
        <p className="text-sm text-muted-foreground">{offer.views} views · {offer.clicks} sample clicks{!offer.url && offer.decision && " · Link revoked"}</p>
        {offer.url && (revoking === offer.id ? <div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={inFlight} onClick={() => void revokeLink(offer.id)}>Confirm revoke</Button><Button variant="outline" disabled={inFlight} onClick={() => setRevoking(undefined)}>Cancel</Button></div> :
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void copyOffer(offer.url!)}>Copy link</Button>
            <Button size="sm" variant="outline" asChild><a href={offer.url} target="_blank" rel="noreferrer">Open link</a></Button>
            <Button size="sm" variant="ghost" onClick={() => setRevoking(offer.id)}>Revoke link</Button></div>)}
      </div>)}
    {!adding ? <Button onClick={() => setAdding(true)}>Create an offer</Button> :
      <form className="space-y-4" onSubmit={submit}>
        <div><Label htmlFor="offer-title">Offer title</Label><Input id="offer-title" name="title" placeholder="Daily LinkedIn content" required maxLength={160} /></div>
        <div><Label htmlFor="offer-description">What’s included</Label><Textarea id="offer-description" name="description" placeholder="One LinkedIn post and one designed tile per day, 30 posts per month." required maxLength={4000} /></div>
        <div><Label htmlFor="offer-next">Additional next steps after acceptance</Label><Textarea id="offer-next" name="nextSteps" placeholder="We’ll prepare your first 10 posts for review." maxLength={1000} /><p className="mt-1 text-sm text-muted-foreground">The offer already tells the lead you’ll send an invoice and confirm the first batch.</p></div>
        <div className="grid grid-cols-3 gap-2">
          <div><Label htmlFor="offer-price">Price</Label><Input id="offer-price" name="price" inputMode="decimal" placeholder="100.00" required /></div>
          <div><Label htmlFor="offer-currency">Currency</Label><select id="offer-currency" name="currency" defaultValue="GBP" className="h-10 w-full rounded-md border bg-background px-2"><option>GBP</option><option>USD</option><option>EUR</option></select></div>
          <div><Label htmlFor="offer-cadence">Frequency</Label><select id="offer-cadence" name="cadence" className="h-10 w-full rounded-md border bg-background px-2"><option value="monthly">Monthly</option><option value="one_off">One-off</option></select></div>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Samples to share ({selected.length}/20)</legend>
          {samples.isPending ? <p role="status">Loading samples…</p> : samples.isError ? <Button type="button" variant="outline" onClick={() => void samples.refetch()}>Retry loading samples</Button> :
            !samples.data.length ? <p className="text-sm text-muted-foreground">Create some samples in this lead’s workspace first.</p> :
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">{samples.data.map(({ type, id, title }) => {
                const asset = { type, id };
                const key = offerAssetKey(asset);
                return <label key={key} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={keys.has(key)} disabled={!keys.has(key) && selected.length >= 20} onChange={(event) =>
                    setSelected((prior) => event.target.checked ? [...prior, asset] : prior.filter((entry) => offerAssetKey(entry) !== key))} />
                  <span>{title}<span className="block text-muted-foreground">{offerAssetLabel[type]}</span></span>
                </label>;
              })}</div>}
        </fieldset>
        <p className="text-sm text-muted-foreground">Anyone with the link can view the selected samples and respond. An acceptance records their decision.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={inFlight || !selected.length}>{inFlight ? "Creating link…" : "Generate share link"}</Button>
      </form>}
  </div>;
}

export default function AgencyLeadsPage() {
  const list = useServerFn(listAgencyLeads);
  const { workspaces, setCurrentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [offering, setOffering] = useState<Lead>();
  const leads = useQuery({ queryKey: ["agency-leads"], queryFn: () => list() });

  function openWorkspace(id: string) {
    const workspace = workspaces.find((row) => row.id === id);
    if (!workspace) { toast.error("Refresh this page to load the lead workspace."); return; }
    setCurrentWorkspace(workspace);
    navigate("/app/create?stage=plans");
  }
  return <div className="space-y-6 p-4 sm:p-6 md:p-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="font-display text-3xl font-extrabold">Leads</h1><p className="text-muted-foreground">Create content samples for prospective clients and track their offers.</p></div>
      <Button onClick={() => setAdding(true)}>Add lead</Button>
    </header>
    {leads.isPending ? <p role="status">Loading leads…</p> : leads.isError ? <Button variant="outline" onClick={() => void leads.refetch()}>Retry loading leads</Button> :
      !leads.data.length ? <Card><CardContent className="py-10 text-center text-muted-foreground">Add a lead to start creating samples.</CardContent></Card> :
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{leads.data.map((lead) => <Card key={lead.id}><CardContent className="space-y-3 p-5">
          <h2 className="font-semibold">{lead.name}</h2>
          {lead.contact && lead.contact !== lead.name && <p>{lead.contact}</p>}
          <p className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {lead.website && <a className="underline" href={lead.website} target="_blank" rel="noreferrer">Website</a>}
            {lead.linkedin && <a className="underline" href={lead.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
          </p>
          <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => openWorkspace(lead.workspaceId)}>Open workspace</Button>
            <Button size="sm" variant="outline" onClick={() => setOffering(lead)}>Share offer / activity</Button></div>
        </CardContent></Card>)}</div>}
    <Dialog open={adding} onOpenChange={setAdding}><DialogContent>
      <DialogHeader><DialogTitle>Add lead</DialogTitle><DialogDescription>Enter a contact and at least one source for Sam to review.</DialogDescription></DialogHeader>
      {adding && <AddLead close={() => setAdding(false)} />}
    </DialogContent></Dialog>
    <Dialog open={!!offering} onOpenChange={(open) => { if (!open) setOffering(undefined); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{offering?.name}</DialogTitle><DialogDescription>Share finished content and view the lead’s response.</DialogDescription></DialogHeader>
      {offering && <LeadOffers key={offering.id} lead={offering} />}
    </DialogContent></Dialog>
  </div>;
}
