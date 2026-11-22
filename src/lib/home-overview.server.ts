import { getAdminClient } from "./supabase-admin.server";
import { ModelCreateInput, type ModelCreateRequest } from "./model-create.functions";
import { getVideoStyle } from "./video-styles";
import { homeNarratives, homeOverviewItems, type HomeBatch, type HomeVariant, type HomeRender, type HomeLedgerStep, type HomePlanningJob, type HomeOverviewView } from "./home-overview";

/** Bounded workspace-wide read; no generation, refresh mutation or admission. */
export async function getHomeOverviewForUser(userId: string, workspaceId: string, view: HomeOverviewView | "all" = "home") {
  const admin = getAdminClient();
  const access = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: workspaceId });
  if (access.error || !access.data) throw new Error("You do not have access to this business.");
  // Dashboard stays bounded. Recovery reads every batch in bounded pages so older
  // deleted work remains accessible without enlarging the normal dashboard.
  const result: ReturnType<typeof homeOverviewItems> = [];
  for (let offset = 0; ; offset += 30) {
    const batches = await admin.from("creative_batches").select("id,workspace_id,created_by,title,goal,stage,active_plan_id,narratives,created_at,updated_at").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 29);
    if (batches.error || !batches.data) throw new Error("Your recent videos could not be loaded.");
    if (!batches.data.length) break;
    result.push(...await readBatchPage(batches.data as HomeBatch[]));
    if (view !== "trash" || batches.data.length < 30) break;
  }
  return result;

  async function readBatchPage(batchRows: HomeBatch[]) {
  const batchIds = batchRows.map((batch) => batch.id);
  const [variants, planning] = await Promise.all([
    admin.from("creative_variants").select("id,batch_id,hook,narrative,script,beats,production_plan,build_prompt_issues,created_at,updated_at").eq("workspace_id", workspaceId).in("batch_id", batchIds).order("updated_at", { ascending: false }).limit(120),
    (admin.from("creative_planning_jobs" as never) as any).select("id,batch_id,status,error,picked:input->picked,home_trashed_at:checkpoint->>home_trashed_at,created_at,updated_at").eq("workspace_id", workspaceId).in("batch_id", batchIds).order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(120),
  ]);
  if (variants.error || !variants.data) throw new Error("Your saved video stages could not be loaded.");
  if (planning.error || !planning.data || planning.data.length >= 120) throw new Error("Your storyboard preparation progress could not be checked completely.");
  const variantRows = variants.data as HomeVariant[];
  if (variantRows.length >= 120) throw new Error("Recent video history could not be checked completely. Open Sam's creations to inspect your saved videos.");
  // Read only the retry-version markers, never large immutable HTML/media snapshots.
  const renders = variantRows.length ? await admin.from("render_jobs").select("id,variant_id,status,phase,error,created_at,saved_plan_version:brief_snapshot->production_plan->>version,retry_engine_version:production_state->>engine_version").eq("workspace_id", workspaceId).in("variant_id", variantRows.map((variant) => variant.id)).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(500) : { data: [], error: null };
  if (renders.error || !renders.data) throw new Error("Your video production status could not be loaded.");
  const renderRows = renders.data as HomeRender[];
  if (renderRows.length >= 500) throw new Error("Recent production history could not be checked completely. Open Sam's creations to inspect your saved videos.");
  const failed = renderRows.filter((job) => job.status === "failed").map((job) => job.id);
  const ledger = failed.length ? await admin.from("generation_steps").select("render_job_id,provider,status,provider_job_id,error_code").eq("workspace_id", workspaceId).in("render_job_id", failed).limit(2000) : { data: [], error: null };
  const requests = new Map<string, ModelCreateRequest>();
  const modelNames = new Map<string, string>();
  const modelOwners = new Set<string>();
  for (const batch of batchRows) {
    if (batch.created_by === userId) modelOwners.add(batch.id);
    const raw = homeNarratives(batch).find((item) => item.model_create_request)?.model_create_request;
    const parsed = ModelCreateInput.safeParse(raw);
    if (!parsed.success || parsed.data.workspace_id !== workspaceId || parsed.data.request_id !== batch.id) continue;
    modelNames.set(batch.id, getVideoStyle(parsed.data.style_id)?.name ?? parsed.data.style_id);
    // Workspace membership alone does not authorize replaying another user's exact request.
    if (batch.created_by === userId) requests.set(batch.id, parsed.data);
  }
  return homeOverviewItems({ batches: batchRows, variants: variantRows, renders: renderRows, steps: (ledger.data ?? []) as HomeLedgerStep[], planningJobs: planning.data as HomePlanningJob[], ledgerAvailable: !ledger.error && (ledger.data?.length ?? 0) < 2000, requests, modelNames, modelOwners, view });
  }
}
