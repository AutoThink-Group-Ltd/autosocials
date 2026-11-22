import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign, TrendingUp, Calculator, Clock, Shield,
  AlertTriangle, CheckCircle2, Info,
} from "lucide-react";

// ═══════════ PRICING HISTORY LOG ═══════════
const PRICING_HISTORY = [
  {
    date: "2026-03-23T00:00:00Z",
    version: "v2.0 — Locked",
    changes: [
      "Pro tier increased from £149 → £299/mo to protect gross margins against Phyllo API costs",
      "Added enrichment limits across all tiers (primary cost driver at $0.50/profile)",
      "Added content call limits across all tiers",
      "Bulk outreach made available on ALL plans (core USP)",
      "Custom email domain made available on ALL plans",
      "Removed agency dashboard from Pro features (agency-only feature)",
      "Removed white-label reports from Pro features (agency-only feature)",
      "Search limits adjusted: Starter 30, Growth 150, Scale 500, Pro 2,000",
      "Scale tier added at £199/mo for brands scaling operations",
    ],
    notes: "Based on Phyllo API economics: $417/mo search (1M/yr), $500/mo enrichments (1k/mo), $500/mo content (10k/mo). Total fixed cost: ~$1,417/mo (£1,116/mo).",
  },
  {
    date: "2026-03-15T00:00:00Z",
    version: "v1.0 — Initial",
    changes: [
      "Starter: £49/mo — 50 searches, 100 emails, 200 saved creators",
      "Growth: £79/mo — 200 searches, 500 emails, 1,000 saved creators",
      "Pro: £149/mo — Unlimited searches/emails/creators",
      "Scale: £199/mo — Added as intermediate tier",
    ],
    notes: "Initial pricing before Phyllo cost analysis. Pro tier had unlimited everything which was unsustainable.",
  },
];

// ═══════════ ECONOMICS DATA ═══════════
const PHYLLO_COSTS = {
  search: { annual: 5000, monthly: 417, included: 1_000_000, unitLabel: "search results", unitCost: 0.005 },
  enrichment: { monthly: 500, included: 1000, unitLabel: "profile enrichments", unitCost: 0.50 },
  content: { monthly: 500, included: 10000, unitLabel: "content calls", unitCost: 0.05 },
  totalMonthly: 1417,
  totalMonthlyGBP: 1116,
};

const PLAN_ECONOMICS = [
  {
    plan: "Starter",
    price: 49,
    searchAllowance: 30,
    enrichAllowance: 5,
    contentAllowance: 20,
    searchCost: 3.00,
    enrichCost: 2.50,
    contentCost: 1.00,
    totalCost: 6.50,
    margin: 42.50,
    marginPct: 86.7,
  },
  {
    plan: "Growth",
    price: 79,
    searchAllowance: 150,
    enrichAllowance: 30,
    contentAllowance: 200,
    searchCost: 15.00,
    enrichCost: 15.00,
    contentCost: 10.00,
    totalCost: 40.00,
    margin: 39.00,
    marginPct: 49.4,
  },
  {
    plan: "Scale",
    price: 199,
    searchAllowance: 500,
    enrichAllowance: 100,
    contentAllowance: 1000,
    searchCost: 50.00,
    enrichCost: 50.00,
    contentCost: 50.00,
    totalCost: 150.00,
    margin: 49.00,
    marginPct: 24.6,
  },
  {
    plan: "Pro",
    price: 299,
    searchAllowance: 2000,
    enrichAllowance: 300,
    contentAllowance: 3000,
    searchCost: 200.00,
    enrichCost: 150.00,
    contentCost: 150.00,
    totalCost: 500.00,
    margin: -201.00,
    marginPct: -67.2,
    note: "Negative per-user if maxed. Profitable in practice — avg usage ~40% of limits.",
  },
];

const BREAKEVEN_SCENARIOS = [
  { label: "All Starter", users: 23, revenue: 1127, cost: 1116 },
  { label: "Typical Mix (40/30/20/10)", users: 12, revenue: 1194, cost: 1116 },
  { label: "Growth Heavy", users: 15, revenue: 1185, cost: 1116 },
  { label: "Scale Heavy", users: 8, revenue: 1195, cost: 1116 },
];

export default function PricingEconomicsTab() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <Calculator className="w-5 h-5 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Pricing Economics & History</h2>
          <p className="text-xs text-muted-foreground">Internal reference — Phyllo API cost analysis & plan structure</p>
        </div>
      </div>

      {/* Phyllo Cost Summary */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-500" />
            Phyllo API Costs (Fixed Monthly)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              { label: "Creator Search API", cost: `$${PHYLLO_COSTS.search.monthly}`, detail: `${(PHYLLO_COSTS.search.included / 1000).toFixed(0)}K results/yr`, unit: `$${PHYLLO_COSTS.search.unitCost}/result` },
              { label: "Profile Analytics API", cost: `$${PHYLLO_COSTS.enrichment.monthly}`, detail: `${PHYLLO_COSTS.enrichment.included.toLocaleString()} enrichments/mo`, unit: `$${PHYLLO_COSTS.enrichment.unitCost}/profile` },
              { label: "Public Content API", cost: `$${PHYLLO_COSTS.content.monthly}`, detail: `${(PHYLLO_COSTS.content.included / 1000).toFixed(0)}K calls/mo`, unit: `$${PHYLLO_COSTS.content.unitCost}/call` },
              { label: "Total Fixed Cost", cost: `$${PHYLLO_COSTS.totalMonthly}`, detail: `≈ £${PHYLLO_COSTS.totalMonthlyGBP}/mo`, unit: "All APIs combined" },
            ].map((item) => (
              <div key={item.label} className="bg-secondary/50 rounded-lg p-3 border border-border/40">
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
                <p className="text-lg font-bold text-foreground">{item.cost}</p>
                <p className="text-[10px] text-muted-foreground">{item.detail}</p>
                <p className="text-[10px] text-primary font-medium mt-1">{item.unit}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground">
                <strong className="text-foreground">Key Insight:</strong> Profile enrichments are the #1 cost driver at $0.50/profile.
                Search results cost $0.005/result (charged per result returned, not per query). A single search returning 20 results = $0.10.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Plan Economics */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            Per-Plan Unit Economics (Max Usage Scenario)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Plan</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Price</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Searches</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Enrichments</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Content</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">API Cost</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Margin</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {PLAN_ECONOMICS.map((row) => (
                  <tr key={row.plan} className="border-b border-border/50 hover:bg-secondary/30">
                    <td className="p-3 font-medium text-foreground">{row.plan}</td>
                    <td className="p-3 text-right text-foreground">£{row.price}</td>
                    <td className="p-3 text-right text-muted-foreground">{row.searchAllowance}</td>
                    <td className="p-3 text-right text-muted-foreground">{row.enrichAllowance}</td>
                    <td className="p-3 text-right text-muted-foreground">{row.contentAllowance}</td>
                    <td className="p-3 text-right text-muted-foreground">£{row.totalCost.toFixed(0)}</td>
                    <td className={`p-3 text-right font-medium ${row.margin >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      £{row.margin.toFixed(0)}
                    </td>
                    <td className="p-3 text-right">
                      <Badge variant="outline" className={`text-[10px] ${
                        row.marginPct >= 40 ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" :
                        row.marginPct >= 0 ? "bg-amber-500/10 text-amber-700 border-amber-500/20" :
                        "bg-destructive/10 text-destructive border-destructive/20"
                      }`}>
                        {row.marginPct.toFixed(1)}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {PLAN_ECONOMICS.filter(p => p.note).map((p) => (
            <div key={p.plan} className="mt-2 p-2 rounded bg-muted/50 border border-border/40">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                <span><strong>{p.plan}:</strong> {p.note}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Breakeven Analysis */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            Breakeven Scenarios (Fixed cost: £{PHYLLO_COSTS.totalMonthlyGBP}/mo)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {BREAKEVEN_SCENARIOS.map((s) => (
              <div key={s.label} className="bg-secondary/50 rounded-lg p-3 border border-border/40">
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold text-foreground">{s.users} users</p>
                <p className="text-[10px] text-muted-foreground">£{s.revenue} revenue vs £{s.cost} cost</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Locked Plan Structure */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            Locked Plan Structure — v2.0
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Feature</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Starter £49</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Growth £79</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Scale £199</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Pro £299</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {[
                  { feature: "Creator Searches", values: ["30", "150", "500", "2,000"] },
                  { feature: "Outreach Emails", values: ["100", "500", "2,000", "Unlimited"] },
                  { feature: "Profile Enrichments", values: ["5", "30", "100", "300"] },
                  { feature: "Content Calls", values: ["20", "200", "1,000", "3,000"] },
                  { feature: "Saved Creators", values: ["200", "1,000", "5,000", "Unlimited"] },
                  { feature: "Creator Lists", values: ["5", "20", "Unlimited", "Unlimited"] },
                  { feature: "AI Vibe Conversations", values: ["20", "100", "Unlimited", "Unlimited"] },
                  { feature: "Team Members", values: ["1", "3", "10", "25"] },
                  { feature: "Workspaces", values: ["1", "2", "5", "20"] },
                  { feature: "Bulk Outreach", values: ["✓", "✓", "✓", "✓"] },
                  { feature: "Custom Email Domain", values: ["✓", "✓", "✓", "✓"] },
                  { feature: "AI Outreach Generation", values: ["—", "✓", "✓", "✓"] },
                  { feature: "Commission Tracking", values: ["—", "✓", "✓", "✓"] },
                  { feature: "Brand Intelligence", values: ["—", "—", "✓", "✓"] },
                  { feature: "Custom Commission Rules", values: ["—", "—", "—", "✓"] },
                  { feature: "Dedicated Support", values: ["—", "—", "—", "✓"] },
                ].map((row) => (
                  <tr key={row.feature} className="border-b border-border/30 hover:bg-secondary/30">
                    <td className="p-2.5 text-foreground font-medium">{row.feature}</td>
                    {row.values.map((v, i) => (
                      <td key={i} className={`p-2.5 text-center ${v === "✓" ? "text-emerald-600 font-bold" : v === "—" ? "text-muted-foreground" : v === "Unlimited" ? "text-primary font-medium" : "text-foreground"}`}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pricing History Log */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Pricing Change History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {PRICING_HISTORY.map((entry) => (
            <div key={entry.version} className="border border-border/40 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <Badge variant="outline" className="text-[10px]">{entry.version}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  {" — "}
                  {new Date(entry.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <ul className="space-y-1.5 mb-3">
                {entry.changes.map((change, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
              {entry.notes && (
                <div className="p-2 rounded bg-muted/50 border border-border/40">
                  <p className="text-[10px] text-muted-foreground"><strong>Notes:</strong> {entry.notes}</p>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
