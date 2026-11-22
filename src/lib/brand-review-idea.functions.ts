import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";

/** Turn a saved brand-review suggestion into a selected narrative; no render starts. */
export const startBrandReviewIdea = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => z.object({ workspace_id: z.string().uuid(), title: z.string().min(1).max(120), why: z.string().min(1).max(320) }).parse(value))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: data.workspace_id });
    if (access.error || !access.data) throw new Error("Forbidden");
    const profile = await admin.from("brand_profiles").select("suggestions").eq("workspace_id", data.workspace_id).maybeSingle();
    if (profile.error || !Array.isArray(profile.data?.suggestions)) throw new Error("These ideas are no longer available. Refresh the review.");
    const idea = profile.data.suggestions.find((item) => item && typeof item === "object" && !Array.isArray(item) && String(item.title ?? "").trim().slice(0, 120) === data.title && String(item.why ?? "").trim().slice(0, 320) === data.why);
    if (!idea) throw new Error("This idea has changed. Refresh the review.");
    const narrative = { id: crypto.randomUUID(), title: data.title, message: data.why, why: data.why, selected: true, custom: true, libraryStatus: "available", createdAt: new Date().toISOString() };
    const created = await admin.from("creative_batches").insert({ workspace_id: data.workspace_id, created_by: user.id, title: `From idea: ${data.title}`.slice(0, 120), goal: "", audience: "", offer: "", destination: "", days: 3, starts_on: new Date(Date.now() + 86400000).toISOString().slice(0, 10), stage: "narratives", narratives: [narrative] as never }).select("id").single();
    if (created.error || !created.data) throw new Error("Could not prepare this idea.");
    return { batchId: created.data.id };
  });
