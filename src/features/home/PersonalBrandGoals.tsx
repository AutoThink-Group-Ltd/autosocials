import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, FileText, MessageSquare, Sparkles, Upload } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { formatPersonalGoalsBrief, getPersonalBrandGoals, savePersonalBrandGoals } from "@/lib/personal-brand.functions";
import { GOALS_BRIEF_LIMIT, goalsBriefSchema, type GuidedGoals, type PersonalGoalsUpdate } from "@/lib/personal-brand-goals";
import { getProfileDna } from "@/lib/profile-dna.functions";
import { profileGoalInterpretation } from "@/lib/profile-dna";
import { GoalsInterpretation } from "@/features/brand/dna/GoalsInterpretation";

const questions = [
  { field: "knownFor", label: "What do you want to be known for?" },
  { field: "audience", label: "Who do you want to reach?" },
  { field: "goal", label: "What is your main goal?" },
] as const;
const options = [
  { id: "interview", title: "Complete Interview", description: "Answer some quick-fire questions to help develop Sam’s knowledge base of your goals and the outcomes you wish to achieve.", Icon: MessageSquare },
  { id: "brief", title: "Drop your prompt", description: "Copy and paste your own prompt from elsewhere or upload a Markdown (.md) file.", Icon: FileText },
  { id: "interpretation", title: "Our Interpretation", description: "See the goals Sam suggests from your public LinkedIn profile and available posts.", Icon: Sparkles },
] as const;
type Mode = (typeof options)[number]["id"];

export function PersonalBrandGoals({ workspaceId, profileUrl }: { workspaceId: string; profileUrl?: string | null }) {
  const getGoals = useServerFn(getPersonalBrandGoals);
  const saveGoals = useServerFn(savePersonalBrandGoals);
  const organize = useServerFn(formatPersonalGoalsBrief);
  const readDna = useServerFn(getProfileDna);
  const queryClient = useQueryClient();
  const queryKey = ["personal-brand-goals", workspaceId] as const;
  const query = useQuery({ queryKey, queryFn: () => getGoals({ data: { workspace_id: workspaceId } }) });
  const [mode, setMode] = useState<Mode | null>(profileUrl ? "interpretation" : null);
  const profile = useQuery({
    queryKey: ["profile-dna", workspaceId, profileUrl], enabled: !!profileUrl && mode === "interpretation",
    queryFn: () => readDna({ data: { workspaceId } }),
    refetchInterval: ({ state }) => !state.error && state.dataUpdateCount < 60 && (state.data?.status === "running" || state.data?.status === "pending") ? 5000 : false,
  });
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<GuidedGoals | null>(null);
  const [briefDraft, setBriefDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const answerInput = useRef<HTMLTextAreaElement>(null);

  const save = useMutation({
    mutationFn: (update: PersonalGoalsUpdate) => saveGoals({ data: { workspace_id: workspaceId, ...update } }),
    onSuccess: ({ goals }, update) => {
      queryClient.setQueryData(queryKey, { ...goals, canEdit: query.data?.canEdit });
      if ("brief" in update) { setBriefDraft(null); setPreview(false); }
      else setAnswers(null);
      void queryClient.invalidateQueries({ queryKey: ["personal-content-ideas", workspaceId] });
    },
  });
  const format = useMutation({
    mutationFn: async (input: string | File) => {
      let text = input;
      if (typeof text !== "string") {
        if (!/\.(md|markdown)$/i.test(text.name)) throw new Error("Choose a Markdown (.md) file.");
        if (text.size > GOALS_BRIEF_LIMIT * 4) throw new Error("That file is too large for a goals brief.");
        text = await text.text();
      }
      const checked = goalsBriefSchema.safeParse(text);
      if (!checked.success || !checked.data) throw new Error(`Use a text brief of 1 to ${GOALS_BRIEF_LIMIT.toLocaleString("en-GB")} characters.`);
      setBriefDraft(checked.data);
      setPreview(false);
      try { return await organize({ data: { workspace_id: workspaceId, brief: checked.data } }); }
      catch { throw new Error("Sam couldn’t organize the brief. Try again or preview it as entered."); }
    },
    onSuccess: ({ brief }) => { setBriefDraft(brief); setPreview(true); },
  });
  useEffect(() => { if (mode === "interview") answerInput.current?.focus(); }, [mode, step, query.isSuccess]);

  const saved = query.data;
  const brief = briefDraft ?? saved?.brief ?? "";
  const briefTooLong = brief.trim().length > GOALS_BRIEF_LIMIT;
  const viewingSaved = briefDraft === null && !!saved?.brief;
  const busy = save.isPending || format.isPending;
  const question = questions[step]!;
  const guided = answers ?? { knownFor: saved?.knownFor ?? "", audience: saved?.audience ?? "", goal: saved?.goal ?? "" };
  const atEnd = step === questions.length - 1;
  const dna = profile.data?.dna;

  return <section className="space-y-4" aria-label="Personal goals">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {options.map(({ id, title, description, Icon }) => <button key={id} type="button" aria-pressed={mode === id}
        aria-controls={`personal-goals-${id}`} disabled={busy} onClick={() => { save.reset(); format.reset(); setMode(mode === id ? null : id); }}
        className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition hover:border-primary/50 aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className={`relative flex h-24 items-center justify-center overflow-hidden ${id === "interview" ? "bg-ink text-inverse" : "bg-surface-subtle text-foreground"}`} aria-hidden>
          <span className="absolute size-32 rounded-full border border-current opacity-15" />
          <span className="absolute size-48 rounded-full border border-current opacity-10" />
          <span className="relative grid size-12 place-items-center rounded-xl border border-current/25 shadow-sm transition-transform group-hover:-translate-y-0.5"><Icon className="size-6" /></span>
        </span>
        <span className="flex flex-1 items-start justify-between gap-3 p-5"><span><span className="block font-display text-lg font-bold">{title}</span><span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{description}</span></span><ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden /></span>
      </button>)}
    </div>
    {mode === "interpretation" && <div id="personal-goals-interpretation">
      {dna ? <GoalsInterpretation scope="personal" goals={profileGoalInterpretation(dna)}
        evidence={dna.postCount ? `Based on ${dna.postCount} authored LinkedIn ${dna.postCount === 1 ? "post" : "posts"}${dna.profileRead ? " and the public profile" : ""}.`
          : dna.profileRead || dna.role || dna.employer ? "Based on the available profile details. No authored posts were available for review." : "Sam couldn’t verify profile details or authored posts. The starting point is provisional."} />
        : <p role={profile.isError ? "alert" : "status"} className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {!profileUrl ? "Add a personal LinkedIn profile to this workspace to see Sam’s suggested goals."
            : profile.isError || profile.data?.status === "failed" ? "Sam couldn’t build the interpretation. Open Profile DNA to refresh the evidence."
            : "Sam’s interpretation will appear after the LinkedIn profile has been reviewed."}
        </p>}
    </div>}
    {(mode === "interview" || mode === "brief") && query.isPending && <p role="status" className="text-sm text-muted-foreground">Loading goals…</p>}
    {(mode === "interview" || mode === "brief") && query.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load goals.</p>}
    {mode === "interview" && saved && <div id="personal-goals-interview" className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center justify-between gap-4"><span className="text-sm font-medium text-muted-foreground">Question {step + 1} of {questions.length}</span><span className="text-xs text-muted-foreground">Optional</span></div>
        <progress aria-label="Interview progress" value={step + 1} max={questions.length} className="block h-1 w-full overflow-hidden rounded-full accent-primary" />
        <label className="block font-display text-2xl font-bold" htmlFor="personal-goals-answer">{question.label}</label>
        <textarea id="personal-goals-answer" key={question.field} ref={answerInput} value={guided[question.field]} maxLength={1000} rows={3}
          readOnly={!saved.canEdit} disabled={busy} placeholder={saved.canEdit ? "Type your answer…" : undefined}
          onChange={(event) => setAnswers({ ...guided, [question.field]: event.target.value })}
          className="w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-base leading-relaxed" />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" disabled={busy || step === 0} onClick={() => setStep(step - 1)}><ArrowLeft className="size-4" />Back</Button>
          {!atEnd && <Button type="button" variant="ghost" disabled={busy} onClick={() => setStep(step + 1)}>{guided[question.field].trim() ? "Next" : "Skip"}<ArrowRight className="size-4" /></Button>}
          {saved.canEdit && <Button type="button" className="ml-auto" disabled={busy} onClick={() => save.mutate(guided)}>{save.isPending ? "Saving…" : "Save answers"}</Button>}
        </div>
        {save.isSuccess && <p role="status" className="text-sm">Answers saved.</p>}
      </div>
    </div>}
    {mode === "brief" && saved && <div id="personal-goals-brief" className="space-y-4 rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-display text-xl font-bold">Goals brief</h2><p className="mt-1 text-sm text-muted-foreground">Sam uses your saved brief to guide future personal content.</p></div>
        {saved.canEdit && (preview || viewingSaved) && <Button type="button" variant="outline" disabled={busy} onClick={() => { setBriefDraft(brief); setPreview(false); }}>Edit brief</Button>}
      </div>
      {preview || viewingSaved ? <div className="prose-sm max-w-none break-words rounded-xl border border-border bg-background p-5 leading-relaxed [&_h1]:my-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-auto [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={["img", "input"]}>{brief}</ReactMarkdown>
      </div> : saved.canEdit ? <>
        <input ref={fileInput} type="file" accept=".md,.markdown,text/markdown" className="hidden" aria-label="Upload Markdown file" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) format.mutate(file); }} />
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file && !busy) format.mutate(file); }}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-sm font-medium transition-colors hover:bg-surface-subtle ${dragging ? "border-primary bg-surface-subtle" : "border-input"}`}>
          <Upload className="size-4" aria-hidden />Drop a Markdown file here or choose a file
        </button>
        <label className="block text-sm font-medium" htmlFor="personal-goals-prompt">Paste your prompt</label>
        <textarea id="personal-goals-prompt" rows={8} value={brief} disabled={busy}
          onChange={(event) => { format.reset(); setBriefDraft(event.target.value); }}
          className="w-full resize-y rounded-xl border border-input bg-background p-4 text-sm leading-relaxed" />
      </> : <p className="text-sm text-muted-foreground">No goals brief has been saved.</p>}
      {briefTooLong && <p role="alert" className="text-sm text-destructive">Shorten your brief to {GOALS_BRIEF_LIMIT.toLocaleString("en-GB")} characters.</p>}
      {format.isError && !preview && <p role="alert" className="text-sm text-destructive">{format.error.message}</p>}
      {saved.canEdit && !viewingSaved && <div className="flex flex-wrap items-center justify-end gap-2">
        {format.isError && !preview && !briefTooLong && !!brief.trim() && <Button type="button" variant="ghost" disabled={busy} onClick={() => setPreview(true)}>Preview as entered</Button>}
        {preview || (!brief.trim() && !!saved.brief) ? <Button type="button" disabled={busy} onClick={() => save.mutate({ brief })}>{save.isPending ? "Saving…" : brief.trim() ? "Save brief" : "Clear brief"}</Button> :
          <Button type="button" disabled={busy || briefTooLong || !brief.trim()} onClick={() => format.mutate(brief)}>{format.isPending ? "Organizing…" : "Organize and preview"}</Button>}
      </div>}
      {save.isSuccess && <p role="status" className="text-sm">{saved.brief ? "Brief saved." : "Brief cleared."}</p>}
    </div>}
    {save.isError && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
  </section>;
}
