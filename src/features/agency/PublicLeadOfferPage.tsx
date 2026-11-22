import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Logo } from "@/components/brand/Logo";
import { offerAssetLabel, offerPrice, offerTokenSchema } from "@/lib/agency-leads";
import { readAgencyLeadOffer, respondToAgencyLeadOffer, trackAgencyLeadOffer } from "@/lib/agency-leads.functions";

export function PublicLeadOfferPage({ token }: { token: string }) {
  const read = useServerFn(readAgencyLeadOffer);
  const track = useServerFn(trackAgencyLeadOffer);
  const respond = useServerFn(respondToAgencyLeadOffer);
  const activity = useRef<{ id: string; view: Promise<boolean> } | null>(null);
  const [visibleSample, setVisibleSample] = useState<string>();
  const [confirm, setConfirm] = useState<"accepted" | "declined">();
  const [decision, setDecision] = useState<"accepted" | "declined">();
  const [sending, setSending] = useState(false);
  const [unavailable, setUnavailable] = useState(!offerTokenSchema.safeParse(token).success);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["unlisted-agency-offer", token], queryFn: () => read({ data: { token } }),
    enabled: !unavailable, refetchOnWindowFocus: false, staleTime: 180_000, gcTime: 0,
  });
  const loaded = !!query.data;
  useEffect(() => {
    if (!loaded) return;
    const record = () => {
      if (document.visibilityState !== "visible" || activity.current) return;
      const id = crypto.randomUUID();
      activity.current = { id, view: track({ data: { token, visitId: id } }).catch(() => false) };
    };
    record();
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [loaded, token, track]);

  function openSample(key: string) {
    if (visibleSample === key) { setVisibleSample(undefined); return; }
    setVisibleSample(key);
    const visit = activity.current;
    if (visit) void visit.view.then(async (ok) => { if (ok) await track({ data: { token, visitId: visit.id, sampleKey: key } }); }).catch(() => {});
    if (Date.now() - query.dataUpdatedAt > 180_000) void query.refetch();
  }

  async function submitDecision() {
    if (!confirm || sending) return;
    setSending(true);
    setError("");
    try {
      const result = await respond({ data: { token, decision: confirm } });
      setConfirm(undefined);
      if (!result) { setUnavailable(true); return; }
      setDecision(result);
      await query.refetch();
    } catch { setError("Could not record your response. Please try again."); }
    finally { setSending(false); }
  }

  const offer = query.data;
  const currentDecision = decision ?? offer?.decision;
  return <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-5xl space-y-10 px-5 py-10 sm:px-8 sm:py-16">
      <Logo size={22} />
      {unavailable || (!query.isPending && !query.isError && !offer) ? <h1 className="font-display text-3xl font-semibold">This offer link is unavailable</h1> :
        query.isError && !offer ? <div className="space-y-3"><h1 className="font-display text-3xl font-semibold">Couldn’t load this offer</h1><Button onClick={() => void query.refetch()}>Try again</Button></div> :
        !offer ? <p role="status">Loading your offer…</p> : <>
          <header className="space-y-4">
            <p className="text-muted-foreground">Prepared for {offer.recipient} by {offer.agency}</p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{offer.title}</h1>
            <p className="font-display text-2xl font-semibold">{offerPrice(offer.priceMinor, offer.currency, offer.cadence)}</p>
          </header>
          <section className="space-y-3" aria-labelledby="offer-details">
            <h2 id="offer-details" className="font-display text-2xl font-bold">What’s included</h2>
            <p className="max-w-3xl whitespace-pre-wrap break-words leading-relaxed">{offer.description}</p>
          </section>
          <section className="space-y-4" aria-labelledby="offer-samples">
            <h2 id="offer-samples" className="font-display text-2xl font-bold">Your content examples</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {offer.samples.map((sample) => <article key={sample.key} className="space-y-3 rounded-2xl border bg-card p-4">
                {sample.images[0] && <img className="aspect-square w-full rounded-lg object-contain" src={sample.images[0]} alt={`${sample.title} preview`} loading="lazy" referrerPolicy="no-referrer" />}
                <div><p className="text-sm text-muted-foreground">{offerAssetLabel[sample.type]}</p><h3 className="break-words font-semibold">{sample.title}</h3></div>
                <Button variant="outline" aria-expanded={visibleSample === sample.key} onClick={() => openSample(sample.key)}>
                  {visibleSample === sample.key ? "Hide sample" : "Open sample"}
                </Button>
                {visibleSample === sample.key && <div className="space-y-3">
                  {sample.images.slice(1).map((url, index) => <img key={url} src={url} alt={`${sample.title}, slide ${index + 2}`} className="w-full rounded-lg" loading="lazy" referrerPolicy="no-referrer" />)}
                  {sample.video && <video controls playsInline preload="metadata" src={sample.video} className="w-full rounded-lg" aria-label={sample.title} />}
                  {sample.text && <p className="whitespace-pre-wrap break-words">{sample.text}</p>}
                  {!sample.video && !sample.images.length && !sample.text && <p>This sample is temporarily unavailable.</p>}
                  {sample.images.length === 1 && !sample.text && <a className="block text-sm underline" target="_blank" rel="noreferrer" href={sample.images[0]}>Open full-size image</a>}
                </div>}
              </article>)}
            </div>
          </section>
          <section className="space-y-4 rounded-2xl border bg-card p-5 sm:p-8" aria-live="polite">
            {currentDecision === "accepted" ? <>
              <h2 className="font-display text-2xl font-bold">Offer accepted</h2>
              <p>Here’s what happens next.</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>{offer.agency} will send you an invoice.</li>
                <li>{offer.agency} will confirm the first batch and delivery schedule with you.</li>
                {offer.nextSteps && <li className="whitespace-pre-wrap break-words">{offer.nextSteps}</li>}
              </ol>
            </> : currentDecision === "declined" ? <><h2 className="font-display text-2xl font-bold">Offer rejected</h2><p>Your response has been recorded.</p></> :
              <><h2 className="font-display text-2xl font-bold">Respond to this offer</h2><div className="flex flex-wrap gap-3">
                <Button onClick={() => setConfirm("accepted")}>Accept offer</Button>
                <Button variant="outline" onClick={() => setConfirm("declined")}>Reject offer</Button>
              </div></>}
          </section>
        </>}
    </div>
    <Dialog open={!!confirm} onOpenChange={(open) => { if (!open && !sending) { setConfirm(undefined); setError(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{confirm === "accepted" ? "Accept this offer?" : "Reject this offer?"}</DialogTitle>
          <DialogDescription>{confirm === "accepted" && offer ? `Confirm ${offerPrice(offer.priceMinor, offer.currency, offer.cadence)}. The agency will send you an invoice separately.` : "The agency will see your response."}</DialogDescription></DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2"><Button disabled={sending} onClick={() => void submitDecision()}>{sending ? "Saving…" : confirm === "accepted" ? "Confirm acceptance" : "Confirm rejection"}</Button>
          <Button variant="outline" disabled={sending} onClick={() => { setConfirm(undefined); setError(""); }}>Cancel</Button></div>
      </DialogContent>
    </Dialog>
  </main>;
}
