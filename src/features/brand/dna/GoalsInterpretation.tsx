import type { ProfileGoals } from "@/lib/profile-dna";

export function GoalsInterpretation({ goals, evidence, scope }: { goals: ProfileGoals; evidence: string; scope: "personal" | "company" }) {
  const fields = [
    { title: "What the content could be known for", value: goals.knownFor },
    { title: "Who it could reach", value: goals.audience },
    { title: "Suggested outcome", value: goals.goal },
  ];
  return <section className="rounded-2xl border border-border bg-card p-6 sm:p-8" aria-label={`${scope === "personal" ? "Personal" : "Company"} goals interpretation`}>
    <h2 className="font-display text-xl font-bold">Our Interpretation</h2>
    <p className="mt-2 text-sm text-muted-foreground">{evidence} Sam uses this as a starting point. Any goals you provide take priority.</p>
    <dl className="mt-5 grid gap-3 sm:grid-cols-3">
      {fields.map(({ title, value }) => <div key={title} className="rounded-xl bg-surface-subtle p-4">
        <dt className="text-sm font-semibold">{title}</dt>
        <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{value || "Awaiting enough evidence to suggest this."}</dd>
      </div>)}
    </dl>
  </section>;
}
