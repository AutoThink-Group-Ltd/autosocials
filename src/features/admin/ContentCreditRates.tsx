import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listCreditRates, publishCreditRate } from "@/lib/content-credit-admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function ContentCreditRates() {
  const client = useQueryClient();
  const rates = useQuery({ queryKey: ["admin-content-credit-rates"], queryFn: () => listCreditRates() });
  const [capability, setCapability] = useState("");
  const [duration, setDuration] = useState("0");
  const [credits, setCredits] = useState("");
  const [evidence, setEvidence] = useState("");
  const [basis, setBasis] = useState<"" | "verified" | "approved">("");
  const publish = useMutation({
    mutationFn: () => publishCreditRate({ data: { capability: capability.trim(), duration: Number(duration), credits: Number(credits), verified: basis === "verified", evidence: evidence.trim() } }),
    onSuccess: async () => { toast.success("Credit rate published"); setEvidence(""); setBasis(""); await client.invalidateQueries({ queryKey: ["admin-content-credit-rates"] }); },
    onError: () => toast.error("The credit rate could not be published."),
  });
  const valid = capability.trim().length > 0 && Number.isInteger(Number(duration)) && Number(duration) >= 0 && Number.isInteger(Number(credits)) && Number(credits) > 0 && evidence.trim().length >= 5 && !!basis;
  return <section className="space-y-4 rounded-2xl border border-border-control bg-canvas p-5" aria-labelledby="credit-rates-heading">
    <div><h2 id="credit-rates-heading" className="font-semibold">Customer credit rates</h2><p className="mt-1 text-sm text-muted-foreground">Publishing creates a new rate version. Existing reservations keep their original price. Inactive proposed rates cannot be charged.</p><p className="mt-2 text-sm text-muted-foreground">Kie requires approved customer rates before generation: kie-nano-image and kie-nano-image-edit use duration 0; kie-veo-text-video, kie-veo-image-video and kie-veo-reference-video use duration 8. Set each rate only after deciding the customer price.</p></div>
    {rates.isLoading ? <p className="text-sm">Loading rates…</p> : rates.isError ? <p role="alert" className="text-sm text-warning">Credit rates could not be loaded.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><thead><tr className="border-b border-border-control"><th className="p-2">Capability</th><th className="p-2">Duration</th><th className="p-2">Credits</th><th className="p-2">Status</th><th className="p-2">Evidence</th></tr></thead><tbody>{rates.data?.map((rate) => <tr key={rate.id} className="border-b border-border-control"><td className="p-2">{rate.capability_id}</td><td className="p-2">{rate.duration_s ? `${rate.duration_s}s` : "Image"}</td><td className="p-2">{rate.credits}</td><td className="p-2">{rate.active ? "Active" : "Inactive"}</td><td className="p-2 text-muted-foreground">{rate.evidence_note ?? "—"}</td></tr>)}</tbody></table></div>}
    <form className="grid gap-3 border-t border-border-control pt-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (valid) publish.mutate(); }}>
      <label className="space-y-1 text-sm">Capability ID<Input value={capability} onChange={(e) => setCapability(e.target.value)} required /></label>
      <label className="space-y-1 text-sm">Duration in seconds (0 for images)<Input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} required /></label>
      <label className="space-y-1 text-sm">Credits<Input type="number" min="1" value={credits} onChange={(e) => setCredits(e.target.value)} required /></label>
      <label className="space-y-1 text-sm">Activation basis<select className="w-full rounded-md border border-border-control bg-canvas p-2" value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)} required><option value="">Choose a basis</option><option value="verified">Provider cost reviewed</option><option value="approved">Approved despite unverified cost</option></select></label>
      <label className="space-y-1 text-sm sm:col-span-2">Cost evidence or approval note<Input value={evidence} onChange={(e) => setEvidence(e.target.value)} minLength={5} maxLength={1000} required /></label>
      <div className="sm:col-span-2"><Button type="submit" disabled={!valid || publish.isPending}>{publish.isPending ? "Publishing…" : "Publish new rate"}</Button></div>
    </form>
  </section>;
}
