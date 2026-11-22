import { APPROVED_VERSION } from "@/brand/baseline";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LightModeTab } from "./LightModeTab";
import { LogosTab } from "./LogosTab";
import { useLiveTokens } from "./useLiveTokens";

/** Super Admin → Brand Identity. Read-only live reference for the AutoSocials visual system. */
export default function BrandIdentityPage() {
  const { scopeRef, tokens, inspectedAt, refresh } = useLiveTokens();
  const count = (s: string) => tokens.filter((t) => t.status === s).length;

  return (
    <div className="min-w-0 bg-surface">
      <div ref={scopeRef} className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-text-secondary">Super Admin</p>
            <h1 className="mt-1 font-display text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-ink">Brand Identity</h1>
            <p className="mt-1 text-[15px] text-text-secondary">The live reference for AutoSocials' visual system.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
              <span className="rounded-full border border-border-control px-2 py-0.5 font-medium text-ink">Read-only</span>
              <span className="rounded-full border border-border-control px-2 py-0.5 text-text-secondary">Release {APPROVED_VERSION}</span>
              <span className="text-muted-foreground">
                Last inspected {inspectedAt ? inspectedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button variant="outline" onClick={refresh}>Refresh values</Button>
            <p className="text-[12px] tabular-nums text-text-secondary" aria-live="polite">
              {count("Matches")} matching · {count("Mismatch")} mismatched · {count("Missing") + count("Unresolved")} missing/unresolved
            </p>
          </div>
        </header>

        <Tabs defaultValue="light" className="mt-6">
          <TabsList>
            <TabsTrigger value="light">Light Mode</TabsTrigger>
            <TabsTrigger value="logos">Logos</TabsTrigger>
          </TabsList>
          <TabsContent value="light"><LightModeTab tokens={tokens} scope={scopeRef.current} /></TabsContent>
          <TabsContent value="logos"><LogosTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
