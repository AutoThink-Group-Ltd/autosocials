import { useEffect, useRef, useState } from "react";
import samPortrait from "@/assets/sam-portrait.jpg";
import { CONTRAST_PAIRS, SHADOW_TOKENS, SPACING_SCALE } from "@/brand/baseline";
import { contrastRatio } from "@/brand/color";
import { ICONS, AppIcon, type IconName } from "@/components/brand/AppIcon";
import { BrandMark, Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusPill, UnavailableBadge } from "@/workspace/ui";
import type { LiveToken } from "./useLiveTokens";
import { CopyChip, Meta, Section, StatusTag } from "./parts";

function Swatch({ t }: { t: LiveToken }) {
  const utility = t.utilities[0];
  return (
    <article className="min-w-0 rounded-[14px] border border-border bg-surface p-3">
      <div
        className="flex h-16 items-center justify-center rounded-[10px] border border-border text-[11px] text-muted-foreground"
        style={t.expression && t.rgba ? { background: t.expression } : undefined}
        aria-hidden="true"
      >
        {!t.rgba && t.status}
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">{t.role}</p>
          {t.canonical && <p className="break-all text-[11px] text-muted-foreground">{t.canonical}</p>}
        </div>
        <StatusTag status={t.status} />
      </div>
      <div className="mt-2 space-y-1">
        <Meta k="Variable"><CopyChip value={t.cssVar} what="variable name" /></Meta>
        <Meta k="Expression"><CopyChip value={t.expression?.startsWith("hsl(") && !t.raw.startsWith("hsl") ? `hsl(var(${t.cssVar}))` : `var(${t.cssVar})`} what="CSS expression" /></Meta>
        <Meta k="Utility">{utility ? <CopyChip value={utility} what="utility class" /> : <span className="text-muted-foreground">No utility registered</span>}</Meta>
        <Meta k="Raw">{t.raw || "—"}</Meta>
        <Meta k="HEX">{t.hex ? <CopyChip value={t.hex} what="resolved value" /> : t.status}</Meta>
        <Meta k="HSL">{t.hsl ?? "—"}</Meta>
        {t.approved && <Meta k="Approved">{t.approved}</Meta>}
        {t.aliasOf && <Meta k="Alias of">{t.aliasOf}</Meta>}
      </div>
      {(t.note || t.reason) && <p className="mt-2 text-[12px] text-text-secondary">{t.reason ?? t.note}</p>}
    </article>
  );
}

function SwatchGrid({ items }: { items: LiveToken[] }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{items.map((t) => <Swatch key={t.cssVar} t={t} />)}</div>;
}

const TYPE_SPECIMENS: { label: string; className: string; text: string; family: string }[] = [
  { label: "Marketing hero", className: "font-display font-extrabold tracking-[-0.04em] leading-[1.02] text-[clamp(36px,5vw,64px)]", text: "Organic content.", family: "Plus Jakarta Sans" },
  { label: "Editorial emphasis", className: "font-editorial italic text-[40px] leading-none", text: "On repeat.", family: "Instrument Serif" },
  { label: "H1 workspace", className: "font-display text-[28px] font-extrabold tracking-[-0.03em]", text: "Create Content", family: "Plus Jakarta Sans" },
  { label: "H2 section", className: "font-display text-[20px] font-bold tracking-[-0.02em]", text: "Publishing queue", family: "Plus Jakarta Sans" },
  { label: "H3 card", className: "font-display text-[15px] font-bold", text: "Selected by Sam", family: "Plus Jakarta Sans" },
  { label: "Body reading", className: "text-[16px]", text: "Sam plans every batch from your brand dossier.", family: "Inter" },
  { label: "Chat", className: "text-[15px]", text: "I've lined up six hooks. Showing in Live View.", family: "Inter" },
  { label: "Control", className: "text-[14px] font-semibold", text: "Schedule batch", family: "Inter" },
  { label: "Navigation", className: "text-[13px] font-medium", text: "Find winners", family: "Inter" },
  { label: "Metadata", className: "text-[12px] text-muted-foreground", text: "Updated 09:42 · Cycle 1", family: "Inter" },
  { label: "Numerical", className: "text-[14px] font-semibold tabular-nums", text: "1,204 · 38.6% · 00:42", family: "Inter" },
];

function TypeRow({ s, tick }: { s: (typeof TYPE_SPECIMENS)[number]; tick: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [m, setM] = useState<{ family?: string; size?: string; weight?: string; lh?: string; ls?: string; style?: string }>({});
  useEffect(() => {
    if (!ref.current) return;
    const cs = getComputedStyle(ref.current);
    setM({ family: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, lh: cs.lineHeight, ls: cs.letterSpacing, style: cs.fontStyle });
  }, [tick]);
  const loaded = typeof document !== "undefined" && document.fonts ? document.fonts.check(`${m.style === "italic" ? "italic " : ""}${m.weight ?? 400} 16px "${s.family}"`) : false;
  return (
    <div className="grid gap-3 border-b border-border py-4 last:border-b-0 md:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{s.label}</p>
        <p ref={ref} className={`mt-1 break-words text-ink ${s.className}`}>{s.text}</p>
      </div>
      <div className="space-y-0.5">
        <Meta k="Family">{m.family}</Meta>
        <Meta k="Size / LH">{m.size} / {m.lh}</Meta>
        <Meta k="Weight">{m.weight} {m.style !== "normal" ? `· ${m.style}` : ""}</Meta>
        <Meta k="Tracking">{m.ls}</Meta>
        <Meta k="Font file"><StatusTag status={loaded ? "Loaded" : "Not loaded"} /></Meta>
      </div>
    </div>
  );
}

const ICON_PURPOSE: Record<IconName, string> = {
  create: "Create Content", schedule: "Publish", winners: "Find winners", campaigns: "Launch ads", outreach: "Outreach", learn: "Learn & repeat", research: "Research",
  connections: "Connections", knowledge: "Brand Assets", assets: "Sam’s creations", settings: "Settings", search: "Search", new: "New asset",
  liveView: "Live View", focus: "Focus", pause: "Pause", resume: "Resume", activity: "Activity", warning: "Warning / blocked",
  billing: "Billing", admin: "Super Admin", signOut: "Sign out", check: "Success (neutral)", close: "Close", send: "Send to Sam", team: "Team",
  switchUser: "Switch user (Super Admin)",
};

export function LightModeTab({ tokens, scope }: { tokens: LiveToken[]; scope: HTMLElement | null }) {
  const [tick, setTick] = useState(0);
  const [demoOn, setDemoOn] = useState(true);
  const [demoChecked, setDemoChecked] = useState(true);
  useEffect(() => {
    void document.fonts?.ready.then(() => setTick((x) => x + 1));
    const onResize = () => setTick((x) => x + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [tokens]);

  const byCat = (c: string) => tokens.filter((t) => t.category === c);
  const find = (v: string) => tokens.find((t) => t.cssVar === v);

  const contrast = CONTRAST_PAIRS.map((p) => {
    const fg = find(p.fg)?.rgba, bg = find(p.bg)?.rgba;
    const ratio = fg && bg ? contrastRatio(fg, bg) : null;
    const decorative = p.fg === "--silver";
    const status = ratio == null ? "Unresolved" : ratio >= p.min ? "Pass" : decorative ? "Decorative" : "Fail";
    return { ...p, ratio, status };
  });

  const shadows = SHADOW_TOKENS.map((s) => ({ ...s, value: scope ? getComputedStyle(scope).getPropertyValue(s.cssVar).trim() : "" }));
  const radius = scope ? getComputedStyle(scope).getPropertyValue("--radius").trim() : "";

  const findings = [
    ...tokens.filter((t) => t.status !== "Matches").map((t) => ({ item: t.cssVar, expected: t.approved ?? "Defined", observed: t.hex ?? t.raw ?? "—", status: t.status, source: "src/styles.css" })),
    ...contrast.filter((c) => c.status === "Fail").map((c) => ({ item: c.label, expected: `≥ ${c.min}:1`, observed: `${c.ratio?.toFixed(2)}:1`, status: "Fail", source: "Contrast pair" })),
    ...shadows.filter((s) => s.approved && s.value.replace(/\s+/g, " ") !== s.approved).map((s) => ({ item: s.cssVar, expected: s.approved!, observed: s.value || "Missing", status: s.value ? "Mismatch" : "Missing", source: "src/styles.css" })),
    { item: "Button focus ring", expected: "Carbon outline, white separation", observed: "ring-ring (carbon) with ring-offset-background", status: "Matches", source: "src/components/ui/button.tsx" },
    { item: "Button radius", expected: "10px controls", observed: "rounded-lg = var(--radius) 10px", status: "Matches", source: "src/components/ui/button.tsx" },
  ];

  return (
    <div className="space-y-10 pt-6">
      <Section id="essentials" title="1. Brand essentials and assets" intro="Real logo components and Sam's approved portrait. Full logo set lives in the Logos tab.">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[14px] border border-border bg-canvas p-5">
            <Logo size={28} />
            <p className="mt-3 text-[12px] text-muted-foreground">&lt;Logo /&gt; on ivory</p>
            <div className="mt-4 flex items-end gap-4">
              {[16, 24, 32, 48].map((s) => <BrandMark key={s} size={s} />)}
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">&lt;BrandMark /&gt; at 16 / 24 / 32 / 48px</p>
          </div>
          <div className="rounded-[14px] bg-ink p-5">
            <Logo size={28} reversed />
            <p className="mt-3 text-[12px] text-silver">Carbon navigation within Light Mode</p>
            <ul className="mt-4 space-y-1">
              {(["create", "schedule", "winners"] as const).map((id, i) => (
                <li key={id} className={i === 0 ? "flex h-9 items-center gap-3 rounded-[10px] bg-canvas px-3 text-[13px] font-medium text-ink" : "flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13px] font-medium text-inverse/90"}>
                  <AppIcon name={id} size={16} /> {ICON_PURPOSE[id]}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-4 rounded-[14px] border border-border bg-surface p-5">
            <img src={samPortrait} alt="Sam — AI social growth agent" className="h-28 w-24 rounded-[10px] object-cover" />
            <div>
              <p className="font-display text-[15px] font-bold text-ink">Sam — AI social growth agent</p>
              <p className="mt-1 text-[12px] text-text-secondary">src/assets/sam-portrait.jpg</p>
              <div className="mt-3 flex items-center gap-2">
                {[24, 32, 40].map((s) => <img key={s} src={samPortrait} alt="" className="rounded-full object-cover" style={{ width: s, height: s }} />)}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Avatar crops 24 / 32 / 40px</p>
            </div>
          </div>
        </div>
        <blockquote className="mt-6 rounded-[14px] border border-border bg-canvas p-6 font-display text-[32px] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink">
          Organic content.<br />Paid growth.<br /><span className="font-editorial text-[36px] font-normal italic">On repeat.</span>
        </blockquote>
      </Section>

      <Section id="palette" title="2. Core palette and framework aliases" intro="Every value below is read live from CSS in this page's scope and compared with the approved 1.0.0 baseline.">
        <SwatchGrid items={byCat("core")} />
        <h3 className="mb-3 mt-8 font-display text-[15px] font-bold text-ink">Framework aliases</h3>
        <SwatchGrid items={byCat("alias")} />
        <h3 className="mb-3 mt-8 font-display text-[15px] font-bold text-ink">Legacy names</h3>
        <SwatchGrid items={byCat("legacy")} />
      </Section>

      <Section id="semantic" title="3. Semantic colours and state conventions" intro="Success uses a neutral check icon and explicit text. Information uses neutral ink. There are no green success or blue info colours by design.">
        <SwatchGrid items={byCat("semantic")} />
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusPill><AppIcon name="check" size={12} /> Scheduled</StatusPill>
          <StatusPill tone="positive">Selected by Sam</StatusPill>
          <StatusPill tone="warning">Waiting on approval</StatusPill>
          <StatusPill tone="danger">Publishing failed</StatusPill>
          <UnavailableBadge />
        </div>
        <h3 className="mb-3 mt-8 font-display text-[15px] font-bold text-ink">Contrast checks</h3>
        <div className="overflow-x-auto rounded-[14px] border border-border">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead className="bg-canvas text-[12px] text-muted-foreground"><tr><th className="p-3">Pair</th><th className="p-3">Sample</th><th className="p-3">Ratio</th><th className="p-3">Needs</th><th className="p-3">Status</th></tr></thead>
            <tbody>
              {contrast.map((c) => (
                <tr key={c.label} className="border-t border-border">
                  <td className="p-3 text-ink">{c.label}</td>
                  <td className="p-3"><span className="rounded-[6px] px-2 py-1 text-[13px] font-semibold" style={{ color: `hsl(var(${c.fg}))`, background: `hsl(var(${c.bg}))` }}>Aa</span></td>
                  <td className="p-3 tabular-nums">{c.ratio ? `${c.ratio.toFixed(2)}:1` : "—"}</td>
                  <td className="p-3 tabular-nums">{c.min}:1</td>
                  <td className="p-3"><StatusTag status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="type" title="4. Typography" intro="Computed values from real product classes. Font file status uses the browser font registry, not just the CSS name.">
        <div className="rounded-[14px] border border-border bg-surface px-4">
          {TYPE_SPECIMENS.map((s) => <TypeRow key={s.label} s={s} tick={tick} />)}
        </div>
        <p className="mt-3 text-[12px] text-text-secondary">Instrument Serif is for short editorial phrases only — never forms, chat, tables or navigation. No dedicated H4–H6 product styles exist; that's intentional.</p>
      </Section>

      <Section id="icons" title="5. Icon library" intro="The fixed AppIcon registry (Lucide). Default 18px / 1.75 stroke; 16px compact, 20px toolbar. Icon-only buttons need an accessible label and a 44px touch target.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {(Object.keys(ICONS) as IconName[]).map((n) => (
            <div key={n} className="flex min-w-0 items-center gap-3 rounded-[10px] border border-border bg-surface p-3">
              <AppIcon name={n} size={18} className="text-ink" />
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-ink">{ICON_PURPOSE[n]}</p>
                <p className="truncate text-[11px] text-muted-foreground">{(ICONS[n] as { displayName?: string }).displayName ?? n} · 18 / 1.75</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="effects" title="6. Shadows, radii, spacing and motion" intro="Flat surfaces, restrained separation, occasional soft elevation. Glass / backdrop blur: Not used.">
        <div className="grid gap-4 md:grid-cols-3">
          {shadows.map((s) => (
            <div key={s.cssVar} className="rounded-[14px] bg-surface p-5" style={{ boxShadow: `var(${s.cssVar})` }}>
              <p className="text-[13px] font-semibold text-ink">{s.role}</p>
              <div className="mt-2 space-y-1">
                <Meta k="Utility"><CopyChip value={s.utility} what="utility class" /></Meta>
                <Meta k="Value">{s.value || "Missing"}</Meta>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[14px] border border-border bg-surface p-5">
            <p className="text-[13px] font-semibold text-ink">Radii</p>
            <p className="text-[12px] text-muted-foreground">--radius = {radius || "Missing"}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {[["rounded-sm", "sm"], ["rounded-md", "md"], ["rounded-lg", "lg · controls"], ["rounded-xl", "xl · panels"], ["rounded-full", "full"]].map(([c, l]) => (
                <div key={c} className="text-center"><div className={`h-12 w-12 border border-border-control bg-surface-subtle ${c}`} /><p className="mt-1 text-[11px] text-muted-foreground">{l}</p></div>
              ))}
            </div>
          </div>
          <div className="rounded-[14px] border border-border bg-surface p-5">
            <p className="text-[13px] font-semibold text-ink">Spacing (4px base)</p>
            <div className="mt-3 space-y-1">
              {SPACING_SCALE.map((s) => (
                <div key={s} className="flex items-center gap-3"><span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">{s}</span><span className="h-2 rounded-full bg-ink" style={{ width: s * 2 }} /></div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-4 text-[12px] text-text-secondary">Motion: buttons use 200ms transitions; panes 200–260ms. No motion tokens are registered as CSS variables. Reduced-motion: no global override is defined yet.</p>
      </Section>

      <Section id="components" title="7. Component showcase" intro="Real shared components. Interactions here are local demonstrations only — nothing is saved, sent or published.">
        <TooltipProvider>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-[15px]">Buttons</CardTitle><CardDescription>Tab to see the carbon focus outline.</CardDescription></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button>Default</Button><Button variant="outline">Outline</Button><Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button><Button variant="link">Link</Button><Button variant="destructive">Delete</Button>
                <Button disabled>Disabled</Button><Button disabled><span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> Loading</Button>
                <Tooltip><TooltipTrigger asChild><Button size="icon" variant="outline" aria-label="Search"><AppIcon name="search" /></Button></TooltipTrigger><TooltipContent>Search</TooltipContent></Tooltip>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-[15px]">Badges and status</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge>Default</Badge><Badge variant="secondary">Secondary</Badge><Badge variant="outline">Outline</Badge><Badge variant="destructive">Destructive</Badge>
                <StatusPill tone="positive">Selected by Sam</StatusPill><StatusPill>Draft</StatusPill>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-[15px]">Form controls</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Campaign name" aria-label="Demo input" />
                <Input placeholder="Disabled" disabled aria-label="Demo disabled input" />
                <Input defaultValue="not-an-email" aria-invalid="true" aria-label="Demo error input" className="border-destructive" />
                <p className="text-[12px] text-destructive">Enter a valid email address.</p>
                <Textarea placeholder="Brief Sam…" aria-label="Demo textarea" />
                <Select defaultValue="weekly">
                  <SelectTrigger aria-label="Demo select"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem></SelectContent>
                </Select>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-[14px]"><Switch checked={demoOn} onCheckedChange={setDemoOn} aria-label="Demo switch" /> Autopublish</label>
                  <label className="flex items-center gap-2 text-[14px]"><Checkbox checked={demoChecked} onCheckedChange={(v) => setDemoChecked(!!v)} aria-label="Demo checkbox" /> Include Reels</label>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-[15px]">Tabs, menus and Sam</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Tabs defaultValue="live"><TabsList><TabsTrigger value="live">Live View</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
                  <TabsContent value="live" className="text-[13px] text-text-secondary">Demo tab content.</TabsContent>
                  <TabsContent value="history" className="text-[13px] text-text-secondary">Demo history.</TabsContent>
                </Tabs>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline">Open menu</Button></DropdownMenuTrigger>
                  <DropdownMenuContent><DropdownMenuItem>Duplicate</DropdownMenuItem><DropdownMenuItem>Move to queue</DropdownMenuItem></DropdownMenuContent>
                </DropdownMenu>
                <div className="flex gap-3 rounded-[14px] bg-canvas p-3">
                  <img src={samPortrait} alt="" className="h-8 w-8 rounded-full object-cover" />
                  <div><p className="text-[13px] font-semibold text-ink">Sam</p><p className="text-[15px] text-ink">I've drafted six hooks for this week.</p><p className="mt-1 inline-flex items-center gap-1 text-[12px] text-text-secondary"><AppIcon name="liveView" size={14} /> Showing in Live View</p></div>
                </div>
                <p className="text-[11px] text-muted-foreground">Demo content — not real results.</p>
              </CardContent>
            </Card>
          </div>
        </TooltipProvider>
      </Section>

      <Section id="findings" title="8. Brand consistency findings" intro="Coverage: registered tokens, contrast pairs, shadow tokens and displayed components checked. This does not certify every screen in the app.">
        <div className="overflow-x-auto rounded-[14px] border border-border">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="bg-canvas text-[12px] text-muted-foreground"><tr><th className="p-3">Item</th><th className="p-3">Expected</th><th className="p-3">Observed</th><th className="p-3">Status</th><th className="p-3">Source</th></tr></thead>
            <tbody>
              {findings.map((f, i) => (
                <tr key={`${f.item}-${i}`} className="border-t border-border align-top">
                  <td className="break-all p-3 font-mono text-[12px] text-ink">{f.item}</td>
                  <td className="p-3">{f.expected}</td>
                  <td className="break-all p-3">{f.observed}</td>
                  <td className="p-3"><StatusTag status={f.status} /></td>
                  <td className="p-3 text-[12px] text-muted-foreground">{f.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
