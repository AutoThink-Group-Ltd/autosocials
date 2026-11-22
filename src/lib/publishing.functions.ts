import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";
import { supabaseUrl } from "./supabase-admin.server";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

const uuid = z.string().uuid();

/** Move an unpublished item; every delivery retains the same instant. */
export const reschedulePublishPost = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ post_id: uuid, scheduled_at: z.string().datetime() }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: post, error: loadError } = await admin.from("posts")
      .select("id, workspace_id, status, scheduled_at")
      .eq("id", data.post_id).maybeSingle();
    if (loadError || !post) throw new Error("Post not found");
    const { data: member, error: accessError } = await admin.rpc("can_confirm_creation_schedule", {
      _user_id: user.id, _workspace_id: post.workspace_id,
    });
    if (accessError || !member) throw new Error("Workspace access denied");
    if (post.status !== "draft" && post.status !== "scheduled") throw new Error("Only drafts and scheduled posts can move");
    const { data: policy, error: policyError } = await admin.from("workspaces").select("requires_approval").eq("id", post.workspace_id).maybeSingle();
    if (policyError || !policy) throw new Error("Could not check this workspace’s approval settings.");
    if (policy.requires_approval && post.status === "draft") throw new Error("Submit this draft for approval before scheduling");
    const instant = new Date(data.scheduled_at);
    if (instant.getTime() < Date.now() + 60_000) throw new Error("Choose a time at least one minute ahead");
    const move = admin.from("posts")
      .update({ scheduled_at: instant.toISOString(), status: "scheduled" })
      .eq("id", data.post_id)
      .eq("status", post.status);
    const original = post.scheduled_at === null ? move.is("scheduled_at", null) : move.eq("scheduled_at", post.scheduled_at);
    const { data: updated, error } = await original.select("id").maybeSingle();
    if (error?.code === "23P01") throw new Error("A selected account already has a post at that minute. Choose another time.");
    if (error || !updated) throw new Error("Could not move this post. Refresh the calendar and retry.");
    return { ok: true, post_id: updated.id, scheduled_at: instant.toISOString() };
  });

/** Copy content into a new draft without sharing removable storage objects. */
export const duplicatePublishPost = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ post_id: uuid }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: source } = await admin.from("posts").select("*").eq("id", data.post_id).maybeSingle();
    if (!source) throw new Error("Post not found");
    const { data: member } = await admin.rpc("is_workspace_member", {
      _user_id: user.id, _workspace_id: source.workspace_id,
    });
    if (!member) throw new Error("Workspace access denied");
    const { data: copy, error } = await admin.from("posts").insert({
      workspace_id: source.workspace_id,
      created_by: user.id,
      caption: source.caption,
      first_comment: source.first_comment,
      hashtags: source.hashtags,
      youtube_title: source.youtube_title,
      youtube_description: source.youtube_description,
      youtube_visibility: source.youtube_visibility,
      youtube_made_for_kids: source.youtube_made_for_kids,
      ai_disclosure: source.ai_disclosure,
      status: "draft",
    }).select("id").single();
    if (error || !copy) throw new Error("Could not duplicate post");
    try {
      const [{ data: media }, { data: targets }] = await Promise.all([
        admin.from("post_media").select("kind,storage_path,mime,width,height,duration_ms,position").eq("post_id", source.id),
        admin.from("post_targets").select("social_account_id,platform,caption_override,first_comment_override").eq("post_id", source.id),
      ]);
      for (const item of media ?? []) {
        const extension = item.storage_path.split(".").pop() || "bin";
        const destination = `${source.workspace_id}/${copy.id}/${crypto.randomUUID()}.${extension}`;
        const { error: copyError } = await admin.storage.from("post-media").copy(item.storage_path, destination);
        if (copyError) throw copyError;
        const { error: mediaError } = await admin.from("post_media").insert({
          post_id: copy.id, kind: item.kind, storage_path: destination, mime: item.mime,
          width: item.width, height: item.height, duration_ms: item.duration_ms, position: item.position,
        });
        if (mediaError) throw mediaError;
      }
      if (targets?.length) {
        const { error: targetsError } = await admin.from("post_targets").insert(targets.map((target) => ({
          post_id: copy.id, social_account_id: target.social_account_id, platform: target.platform,
          caption_override: target.caption_override, first_comment_override: target.first_comment_override,
        })));
        if (targetsError) throw targetsError;
      }
      return { post_id: copy.id };
    } catch (failure) {
      await admin.from("posts").delete().eq("id", copy.id);
      throw failure;
    }
  });

/** Schedule a selected batch in order after one review and confirmation. */
export const schedulePublishBatch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({
    post_ids: z.array(uuid).min(1).max(50),
    first_at: z.string().datetime(),
    interval_hours: z.number().int().min(1).max(168),
  }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const ids = [...new Set(data.post_ids)];
    const first = new Date(data.first_at);
    if (first.getTime() < Date.now() + 60_000) throw new Error("First slot must be in the future");
    const { data: posts, error } = await admin.from("posts")
      .select("id,workspace_id,status").in("id", ids);
    if (error || posts?.length !== ids.length) throw new Error("Some posts are unavailable");
    const workspace = posts[0]?.workspace_id;
    if (!workspace || posts.some((post) => post.workspace_id !== workspace || !["draft", "scheduled"].includes(post.status))) {
      throw new Error("Choose drafts or scheduled posts from one workspace");
    }
    const { data: member } = await admin.rpc("is_workspace_member", {
      _user_id: user.id, _workspace_id: workspace,
    });
    if (!member) throw new Error("Workspace access denied");
    const { data: policy } = await admin.from("workspaces").select("requires_approval").eq("id", workspace).maybeSingle();
    if (policy?.requires_approval && posts.some((post) => post.status === "draft")) {
      throw new Error("Submit drafts for approval before batch scheduling");
    }
    const scheduled: string[] = [];
    for (const [index, id] of ids.entries()) {
      const scheduled_at = new Date(first.getTime() + index * data.interval_hours * 3_600_000).toISOString();
      const { data: changed, error: updateError } = await admin.from("posts")
        .update({ status: "scheduled", scheduled_at })
        .eq("id", id).in("status", ["draft", "scheduled"]).select("id").maybeSingle();
      if (updateError || !changed) return { scheduled, failed_post_id: id, error: updateError?.message ?? "Post changed; refresh and retry" };
      scheduled.push(id);
    }
    return { scheduled, failed_post_id: null, error: null };
  });

const AutopilotInput = z.object({
  workspace_id: uuid,
  account_ids: z.array(uuid).max(100),
  source_post_ids: z.array(uuid).max(200),
  timezone: z.string().min(1).max(100),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  local_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  enabled: z.boolean(),
});

/** User authorization is checked again inside the database function. */
export const configurePublishAutopilot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AutopilotInput.parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    const auth = getRequestHeader("authorization") ?? "";
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!key || !auth.startsWith("Bearer ")) throw new Error("Publishing authorization unavailable");
    const client = createClient(supabaseUrl(), key, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: planId, error } = await client.rpc("configure_publish_autopilot", {
      _workspace_id: data.workspace_id,
      _account_ids: data.account_ids,
      _source_post_ids: data.source_post_ids,
      _timezone: data.timezone,
      _weekdays: data.weekdays,
      _local_time: data.local_time,
      _enabled: data.enabled,
    });
    if (error) throw new Error(error.message);
    return { plan_id: planId, enabled: data.enabled };
  });

export const getPublishAutopilot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: uuid }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: member } = await admin.rpc("is_workspace_member", {
      _user_id: user.id, _workspace_id: data.workspace_id,
    });
    if (!member) throw new Error("Workspace access denied");
    const { data: row, error } = await admin.from("publish_autopilot_plans" as "posts")
      .select("id,enabled,account_ids,source_post_ids,timezone,weekdays,local_time")
      .eq("workspace_id", data.workspace_id).maybeSingle();
    if (error) throw new Error(error.message);
    return row as unknown as {
      id: string; enabled: boolean; account_ids: string[]; source_post_ids: string[];
      timezone: string; weekdays: number[]; local_time: string;
    } | null;
  });
