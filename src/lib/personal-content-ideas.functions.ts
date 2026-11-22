import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import prompt from "../../prompts/personal-content-ideas.txt?raw";
import { validatePersonalBrandReport } from "./personal-brand-report";
import { hasPersonalGoals, parsePersonalGoals, PERSONAL_GOALS_TITLE } from "./personal-brand-goals";
import { personalContentResearch } from "./personal-content-research.server";

const ideaSchema = z.object({ title: z.string().trim().min(1).max(100), angle: z.string().trim().min(1).max(240) });
const feedbackSchema = ideaSchema.extend({ trashed: z.boolean() });

// The database API limits a response to one page. Read every page so older
// rejected and restored ideas don't silently disappear from the user's history.
async function readIdeaFeedback(admin: any, workspaceId: string) {
  const decisions: z.infer<typeof feedbackSchema>[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await admin.from("brand_work_operations").select("result").eq("workspace_id", workspaceId).eq("kind", "personal-idea-feedback").order("updated_at", { ascending: false }).order("signature", { ascending: true }).range(offset, offset + pageSize - 1);
    if (page.error) throw new Error("Could not load idea feedback.");
    for (const row of page.data ?? []) { const parsed = feedbackSchema.safeParse(row.result); if (parsed.success) decisions.push(parsed.data); }
    if ((page.data?.length ?? 0) < pageSize) return decisions;
  }
}

const loadIdeas = createServerOnlyFn(async (workspaceId: string) => {
  const { getAdminClient, requireUser } = await import("./supabase-admin.server");
  const user = await requireUser();
  const admin = getAdminClient();
  const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: workspaceId });
  if (access.error || !access.data) throw new Error("Workspace access required.");
  const kind = await admin.from("agency_clients").select("id").eq("workspace_id", workspaceId).eq("workspace_kind", "personal").eq("status", "active").limit(1);
  if (kind.error || !kind.data?.length) throw new Error("Personal workspace required.");
  const [goals, saved, feedback] = await Promise.all([
    admin.from("dossier_documents").select("content").eq("workspace_id", workspaceId).eq("source", "paste").eq("title", PERSONAL_GOALS_TITLE).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    (admin as any).from("brand_work_operations").select("result").eq("workspace_id", workspaceId).eq("kind", "personal-brand-report").eq("signature", "v1").maybeSingle(),
    readIdeaFeedback(admin, workspaceId),
  ]);
  if (goals.error || saved.error) throw new Error("Could not load your brand context.");
  const direction = parsePersonalGoals(goals.data?.content);
  let review: unknown = null;
  try { const r = validatePersonalBrandReport(saved.data?.result); review = { impression: r.impression, themes: r.themes, strengths: r.strengths, channels: r.channels, evidence: r.evidence.slice(0, 30).map(e => ({ id: e.id, platform: e.platform, date: e.date, caption: e.caption.slice(0, 500), attribution: e.attribution, basis: e.basis })) }; } catch { /* A review is optional. */ }
  const decisions = feedback;
  const rejected = decisions.filter((item: z.infer<typeof feedbackSchema>) => item.trashed).map(({ title, angle }: z.infer<typeof feedbackSchema>) => ({ title, angle }));
  const restored = decisions.filter((item: z.infer<typeof feedbackSchema>) => !item.trashed).map(({ title, angle }: z.infer<typeof feedbackSchema>) => ({ title, angle }));
  if (!review && !hasPersonalGoals(direction)) return { ideas: restored, needsContext: !restored.length };
  const { aiChat } = await import("./dossier.server");
  const research = await personalContentResearch(admin, workspaceId, direction.brief);
  const response = await aiChat({ model: "gpt-6.1-terra", response_format: { type: "json_object" }, messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify({ goals: direction, review, research, previousIdeas: restored.slice(0, 100), rejectedIdeas: rejected.slice(0, 100) }) }] });
  try { const result = z.object({ ideas: z.array(ideaSchema).min(1).max(6) }).parse(JSON.parse(response.choices?.[0]?.message?.content ?? "")); const ideas = [...restored, ...result.ideas].filter(item => !rejected.some(old => old.title.toLocaleLowerCase() === item.title.toLocaleLowerCase())); return { ideas: [...new Map(ideas.map(item => [item.title.toLocaleLowerCase(), item])).values()], needsContext: false }; }
  catch { throw new Error("Sam couldn't prepare the ideas. Please try again."); }
});
export const getPersonalContentIdeas = createServerFn({ method: "POST" }).inputValidator((value: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(value)).handler(({ data }) => loadIdeas(data.workspace_id));

const feedbackInput = z.object({ workspace_id: z.string().uuid(), idea: ideaSchema, trashed: z.boolean() });
const manageFeedback = createServerOnlyFn(async (data: z.infer<typeof feedbackInput>) => {
  const { personalBrandContext } = await import("./personal-brand.functions");
  const { admin, canEdit } = await personalBrandContext(data.workspace_id);
  if (!canEdit) throw new Error("Only workspace managers can change ideas.");
  const { createHash } = await import("node:crypto");
  const key = createHash("sha256").update(data.idea.title.trim().toLocaleLowerCase()).digest("hex");
  const saved = await (admin as any).from("brand_work_operations").upsert({ workspace_id: data.workspace_id, kind: "personal-idea-feedback", signature: key, token: crypto.randomUUID(), status: "complete", result: { ...data.idea, trashed: data.trashed }, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,kind,signature" }).select("signature").maybeSingle();
  if (saved.error || !saved.data) throw new Error("Could not save idea feedback.");
  return { saved: true };
});
export const setPersonalIdeaTrash = createServerFn({ method: "POST" }).inputValidator((input: unknown) => feedbackInput.parse(input)).handler(({ data }) => manageFeedback(data));
export const getPersonalIdeaTrash = createServerFn({ method: "POST" }).inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(input)).handler(async ({ data }) => {
  const { personalBrandContext } = await import("./personal-brand.functions");
  const { admin, canEdit } = await personalBrandContext(data.workspace_id);
  const decisions = await readIdeaFeedback(admin, data.workspace_id);
  return { canEdit, ideas: decisions.filter(value => value.trashed).map(({ title, angle }) => ({ title, angle })) };
});
