import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, ArrowRight, Check, Circle, Globe2, Image as ImageIcon, Lightbulb, Loader2, Share2, Sparkles, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SocialChannelIcon } from "@/components/agency/SocialChannelIcon";
import type { ClientSocialProfile } from "@/lib/client-social-profiles";
import { getAgencyClientDiscoveryProgress } from "@/lib/agency-client-discovery.functions";

export type NewAgencyClient = { workspaceId: string; clientName: string; website: string | null; socialProfiles: ClientSocialProfile[]; isOwnBrand?: boolean; isPersonal?: boolean };

type AgencyClientWelcomeSheetProps = {
  client: NewAgencyClient | null;
  onOpenChange: (open: boolean) => void;
};

const stages = ["Intro", "Ingestion", "Suggestions"];

export function AgencyClientWelcomeSheet({ client, onOpenChange }: AgencyClientWelcomeSheetProps) {
  const getProgress = useServerFn(getAgencyClientDiscoveryProgress);
  const progress = useQuery({
    queryKey: ["agency-client-discovery-progress", client?.workspaceId],
    enabled: !!client,
    queryFn: () => getProgress({ data: { workspace_id: client!.workspaceId } }),
    refetchInterval: (query) => ["queued", "running"].includes(query.state.data?.status ?? "") ? 3000 : false,
  });
  const hasSources = !!client?.website || !!client?.socialProfiles.length;
  const status = progress.data?.status ?? (progress.isError ? "needs_attention" : hasSources ? "queued" : "not_started");
  const stageActive = status === "queued" || status === "running";
  const steps = progress.data?.steps;
  const hasFinishedBrandStep = steps?.brand === "complete" || status === "needs_attention";
  const brandSummary = hasFinishedBrandStep ? progress.data?.brandSummary : null;
  const suggestionsActive = !!brandSummary && (status === "complete" || status === "needs_attention");
  const discoverySteps = [
    ...(!client?.isPersonal ? [{ key: "website" as const, label: "Read the website", detail: client?.website || "No website supplied", icon: Globe2 }] : []),
    { key: "social", label: "Review public social profiles", detail: client?.socialProfiles.length ? `${client.socialProfiles.length} profile${client.socialProfiles.length === 1 ? "" : "s"} supplied` : "No profiles supplied", icon: Share2 },
    { key: "brand", label: "Build a brand picture", detail: "Bring the available signals together", icon: Sparkles },
  ] as const;
  const statusLabel = (value: string) => value === "complete" ? "Reviewed" : value === "running" ? "In progress" : value === "queued" ? "Up next" : value === "needs_attention" ? "Needs attention" : "Skipped";
  const statusIcon = (value: string) => value === "complete" ? <Check className="h-4 w-4" /> : value === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : value === "needs_attention" ? <AlertCircle className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />;
  const statusStyle = (value: string) => value === "complete" ? "border-success/25 bg-success/10 text-success" : value === "running" ? "border-primary/25 bg-primary/10 text-primary" : value === "needs_attention" ? "border-warning/30 bg-warning-surface text-warning" : "border-border bg-background text-muted-foreground";

  return (
    <Sheet open={!!client} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-border bg-background p-0 sm:max-w-xl">
        {client && (
          <div className="flex min-h-full flex-col">
            <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/15 via-background to-background px-7 pb-8 pt-10 sm:px-10">
              <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
              <SheetHeader className="relative space-y-4 text-left">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{client.isOwnBrand ? "Your brand, a fresh start" : "A new client, a fresh start"}</p>
                  <SheetTitle className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Let’s get to know {client.clientName}.</SheetTitle>
                  <SheetDescription className="mt-3 max-w-md text-base leading-relaxed">
                    {client.isPersonal ? "I’m Sam. I’ll review the public profiles you shared and help you understand how you come across online." : "I’m Sam. I’ll review the business details and public channels you shared, then help you shape a clear picture of this brand."}
                  </SheetDescription>
                </div>
              </SheetHeader>

              <div className="relative mt-8 grid grid-cols-3 gap-2" aria-label="Brand onboarding stages">
                {stages.map((stage, index) => (
                  <div key={stage} className="space-y-2">
                    <div className={`h-1 rounded-full ${index === 0 || (index === 1 && (stageActive || suggestionsActive)) || (index === 2 && suggestionsActive) ? "bg-primary" : "bg-border"}`} />
                    <span className={`text-xs font-medium ${index === 0 || (index === 1 && stageActive) || (index === 2 && suggestionsActive) ? "text-foreground" : "text-muted-foreground"}`}>{stage}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-7 px-7 py-8 sm:px-10">
              <section>
                <h3 className="text-sm font-semibold text-foreground">Here’s what we’ll look at</h3>
                <p className="mt-1 text-sm text-muted-foreground">{status === "complete" ? "The first brand review is complete." : status === "needs_attention" ? "The review finished with a source that needs attention." : status === "not_started" ? "Add a public profile to start the review." : "Your brand review is underway. Here are the sources I’m checking."}</p>
                <div className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5" role="status" aria-live="polite">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Sam’s brand review</p>
                      <p className="mt-1 text-xs text-muted-foreground">{status === "running" ? "Working through the available sources…" : status === "queued" ? "Getting the review ready…" : status === "complete" ? "The available sources have been reviewed." : status === "needs_attention" ? "Some sources could not be fully reviewed." : "No discovery sources were added."}</p>
                    </div>
                    {(status === "queued" || status === "running") && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                  </div>
                  <div className="mt-5 space-y-3">
                    {discoverySteps.map((step, index) => {
                      const value = steps?.[step.key] ?? (client?.website || client?.socialProfiles.length ? "queued" : "not_requested");
                      const Icon = step.icon;
                      return (
                        <div key={step.key} className="relative flex gap-3">
                          {index < discoverySteps.length - 1 && <span aria-hidden="true" className="absolute left-[17px] top-9 h-7 w-px bg-border" />}
                          <span className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${statusStyle(value)}`}>{statusIcon(value)}</span>
                          <div className="min-w-0 flex-1 pb-1">
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                              <p className="text-sm font-medium text-foreground"><Icon className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" />{step.label}</p>
                              <span className="text-[11px] font-medium text-muted-foreground">{statusLabel(value)}</span>
                            </div>
                            <p className="mt-0.5 break-all text-xs text-muted-foreground">{step.detail}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {progress.isError && <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3"><p className="text-xs text-destructive">Couldn’t refresh progress.</p><Button variant="outline" size="sm" onClick={() => void progress.refetch()}>Try again</Button></div>}
                </div>
                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground"><Globe2 className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">Website and brand</p>
                      <p className="mt-0.5 break-all text-xs text-muted-foreground">{client.website || "No website added yet"}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground"><Share2 className="h-4 w-4" /></span>
                      <div className="flex-1"><p className="text-sm font-medium text-foreground">Social profiles</p><p className="mt-0.5 text-xs text-muted-foreground">{client.isOwnBrand ? "Public profiles supplied for your brand" : "Public profiles supplied for this client"}</p></div>
                    </div>
                    {client.socialProfiles.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {client.socialProfiles.map((profile) => (
                          <span key={`${profile.platform}:${profile.handle}`} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground">
                            <SocialChannelIcon platform={profile.platform} className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{profile.url || `@${profile.handle}`}</span>
                          </span>
                        ))}
                      </div>
                    ) : <p className="mt-3 text-xs text-muted-foreground">No social profiles added yet</p>}
                  </div>
                </div>
              </section>

              {brandSummary && (
                <section aria-label="Sam’s brand understanding" className="overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="border-b border-border bg-gradient-to-r from-primary/10 via-background to-background p-5 sm:p-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Sam’s first read</p>
                    <h3 className="mt-2 font-display text-xl font-bold text-foreground">Here’s how I understand {brandSummary.name}</h3>
                    {brandSummary.whatItIs && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{brandSummary.whatItIs}</p>}
                    {client.socialProfiles.length > 0 && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">I found {client.socialProfiles.map((profile) => profile.platform === "x" ? "X" : profile.platform[0].toUpperCase() + profile.platform.slice(1)).filter((platform, index, all) => all.indexOf(platform) === index).join(", ")} profile links. I used public information where it was available.</p>}
                  </div>

                  {(brandSummary.audience || brandSummary.tone) && (
                    <div className="grid gap-3 border-b border-border p-5 sm:grid-cols-2 sm:p-6">
                      {brandSummary.audience && <div className="rounded-xl border border-border bg-background p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Audience</p><p className="mt-2 text-sm leading-relaxed text-foreground">{brandSummary.audience}</p></div>}
                      {brandSummary.tone && <div className="rounded-xl border border-border bg-background p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Brand voice</p><p className="mt-2 text-sm leading-relaxed text-foreground">{brandSummary.tone}</p></div>}
                    </div>
                  )}

                  <div className="p-5 sm:p-6">
                    <h4 className="text-sm font-semibold text-foreground">Themes I noticed</h4>
                    {brandSummary.themes.length ? (
                      <ul className="mt-3 space-y-3">
                        {brandSummary.themes.map((theme, index) => (
                          <li key={`${theme.title}-${index}`} className="flex gap-3 rounded-xl border border-border bg-background p-4">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                            <div><p className="text-sm font-medium text-foreground">{theme.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{theme.evidence}</p></div>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 text-sm leading-relaxed text-muted-foreground">I don’t have enough repeated evidence to call out recurring themes yet. I’ll keep this read grounded as more brand material becomes available.</p>}

                    <div className="mt-6 border-t border-border pt-5">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Lightbulb className="h-4 w-4 text-primary" />A few ideas to consider</h4>
                      {brandSummary.suggestions.length ? (
                        <div className="mt-3 grid gap-3">
                          {brandSummary.suggestions.map((suggestion, index) => {
                            const FormatIcon = suggestion.format === "image" ? ImageIcon : Video;
                            return <div key={`${suggestion.title}-${index}`} className="flex gap-3 rounded-xl border border-border bg-background p-4">
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground"><FormatIcon className="h-4 w-4" /></span>
                              <div><p className="text-sm font-medium text-foreground">{suggestion.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{suggestion.why}</p></div>
                            </div>;
                          })}
                        </div>
                      ) : <p className="mt-2 text-sm text-muted-foreground">Sam doesn’t have a grounded content idea to suggest yet.</p>}
                    </div>
                    <p className="mt-5 text-xs leading-relaxed text-muted-foreground">This is a first read based on the material reviewed. Tell me what I’ve misunderstood and I’ll adjust it.</p>
                  </div>
                </section>
              )}

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm leading-relaxed text-foreground"><span className="font-semibold">{stageActive ? "I’m on it." : suggestionsActive ? "That’s my first read." : status === "complete" ? "The first review is done." : "Review status."}</span> {stageActive ? "I’m gathering context from the sources listed above. I’ll use the available evidence to shape a grounded brand read." : suggestionsActive ? "These themes and ideas are a starting point. You can correct anything I’ve misunderstood before we create." : status === "complete" ? "I’ve reviewed the available sources. I don’t have a saved brand summary to show yet." : status === "needs_attention" ? "Some source material may be unavailable. The completed and skipped steps above show what was reviewed." : client.isPersonal ? "Add a social profile to give Sam a place to start." : "Add a website or social profile to give Sam a place to start."}</p>
              </div>
            </div>

            <div className="sticky bottom-0 border-t border-border bg-background/95 px-7 py-5 backdrop-blur sm:px-10">
              <Button className="w-full" onClick={() => onOpenChange(false)}>
                Got it <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
