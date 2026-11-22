import { useContentCredits } from "@/hooks/useContentCredits";
export function AgentCreditUsage({ workspaceId }: { workspaceId: string }) {
  const credits = useContentCredits(workspaceId);
  return (
    <section className="mt-8 rounded border border-border p-4">
      <h2 className="text-xl font-semibold">Workspace content credits</h2>
      {credits.isLoading ? (
        <p className="mt-2">Loading credit balance…</p>
      ) : credits.isError ? (
        <p className="mt-2" role="alert">
          Credit information is temporarily unavailable.
        </p>
      ) : !credits.data ? (
        <p className="mt-2">No active credit period is available.</p>
      ) : credits.data.unlimited ? (
        <p className="mt-2">Unlimited content credits.</p>
      ) : (
        <>
          <p className="mt-2">
            {credits.data.available.toLocaleString("en-GB")} of{" "}
            {credits.data.granted.toLocaleString("en-GB")} credits available.
          </p>
          <p className="mt-1 text-sm">
            Resets {new Date(credits.data.endsAt).toLocaleDateString("en-GB")}.
            Reserved credits remain unavailable until production is resolved.
          </p>
          {credits.data.available === 0 ? (
            <p role="status" className="mt-2 font-medium">
              No content credits remain in this period.
            </p>
          ) : credits.data.granted > 0 &&
            credits.data.available / credits.data.granted <= 0.2 ? (
            <p role="status" className="mt-2 font-medium">
              20% or less of this period’s content credits remain.
            </p>
          ) : null}
        </>
      )}
      <a href="/app/billing" className="mt-3 inline-block text-sm underline">
        View billing and credit activity
      </a>
    </section>
  );
}
