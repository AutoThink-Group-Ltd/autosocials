import { validatePersonalBrandReport } from "./personal-brand-report";
import { PERSONAL_BRAND_CONTEXT_POLICY } from "./personal-brand-sam.prompt";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ModuleId } from "@/brand/tokens";
import { loadDossierContext } from "./dossier.server";
import { hasPersonalGoals, parsePersonalGoals, PERSONAL_GOALS_TITLE } from "./personal-brand-goals";
import { personalContentResearch, PERSONAL_CONTENT_DIRECTION } from "./personal-content-research.server";
import { companyChannelBrief, personalLinkedIn } from "./profile-dna";
import { getAdminClient } from "./supabase-admin.server";
import { SAM_SYSTEM, MODULE_SKILLS } from "./sam.prompt";
import { loadModuleSnapshot } from "./modules.server";
import { readBrandContext } from "./brand-context.server";
import { CREATIVE_PLAYBOOK } from "./playbook.server";
import { EVIDENCE_POLICY } from "./creative-context";
import { listCreativeCapabilities } from "./creative-providers/registry";
import { getCreativeProviderAvailability } from "./creative-providers/adapters.server";
import { activePlanningVariants } from "./production-plan";
import { parseCreativeDirection } from "./creative-direction";

type SB = SupabaseClient<Database>;

export async function ensureThread(sb: SB, ws: string, module: ModuleId, userId: string, threadId?: string | null): Promise<string> {
  let query = sb.from("agent_threads").select("id").eq("workspace_id", ws).eq("module", module);
  if (threadId) query = query.eq("id", threadId);
  const { data: t, error } = await query.order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Couldn't open Sam's chat. Please try again.");
  if (t) return t.id;
  if (threadId) throw new Error("This chat isn't available in this client and stage.");
  const ins = await sb.from("agent_threads").insert({ workspace_id: ws, module, created_by: userId, title: "New chat" }).select("id").single();
  // Tolerate an old-schema concurrent first turn while the history migration rolls out.
  if (ins.error?.code === "23505") {
    const retry = await sb.from("agent_threads").select("id").eq("workspace_id", ws).eq("module", module)
      .order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
    if (retry.data) return retry.data.id;
  }
  if (ins.error) throw new Error(ins.error.message);
  return ins.data.id;
}

/** Titles are derived from the first user message; existing named chats keep their title. */
export async function saveSamUserMessage(sb: SB, ws: string, threadId: string, content: string) {
  const inserted = await sb.from("agent_messages").insert({ thread_id: threadId, workspace_id: ws, role: "user", content });
  if (inserted.error) throw new Error("Couldn't save your message. Please try again.");
  await sb.from("agent_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId).eq("workspace_id", ws);
  const title = content.trim().replace(/\s+/g, " ").slice(0, 60);
  const updated = await sb.from("agent_threads").update({ title })
    .eq("id", threadId).eq("workspace_id", ws).in("title", ["New chat", "Current cycle"]);
  if (updated.error) console.warn("Sam chat title could not be updated.");
}

/** Everything Sam knows for one turn: prompt, stage snapshot, brand, batch, file index, active canvas. */
export async function buildSamContext(sb: SB, ws: string, module: ModuleId, canvasId?: string | null, request = "") {
  let canvasContext = "";
  if (canvasId) {
    const { data: c } = await sb.from("canvases").select("title,blocks,version").eq("id", canvasId).eq("workspace_id", ws).maybeSingle();
    if (c) canvasContext = `\n## ACTIVE CANVAS "${c.title}" (v${c.version}) — update this one if the request refers to it\n${JSON.stringify(c.blocks, (_key, value) => typeof value === "string" && value.startsWith("data:image/") ? undefined : value).slice(0, 6000)}`;
  }
  const admin = getAdminClient();
  const companyChannel = companyChannelBrief(request);
  const [dossier, snapshot, ctx, libRes, factsRes, recentRes, workspace] = await Promise.all([
    loadDossierContext(ws, null, !companyChannel),
    loadModuleSnapshot(sb, module, ws),
    readBrandContext(admin, ws),
    admin.from("brand_files").select("id,name,kind,ai_label,ai_summary,asset_folders(name)").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(150),
    module === "create" ? admin.from("brand_facts").select("does,does_not,banned_claims,banned_colours,sources,updated_at").eq("workspace_id", ws).maybeSingle() : Promise.resolve({ data: null, error: null }),
    module === "create" ? admin.from("creative_variants").select("hook,argument,production_plan,review_note,review_state").eq("workspace_id", ws).order("updated_at", { ascending: false }).limit(8) : Promise.resolve({ data: null, error: null }),
    admin.from("workspaces").select("social_profiles").eq("id", ws).maybeSingle(),
  ]);
  let personalContext = "";
  let personalPlanningContext = "";
  const kind = await admin.from("agency_clients").select("workspace_kind").eq("workspace_id", ws).eq("status", "active").eq("workspace_kind", "personal").limit(1).maybeSingle();
  if (!companyChannel && (kind.data || personalLinkedIn(workspace.data?.social_profiles))) {
    const docs = await admin.from("dossier_documents").select("title,content").eq("workspace_id", ws).eq("source", "paste").in("title", ["Personal brand review", PERSONAL_GOALS_TITLE, "Personal brand corrections (user supplied)"]).order("updated_at", { ascending: false }).limit(10);
    let report = ""; let goals: ReturnType<typeof parsePersonalGoals> | undefined; let corrections = "";
    const operation = await (admin as unknown as SupabaseClient).from("brand_work_operations").select("result").eq("workspace_id", ws).eq("kind", "personal-brand-report").eq("signature", "v1").maybeSingle();
    try {
      const parsed = validatePersonalBrandReport(operation.data?.result);
      const evidence = new Map(parsed.evidence.map((item) => [item.id, item]));
      const findings = [...parsed.impression, ...parsed.themes, ...parsed.strengths, ...parsed.mixedSignals, ...parsed.channels.flatMap((c) => c.findings)];
      report = JSON.stringify({ generatedAt: parsed.generatedAt, findings: findings.slice(0, 20).map((f) => ({ text: f.text, sources: f.evidenceIds.map((id) => evidence.get(id)).filter((e) => !!e).map((e) => ({ url: e!.url, platform: e!.platform, date: e!.date, attribution: e!.attribution, basis: e!.basis })) })) }).slice(0, 10000);
    } catch { /* No valid completed report yet. */ }
    for (const doc of docs.data ?? []) {
      try {
        if (doc.title === "Personal brand review" && !report) {
          const parsed = validatePersonalBrandReport(JSON.parse(doc.content ?? ""));
          const evidence = new Map(parsed.evidence.map((item) => [item.id, item]));
          const findings = [...parsed.impression, ...parsed.themes, ...parsed.strengths, ...parsed.mixedSignals, ...parsed.channels.flatMap((c) => c.findings)];
          report = JSON.stringify({ generatedAt: parsed.generatedAt, findings: findings.slice(0, 20).map((f) => ({ text: f.text, sources: f.evidenceIds.map((id) => evidence.get(id)).filter((e) => !!e).map((e) => ({ url: e!.url, platform: e!.platform, date: e!.date, attribution: e!.attribution, basis: e!.basis })) })) }).slice(0, 10000);
        } else if (doc.title === "Personal brand corrections (user supplied)" && !corrections) {
          corrections = (doc.content ?? "").slice(0, 4000);
        } else if (doc.title === PERSONAL_GOALS_TITLE && !goals) {
          goals = parsePersonalGoals(doc.content);
        }
      } catch { /* Ignore invalid stored records. */ }
    }
    const research = module === "create" && goals && hasPersonalGoals(goals) ? await personalContentResearch(admin, ws, goals.brief) : "";
    personalContext = `\n## PERSONAL BRAND\n${PERSONAL_BRAND_CONTEXT_POLICY}\nPersonal goals and Profile DNA apply to the individual's content. Use company Brand DNA for company channels.${research ? `\n${PERSONAL_CONTENT_DIRECTION}` : ""}`;
    personalPlanningContext = JSON.stringify({ observedReview: report, savedGoals: goals, corrections, research });
  }
  const lib = libRes.data ?? [];
  const brandLine = kind.data
    ? "\n## PERSONAL CONTEXT — Focus on the individual’s voice, experience, goals and observed social presence. Websites and company assets are optional; never assume a company or treat missing business branding as a gap."
    : ctx.ready
    ? `\n## BRAND CONTEXT — ${ctx.files} brand files, ${ctx.docs} notes${ctx.website ? `, website ${ctx.website}` : ", no website saved"}.`
    : module === "create"
      ? `\n## BRAND CONTEXT — sparse (0 brand files, 0 notes${ctx.website ? `, website ${ctx.website} saved but not read here` : ", no website saved"}). A short user brief is a valid starting point. Draft conservative ideas using facts the user actually supplies; identify material assumptions. Do not require a website/uploads or invent brand claims. With no actual request/context, ask one brief question about what they want to make. Offer uploads as optional enrichment.`
      : `\n## BRAND CONTEXT — nothing yet (0 brand files, 0 notes${ctx.website ? `, website ${ctx.website} saved but never scanned` : ", no website saved"}). Do not invent anything about this brand; ask for missing facts when needed.`;
  const fileIndex = lib.length ? `\n## FILE LIBRARY (cite these ids in assets/document/shotlist/storyboard/compare blocks)\n${lib.map((f) => {
    const folder = (f as { asset_folders?: { name: string } | null }).asset_folders?.name;
    return `${f.id} | ${folder ? `${folder}/` : ""}${f.name} | ${f.ai_label ?? f.kind} | ${(f.ai_summary ?? "").slice(0, 120)}`;
  }).join("\n")}` : "";
  let batchCtx = "";
  let creativeCtx = "";
  if (module === "create") {
    const availability = new Map(getCreativeProviderAvailability().map((capability) => [capability.capabilityId, capability]));
    const capabilities = listCreativeCapabilities().filter((capability) => capability.status === "supported" && availability.get(capability.id)?.available).map((capability) => ({
      id: capability.id, treatment: capability.label, output: capability.output,
      inputs: capability.inputs, limits: capability.notes.slice(0, 4),
      state: "configured_unverified",
    }));
    const recent = (recentRes.data ?? []).map((variant) => {
      const plan = variant.production_plan && typeof variant.production_plan === "object" && !Array.isArray(variant.production_plan) ? variant.production_plan : {};
      return { hook: variant.hook, argument: variant.argument, direction: parseCreativeDirection(plan["direction"]), human_review: variant.review_state, feedback: variant.review_note };
    });
    creativeCtx = `\n## CREATE CREATIVE PLAYBOOK\n${CREATIVE_PLAYBOOK}\n\n${EVIDENCE_POLICY}
CURRENT SAVED BRAND FACTS (read only, not freshly regenerated; never invent missing facts):
${factsRes.error ? "Unavailable this turn; do not assume prior claims were verified." : factsRes.data ? JSON.stringify(factsRes.data).slice(0, 6000) : "No saved facts sheet. Use explicit user facts and dossier evidence conservatively."}
RECENT CREATIVE / FEEDBACK (this workspace only; descriptions are not visual inspection):
${recentRes.error ? "Unavailable this turn; originality against history is unverified." : JSON.stringify(recent).slice(0, 8000)}
CONNECTED PRODUCTION CAPABILITIES (bounded registry truth, not callable chat tools):
${JSON.stringify(capabilities).slice(0, 8000)}
Only the listed capabilities are configured; configuration does not prove model entitlement or tested output. The existing branded HyperFrames composition path remains available where configured; extra provider steps are optional. Tavus/presenter is not connected. Never propose an unavailable provider as executable.
Use this guidance for production-aware narrative/treatment suggestions: audience insight, supported argument, opening promise, story mechanism, composition, type, motion, imagery, sound, pacing and ending. Rich footage and sparse website/brief inputs need different justified approaches. Compare semantic/structural/visual mechanism with recent work, not only wording. Never impose a universal UI-card sequence or end card.
No images or playback were newly inspected by this chat context. File labels and prior summaries are not proof of current pixels, transitions or audio. Only report website retrieval for the official pages identified as read in the supplied research.
Capability IDs are NOT registered chat tools. Use only the registered tools exposed for this turn and allowed Live View blocks. Propose drafts/shotlists/storyboards within scope. A render request needs the existing confirm block with real saved variant IDs and the user's approval; never invent an ID or claim a render started without its actual result. Do not start automatic rendering or bypass the existing production wizard/confirmation action.`;
    const { data: b } = await sb.from("creative_batches").select("id,title,stage,narratives,active_plan_id").eq("workspace_id", ws).not("goal", "like", "sam-thread:%").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (b) {
      const { data: vs } = await sb.from("creative_variants").select("id,position,hook,duration_s,size,review_state,cta,production_plan").eq("batch_id", b.id).eq("workspace_id", ws).order("position");
      const ns = ((Array.isArray(b.narratives) ? b.narratives : []) as { title?: string; selected?: boolean; libraryStatus?: string }[])
        .filter((n) => n.libraryStatus !== "binned" && n.libraryStatus !== "rejected");
      batchCtx = `\n## CURRENT BATCH "${b.title}" (wizard step: ${b.stage})\nNarratives on screen: ${ns.map((n, i) => `${i + 1}. ${n.title}${n.selected ? " [picked]" : ""}`).join(" | ") || "none"}\nAsset briefs (active plan only): ${activePlanningVariants(vs ?? [], b.active_plan_id).map((v, i) => `Asset ${i + 1} [variant_id ${v.id}]: ${v.duration_s}s ${v.size} "${v.hook}" (${v.review_state}) CTA "${v.cta}"`).join(" | ") || "none yet"}`;
    }
  }
  const sys = `${SAM_SYSTEM}\n\n${MODULE_SKILLS[module]}\n${dossier}\n${snapshot}${personalContext}${brandLine}${creativeCtx}${batchCtx}${fileIndex}${canvasContext}`;
  return { sys, personalPlanningContext, ownFiles: new Set(lib.map((f) => f.id)) };
}
