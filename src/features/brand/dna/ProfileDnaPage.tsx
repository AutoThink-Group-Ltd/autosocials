import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat";
import { getProfileDna, refreshProfileDna } from "@/lib/profile-dna.functions";
import { personalLinkedIn, profilePalettes } from "@/lib/profile-dna";
import { PersonalBrandGoals } from "@/features/home/PersonalBrandGoals";

export function ProfileDnaPage() {
  const { currentWorkspace } = useWorkspace();
  const profile = personalLinkedIn(currentWorkspace?.social_profiles);
  if (!profile || !currentWorkspace) return <p className="p-6">Add a personal LinkedIn URL to view Profile DNA.</p>;
  return <ProfileDna key={currentWorkspace.id + profile} workspaceId={currentWorkspace.id} source={profile} hasCompany={!!currentWorkspace.website} />;
}

function ProfileDna({ workspaceId, source, hasCompany }: { workspaceId: string; source: string; hasCompany: boolean }) {
  const read = useServerFn(getProfileDna);
  const refresh = useServerFn(refreshProfileDna);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["profile-dna", workspaceId, source],
    queryFn: () => read({ data: { workspaceId } }),
    refetchInterval: ({ state }) => !state.error && state.dataUpdateCount < 60 && (state.data?.status === "running" || state.data?.status === "pending") ? 5000 : false,
  });
  const dna = query.data?.dna;

  async function requestRefresh() {
    setRefreshing(true);
    setError("");
    try {
      await refresh({ data: { workspaceId } });
      await query.refetch();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not refresh Profile DNA."); }
    finally { setRefreshing(false); }
  }

  return <main className="h-full overflow-y-auto bg-canvas">
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-8">
      <header className="space-y-3">
        <h1 className="font-display text-4xl font-extrabold">Profile DNA</h1>
        <p className="max-w-2xl text-muted-foreground">Public LinkedIn evidence and a proposed content direction for {dna?.name ?? "this profile"}.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><a href={source} target="_blank" rel="noreferrer">View LinkedIn profile</a></Button>
          {hasCompany && <Button variant="outline" asChild><Link to="/app/brand-dna">Company Brand DNA</Link></Button>}
          <Button variant="outline" disabled={refreshing || query.data?.status === "running"} onClick={() => void requestRefresh()}>{refreshing ? "Requesting refresh…" : "Refresh profile evidence"}</Button>
        </div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </header>
      {query.isError ? <Button variant="outline" onClick={() => void query.refetch()}>Retry loading Profile DNA</Button> :
        !dna ? <p role="status" className="rounded-xl border p-5">{query.data?.status === "failed" ? "Profile DNA could not be built. Refresh profile evidence to try again." : "Sam is checking public LinkedIn evidence. You can keep working while it runs."}</p> : <>
          <section aria-labelledby="profile-evidence" className="space-y-4 rounded-2xl border bg-card p-5">
            <h2 id="profile-evidence" className="font-display text-2xl font-bold">LinkedIn evidence</h2>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div><dt className="text-sm text-muted-foreground">Role</dt><dd className="font-semibold">{dna.role ?? "Not verified"}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Employer</dt><dd className="font-semibold">{dna.employer ?? "Not verified"}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Recent authored posts reviewed</dt><dd className="font-semibold">{dna.postCount}</dd></div>
            </dl>
            {dna.topics.length ? <ul className="flex flex-wrap gap-2" aria-label="Observed topics">{dna.topics.map(({ topic, url }, index) =>
              <li key={index}><a href={url} target="_blank" rel="noreferrer" className="block rounded-full border px-3 py-1.5 underline underline-offset-2">{topic}</a></li>)}</ul> :
              <p className="text-sm text-muted-foreground">There weren’t enough public posts to establish themes. The direction below is a starting proposal.</p>}
          </section>
          <div className="text-sm leading-relaxed"><strong>Suggested voice</strong> {dna.voice}</div>
        </>}
        <section aria-labelledby="profile-goals" className="space-y-4">
          <h2 id="profile-goals" className="font-display text-2xl font-bold">Personal goals</h2>
          <PersonalBrandGoals workspaceId={workspaceId} profileUrl={source} />
        </section>
        {dna && <>
          <section aria-labelledby="profile-action" className="space-y-4">
            <h2 id="profile-action" className="font-display text-2xl font-bold">In action</h2>
            <p className="text-muted-foreground">Three concept tiles using a proposed {profilePalettes[dna.palette].name.toLowerCase()} palette and bold typography for this person’s LinkedIn content.</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{dna.tiles.map((tile, index) => {
              const palette = profilePalettes[dna.palette];
              return <article key={index} style={{ backgroundColor: palette.background, color: palette.ink }}
                className="relative isolate flex aspect-square flex-col justify-between overflow-hidden rounded-2xl p-[7%]">
                <span aria-hidden="true" style={{ borderColor: palette.accent }} className="pointer-events-none absolute -right-1/4 -top-1/4 -z-10 size-2/3 rotate-12 rounded-[35%] border-[18px] opacity-25 motion-safe:transition-transform motion-safe:duration-700 motion-safe:hover:rotate-45" />
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: palette.accent }}>{dna.name}</p>
                <div className="space-y-3">
                  <h3 className="break-words font-display text-3xl font-extrabold leading-tight tracking-tight">{tile.headline}</h3>
                  <p className="break-words leading-snug">{tile.supporting}</p>
                </div>
                <span aria-hidden="true" style={{ backgroundColor: palette.accent }} className="h-1.5 w-12 rounded-full" />
              </article>;
            })}</div>
            <p className="text-sm text-muted-foreground">In Create, ask Sam to make a post for this person’s LinkedIn profile using their Profile DNA.</p>
            <Button asChild><Link to="/app/create">Open Create</Link></Button>
          </section>
        </>}
    </div>
  </main>;
}
