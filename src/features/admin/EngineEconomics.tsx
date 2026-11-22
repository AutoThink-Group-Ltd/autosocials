import { Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HiggsfieldCosts from "./HiggsfieldCosts";
import KieCosts from "./KieCosts";
import { ContentCreditRates } from "./ContentCreditRates";

type Estimate = { engine: string; amount: number; unit: string; basis: string; confidence: string };
const video: Estimate[] = [
  { engine: "HyperFrames", amount: 0.50, unit: "60-second video", basis: "Placeholder for rendering and infrastructure; actual compute cost is unknown.", confidence: "Planning guess" },
  { engine: "Golpo.io", amount: 2, unit: "60-second video", basis: "User supplied: US$1 per 30 seconds or US$2 per minute. Other production costs may apply.", confidence: "User-supplied rate" },
  { engine: "Higgsfield", amount: 6, unit: "60-second video", basis: "Placeholder for generated clips; model, settings and required clips are unknown.", confidence: "Planning guess" },
  { engine: "HeyGen", amount: 3, unit: "60-second video", basis: "Placeholder for a one-minute avatar video; model and account pricing are unknown.", confidence: "Planning guess" },
];
const images: Estimate[] = [
  { engine: "Kie", amount: 0.04, unit: "1K image", basis: "Nano Banana 2 reference price for 1K; 2K and 4K cost more. Provider pricing may change.", confidence: "Provider reference" },
  { engine: "OpenAI image generation", amount: 0.20, unit: "image", basis: "Placeholder for one generated image; model, quality and token charges are unconfirmed.", confidence: "Planning guess" },
  { engine: "Ideogram", amount: 0.08, unit: "image", basis: "Assumes 8 provider credits per image at US$0.01 each; 8 credits is a guess, not a verified model rate.", confidence: "Planning guess" },
  { engine: "Recraft", amount: 0.035, unit: "image", basis: "Uses the supplied V4.1 rate of 35 API units per image as a proxy; the app's recraftv4_styles rate is unconfirmed.", confidence: "Proxy estimate" },
];
const enginePages = [
  { id: "hyperframes", label: "HyperFrames" }, { id: "golpo", label: "Golpo.io" }, { id: "higgsfield", label: "Higgsfield" }, { id: "heygen", label: "HeyGen" },
  { id: "kie", label: "Kie" }, { id: "openai", label: "OpenAI" }, { id: "ideogram", label: "Ideogram" }, { id: "recraft", label: "Recraft" },
] as const;
const estimates = [...video, ...images];
function EconomicsNav({ active }: { active: string }) {
  const classes = (id: string) => active === id ? "rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-inverse" : "rounded-lg border border-border-control bg-canvas px-3 py-2 text-sm font-medium hover:bg-surface-subtle";
  return <nav aria-label="Engine economics pages" className="flex flex-wrap gap-2 border-b border-border-control pb-3"><Link to="/app/admin/engine-economics" aria-current={active === "overview" ? "page" : undefined} className={classes("overview")}>Overview</Link>{enginePages.map(page => <Link key={page.id} to="/app/admin/engine-costs/$engine" params={{ engine: page.id }} aria-current={active === page.id ? "page" : undefined} className={classes(page.id)}>{page.label}</Link>)}</nav>;
}
const engineNames: Record<string, string> = { hyperframes: "HyperFrames", golpo: "Golpo.io", higgsfield: "Higgsfield", kie: "Kie", heygen: "HeyGen", openai: "OpenAI image generation", ideogram: "Ideogram", recraft: "Recraft" };
function CostTable({ rows, unit }: { rows: Estimate[]; unit: string }) {
  const average = rows.reduce((sum, row) => sum + row.amount, 0) / rows.length;
  return <div className="overflow-x-auto rounded-2xl border border-border-control bg-canvas"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-border-control text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-4">Engine</th><th className="p-4">Basis</th><th className="p-4">Evidence</th><th className="bg-surface-subtle p-4 text-foreground">Estimated provider cost / {unit}</th></tr></thead><tbody>{rows.map(row => <tr key={row.engine} className="border-b border-border-control"><th scope="row" className="p-4 font-semibold">{row.engine}</th><td className="p-4 text-muted-foreground">{row.basis}</td><td className="p-4">{row.confidence}</td><td className="bg-surface-subtle p-4 font-semibold tabular-nums">US${row.amount.toFixed(3)} / {row.unit}</td></tr>)}</tbody><tfoot><tr className="font-bold"><th scope="row" className="p-4">Average</th><td colSpan={2} className="p-4 text-xs font-normal text-muted-foreground">Simple average of the {rows.length} figures above; not a combined production cost.</td><td className="bg-surface-subtle p-4 tabular-nums">US${average.toFixed(3)} / {unit}</td></tr></tfoot></table></div>;
}
export default function EngineEconomics() {
  return <section className="space-y-6 p-6 text-foreground"><header><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Super Admin / Economics</p><h1 className="mt-2 text-2xl font-bold">Engine Economics</h1><p className="mt-2 text-sm text-muted-foreground">Compare estimated provider costs for a 60-second video or one image.</p></header>
    <div className="rounded-2xl border border-border-control bg-canvas p-5"><h2 className="font-semibold">Planning estimates</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">At your request, missing costs use rough guesses until provider pricing or receipts are confirmed. These are not verified prices or customer charges. The averages weight each listed engine equally and do not represent a bill or the cost of combining engines. Extra narration, rendering, retries and other services may add cost.</p></div>
    <EconomicsNav active="overview" /><ContentCreditRates /><Tabs defaultValue="video"><TabsList aria-label="Engine cost categories"><TabsTrigger value="video">Video · 60 seconds</TabsTrigger><TabsTrigger value="images">Images · per image</TabsTrigger></TabsList>
      <TabsContent value="video" className="space-y-5"><CostTable rows={video} unit="60-second video" /></TabsContent>
      <TabsContent value="images" className="space-y-5"><CostTable rows={images} unit="image" /></TabsContent>
    </Tabs><p className="text-xs leading-relaxed text-muted-foreground">Reference figures only; they do not alter billing or generation. Existing recorded usage and estimates are in the <Link to="/app/admin/generations" className="underline">generation tracker</Link> and <Link to="/app/admin/engine-costs/$engine" params={{ engine: "higgsfield" }} className="underline">Higgsfield costs &amp; balance</Link>.</p>
  </section>;
}

export function EngineEconomicsDetail({ id }: { id: string }) {
  const name = engineNames[id];
  const estimate = estimates.find(row => row.engine === name);
  if (!name || !estimate) return <section className="space-y-4 p-6"><h1 className="text-2xl font-bold">Engine not found</h1><Link to="/app/admin/engine-economics" className="underline">Back to Engine Economics</Link></section>;
  return <section className="space-y-6 p-6 text-foreground"><header><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Super Admin / Economics</p><h1 className="mt-2 text-2xl font-bold">{name} economics</h1><p className="mt-2 text-sm text-muted-foreground">Provider pricing, assumptions and available usage information.</p></header>
    <EconomicsNav active={id} />
    <div className="rounded-2xl border border-border-control bg-canvas p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{estimate.confidence}</p><h2 className="mt-2 text-2xl font-bold tabular-nums">US$ {estimate.amount.toFixed(3)} / {estimate.unit}</h2><p className="mt-3 text-sm text-muted-foreground">{estimate.basis}</p>{!["User-supplied rate", "Provider reference"].includes(estimate.confidence) && <p className="mt-2 text-xs text-muted-foreground">Planning estimate only; not a verified provider charge.</p>}</div>
    {id === "golpo" && (<div className="rounded-2xl border border-border-control bg-canvas p-5"><h2 className="font-semibold">Golpo.io duration pricing</h2><p className="mt-2 text-sm text-muted-foreground">Your supplied rates: 30 seconds US$1, 1 minute US$2, 2 minutes US$4 and 4 minutes US$8. The benchmark covers the Golpo charge; separate production charges may apply.</p></div>)}
    {id === "recraft" && (<div className="rounded-2xl border border-border-control bg-canvas p-5"><h2 className="font-semibold">Recraft model reference rates</h2><p className="mt-2 text-sm text-muted-foreground">Your screenshot shows US$10 for 10,000 API units, or US$0.001 per unit. The app uses recraftv4_styles, whose rate is not confirmed against these V4.1 reference prices.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead><tr className="border-b border-border-control"><th className="py-3 pr-4">Model</th><th className="py-3 pr-4">API units / image</th><th className="bg-surface-subtle px-4 py-3">Cost per image</th></tr></thead><tbody>{[["V4.1", 35], ["V4.1 Pro", 210], ["V4.1 Flash", 7], ["V4.1 Vector", 80], ["V4.1 Pro Vector", 300], ["V4.1 Utility", 35], ["V4.1 Utility Pro", 210]].map(([model, units]) => <tr key={model} className="border-b border-border-control last:border-0"><th scope="row" className="py-3 pr-4 font-medium">{model}</th><td className="py-3 pr-4">{units}</td><td className="bg-surface-subtle px-4 py-3 font-semibold">{"US$" + (Number(units) / 1000).toFixed(3)}</td></tr>)}</tbody></table></div><a href="https://www.recraft.ai/app/api/billing" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-medium underline">Recraft API billing</a></div>)}
    {id === "ideogram" && (<div className="rounded-2xl border border-border-control bg-canvas p-5"><h2 className="font-semibold">Ideogram pay-as-you-go</h2><p className="mt-2 text-sm text-muted-foreground">Your screenshot shows 500 credits for US$5, or US$0.01 per provider credit. The number of credits per image remains unconfirmed.</p><a href="https://ideogram.ai/settings/plans" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-medium underline">Ideogram plans</a></div>)}
    {id === "higgsfield" && <HiggsfieldCosts />}
    {id === "kie" && <KieCosts />}
    <p className="text-xs leading-relaxed text-muted-foreground">Reference figures do not alter billing or generation. Return to <Link className="underline" to="/app/admin/engine-economics">Engine Economics overview</Link> to compare providers.</p>
  </section>;
}
