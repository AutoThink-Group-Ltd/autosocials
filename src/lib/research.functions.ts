import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { ResearchTargetSchema, targetFromSocialUrl } from "./research";
import { apifyConfigured, discoverResearchTargets, startApifyRun } from "./research-provider.server";
import { advanceResearchRun, authorizeResearch, listSavedResearch, loadResearchRun, processResearchInBackground, researchClient } from "./research.server";

const Workspace = z.object({ workspace_id: z.string().uuid() });
const Query = Workspace.extend({ query: z.string().trim().min(2).max(500) });
const RunId = Workspace.extend({ run_id: z.string().uuid() });

export const resolveResearchTargets = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Query.parse(input))
  .handler(async ({ data }) => {
    await authorizeResearch(data.workspace_id);
    const result = await discoverResearchTargets(data.query);
    if (!apifyConfigured()) result.warnings.push("Public post collection needs an Apify API token before an audit can run.");
    return { ...result, provider_ready: apifyConfigured() };
  });

export const startResearchRun = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Query.extend({ question: z.string().max(8000).default(""), targets: z.array(ResearchTargetSchema).min(1).max(3) }).parse(input))
  .handler(async ({ data }) => {
    const user = await authorizeResearch(data.workspace_id);
    const targets = data.targets.map((target) => {
      const canonical = targetFromSocialUrl(target.url);
      if (!canonical || canonical.id !== target.id || canonical.platform !== target.platform || canonical.handle.toLowerCase() !== target.handle.toLowerCase()) throw new Error("Choose a valid public profile");
      return { ...canonical, display_name: target.display_name, avatar_url: target.avatar_url };
    });
    if (new Set(targets.map((target) => target.id)).size !== targets.length) throw new Error("Choose each profile once");
    const admin = researchClient();
    const existingRun = async () => {
      const active = await admin.from("research_runs").select("id").eq("workspace_id", data.workspace_id)
        .in("status", ["queued", "fetching", "analyzing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (active.error) throw new Error("Could not check this business's active research");
      return active.data ? String(active.data["id"]) : null;
    };
    const resume = (id: string) => {
      try { waitUntil(processResearchInBackground(data.workspace_id, id)); }
      catch { /* Opening the report resumes its saved work. */ }
      return { id, reused: true };
    };
    const activeId = await existingRun();
    if (activeId) return resume(activeId);
    if (!apifyConfigured()) throw new Error("Public post collection is not configured yet. Add APIFY_API_TOKEN to the server environment.");
    const initial = await admin.from("research_runs").insert({ workspace_id: data.workspace_id, user_id: user.id, query: data.query, question: data.question, targets, posts: [], errors: [], status: "queued", provider_runs: {} }).select("id").single();
    if (initial.error?.code === "23505") {
      const winner = await existingRun();
      if (winner) return resume(winner);
    }
    if (initial.error || !initial.data) throw new Error("Could not save the research run");
    const id = String(initial.data["id"]);
    const providerRuns: Record<string, string> = {};
    const errors: string[] = [];
    await Promise.all(targets.map(async (target) => {
      try { providerRuns[target.id] = await startApifyRun(target); }
      catch { errors.push(`${target.platform} ${target.handle}: could not start public post collection`); }
    }));
    const status = Object.keys(providerRuns).length ? "fetching" : "failed";
    const updated = await admin.from("research_runs").update({ provider_runs: providerRuns, errors, status, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", data.workspace_id);
    if (updated.error) throw new Error("Could not update the research run");
    if (status === "fetching") {
      try { waitUntil(processResearchInBackground(data.workspace_id, id)); }
      catch { /* Reopening or polling the saved report can resume this run. */ }
    }
    return { id, reused: false };
  });

export const getResearchRun = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RunId.parse(input))
  .handler(async ({ data }) => {
    await authorizeResearch(data.workspace_id);
    return advanceResearchRun(data.workspace_id, data.run_id);
  });

export const listResearchRuns = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => Workspace.parse(input))
  .handler(async ({ data }) => {
    await authorizeResearch(data.workspace_id);
    return listSavedResearch(data.workspace_id);
  });

export const saveResearchReply = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RunId.extend({ reply: z.string().max(5000) }).parse(input))
  .handler(async ({ data }) => {
    await authorizeResearch(data.workspace_id);
    await loadResearchRun(data.workspace_id, data.run_id);
    const result = await researchClient().from("research_runs").update({ reply: data.reply, updated_at: new Date().toISOString() }).eq("workspace_id", data.workspace_id).eq("id", data.run_id);
    if (result.error) throw new Error("Could not save the reply draft");
    return { ok: true };
  });
