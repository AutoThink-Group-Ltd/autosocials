import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, RefreshCw } from "lucide-react";
import { getHiggsfieldCosts } from "@/lib/higgsfield-costs.functions";
import { getProviderBilling, recordProviderCharge } from "@/lib/provider-billing.functions";
import type { ProviderBillingInput } from "@/lib/provider-billing";

const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

export default function HiggsfieldCosts() {
  const [days, setDays] = useState<7 | 30>(30);
  const getCosts = useServerFn(getHiggsfieldCosts);
  const getBilling = useServerFn(getProviderBilling);
  const recordCharge = useServerFn(recordProviderCharge);
  const [account, setAccount] = useState("primary");
  const [transaction, setTransaction] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [source, setSource] = useState<ProviderBillingInput["evidence_source"]>("provider_receipt");
  const [stepId, setStepId] = useState("");
  const [basis, setBasis] = useState<"single_request_reconciliation" | "manual_receipt_reconciliation">("manual_receipt_reconciliation");
  const [saving, setSaving] = useState(false);
  const [recordMessage, setRecordMessage] = useState("");
  const billing = useQuery({ queryKey: ["provider-billing", account, days], queryFn: () => getBilling({ data: { account_key: account, days } }), enabled: /^[a-zA-Z0-9_-]{1,80}$/.test(account), staleTime: 60_000 });
  const usage = useQuery({ queryKey: ["higgsfield-costs", days], queryFn: () => getCosts({ data: { days } }), staleTime: 60_000 });
  const byModel = Object.entries((usage.data?.rows ?? []).reduce<Record<string, { quantity: number; cost: number }>>((acc, row) => {
    const current = acc[row.model] ?? { quantity: 0, cost: 0 };
    current.quantity += row.quantity; current.cost += row.cost; acc[row.model] = current;
    return acc;
  }, {})).sort((a, b) => b[1].cost - a[1].cost);
  return <div className="mx-auto max-w-5xl space-y-6 p-5 md:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="font-display text-2xl font-bold">Higgsfield costs & balance</h1><p className="mt-1 text-sm text-muted-foreground">Recorded provider deductions and estimated API usage, shown separately.</p></div>
      <div className="flex gap-2"><select aria-label="Usage period" value={days} onChange={event => setDays(Number(event.target.value) as 7 | 30)} className="rounded-[10px] border border-border-control bg-canvas px-3 py-2 text-sm"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select><button type="button" onClick={() => { void usage.refetch(); void billing.refetch(); }} disabled={usage.isFetching || billing.isFetching} className="inline-flex items-center gap-2 rounded-[10px] border border-border-control px-3 py-2 text-sm font-medium disabled:opacity-50"><RefreshCw size={15} className={usage.isFetching || billing.isFetching ? "animate-spin" : ""} /> Refresh</button></div>
    </div>
    {usage.isError && <div role="alert" className="rounded-[12px] border border-warning/40 bg-warning-surface p-4 text-sm text-warning">{usage.error instanceof Error ? usage.error.message : "Usage could not be loaded."}</div>}
    <section className="space-y-4 rounded-[14px] border border-border bg-canvas p-5">
      <div><h2 className="font-display text-lg font-bold">Actual provider charges recorded</h2><p className="mt-2 text-3xl font-bold tabular-nums">{billing.data ? money(billing.data.totalBilledUsd) : "—"}</p><p className="mt-2 text-xs text-muted-foreground">Usage deductions recorded from provider receipts, invoices or billing screenshots · last {days} calendar days (UTC). Top-ups and bonus credits are excluded. This total covers recorded evidence and may be incomplete.</p></div>
      <label className="block text-sm">Billing account label<input value={account} onChange={(event) => setAccount(event.target.value)} className="ml-2 rounded border border-border-control bg-canvas px-2 py-1" maxLength={80} /></label>
      {billing.error && <p role="alert" className="text-sm text-warning">{billing.error.message}</p>}
      {billing.data?.rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-muted-foreground"><th className="py-2">Date / transaction</th><th>Deducted</th><th>Evidence / attribution</th></tr></thead><tbody>{billing.data.rows.map((row) => <tr key={row.id} className="border-b border-border align-top last:border-0"><td className="py-3 pr-4">{row.occurred_on}<p className="break-all text-xs text-muted-foreground">{row.transaction_id}</p></td><td className="py-3 pr-4 tabular-nums">{money(Number(row.amount_usd))}{row.originalEstimate && <p className="text-xs text-muted-foreground">Original estimate: {row.originalEstimate.currency} {row.originalEstimate.amount.toFixed(4)}</p>}</td><td className="py-3 text-xs"><p>{row.evidence_source.replaceAll("_", " ")}</p><p>{row.attribution_basis === "unlinked" ? "Not linked to a generation" : row.attribution_basis.replaceAll("_", " ")}</p>{row.generation_step_id && <p className="break-all text-muted-foreground">Generation step: {row.generation_step_id}</p>}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">{billing.isPending ? "Loading recorded charges…" : "No provider charges recorded for this account and period."}</p>}
      <p className="text-xs text-muted-foreground">Receipt reconciliation is recorded by a super admin. Higgsfield does not expose an API-verified transaction-to-request link. Original generation estimates remain in the generation tracker.</p>
      <details><summary className="cursor-pointer text-sm font-medium">Record a provider usage charge</summary><form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={async (event) => { event.preventDefault(); if (saving) return; setSaving(true); setRecordMessage(""); try { const result = await recordCharge({ data: { account_key: account, transaction_id: transaction.trim(), amount_usd: Number(amount), occurred_on: date, evidence_source: source, generation_step_id: stepId.trim() || null, attribution_basis: stepId.trim() ? basis : "unlinked" } }); setRecordMessage(result.reused ? "This charge was already recorded; no duplicate was added." : "Provider charge recorded."); await billing.refetch(); } catch (error) { setRecordMessage(error instanceof Error ? error.message : "The charge could not be recorded."); } finally { setSaving(false); } }}>
        <label className="text-sm">Provider transaction ID<input required value={transaction} onChange={(e) => setTransaction(e.target.value)} maxLength={200} className="mt-1 block w-full rounded border border-border-control bg-canvas p-2" /></label>
        <label className="text-sm">Amount deducted (USD)<input required type="number" min="0.01" max="1000000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 block w-full rounded border border-border-control bg-canvas p-2" /></label>
        <label className="text-sm">Provider transaction date<input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-full rounded border border-border-control bg-canvas p-2" /></label>
        <label className="text-sm">Evidence source<select value={source} onChange={(e) => setSource(e.target.value as ProviderBillingInput["evidence_source"])} className="mt-1 block w-full rounded border border-border-control bg-canvas p-2"><option value="provider_receipt">Provider receipt</option><option value="provider_invoice">Provider invoice</option><option value="user_supplied_provider_billing_screenshot">Provider billing screenshot</option></select></label>
        <label className="text-sm">Generation step ID (optional)<input value={stepId} onChange={(e) => setStepId(e.target.value)} className="mt-1 block w-full rounded border border-border-control bg-canvas p-2" /></label>
        {stepId.trim() && <label className="text-sm">Attribution basis<select value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)} className="mt-1 block w-full rounded border border-border-control bg-canvas p-2"><option value="manual_receipt_reconciliation">Manual receipt reconciliation</option><option value="single_request_reconciliation">Sole-request reconciliation</option></select></label>}
        <button disabled={saving} type="submit" className="justify-self-start rounded-[10px] border border-border-control px-3 py-2 text-sm font-medium disabled:opacity-50">{saving ? "Recording…" : "Record charge"}</button>{recordMessage && <p role="status" className="text-sm">{recordMessage}</p>}
      </form></details>
    </section>
    <div className="grid gap-4 md:grid-cols-3">
      <section className="rounded-[14px] border border-border bg-canvas p-5"><h2 className="text-sm font-medium text-muted-foreground">Estimated API cost</h2><p className="mt-2 text-3xl font-bold tabular-nums">{usage.data ? money(usage.data.totalCost) : "—"}</p><p className="mt-2 text-xs text-muted-foreground">Last {days} days · USD</p></section>
      <section className="rounded-[14px] border border-border bg-canvas p-5"><h2 className="text-sm font-medium text-muted-foreground">Completed generations</h2><p className="mt-2 text-3xl font-bold tabular-nums">{usage.data ? usage.data.generations.toLocaleString() : "—"}</p><p className="mt-2 text-xs text-muted-foreground">Failed and cancelled requests are excluded by Higgsfield.</p></section>
      <section className="rounded-[14px] border border-border bg-canvas p-5"><h2 className="text-sm font-medium text-muted-foreground">Account balance</h2><p className="mt-2 text-lg font-semibold">Unavailable via API</p><p className="mt-2 text-xs text-muted-foreground">Higgsfield does not document a balance endpoint. Check your provider account for the current balance or invoice.</p></section>
    </div>
    <section className="rounded-[14px] border border-border bg-canvas p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-bold">Cost by model</h2><span className="text-xs text-muted-foreground">{usage.data ? `Updated ${new Date(usage.data.fetchedAt).toLocaleString()}` : usage.isPending ? "Loading…" : ""}</span></div>
      {byModel.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-muted-foreground"><th className="py-2 font-medium">Model</th><th className="py-2 text-right font-medium">Generations</th><th className="py-2 text-right font-medium">Estimated cost</th></tr></thead><tbody>{byModel.map(([model, total]) => <tr key={model} className="border-b border-border last:border-0"><td className="py-3 pr-4">{model}</td><td className="py-3 text-right tabular-nums">{total.quantity.toLocaleString()}</td><td className="py-3 text-right tabular-nums">{money(total.cost)}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-muted-foreground">{usage.isPending ? "Loading usage…" : usage.isError ? "No usage data available." : "No completed Higgsfield generations in this period."}</p>}</section>
    <p className="text-sm text-muted-foreground">Higgsfield says usage totals are estimates, may lag, and can differ from invoices. This page cannot confirm your available provider funds before a render. <a className="inline-flex items-center gap-1 font-medium underline" href="https://cloud.higgsfield.ai" target="_blank" rel="noreferrer">Open Higgsfield <ExternalLink size={13} /></a></p>
  </div>;
}
