import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";
import { FROM, renderEmail, sendViaSendGrid } from "./email-layout.server";
import { parseBlocks } from "./sam.blocks";

/** A user-triggered support request with server-verified job details. */
export const requestVideoSupport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ canvas_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const canvas = await admin.from("canvases").select("id,workspace_id,module,blocks").eq("id", data.canvas_id).single();
    if (canvas.error || !canvas.data || canvas.data.module !== "create") throw new Error("This video request is unavailable.");
    const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: canvas.data.workspace_id });
    if (access.error || !access.data) throw new Error("Forbidden");
    const block = parseBlocks(canvas.data.blocks).find((item) => item.type === "direct_video");
    if (!block) throw new Error("This video request is unavailable.");
    const job = block.variant_id ? await admin.from("render_jobs").select("id,status,phase,error").eq("workspace_id", canvas.data.workspace_id).eq("variant_id", block.variant_id).order("created_at", { ascending: false }).limit(1).maybeSingle() : null;
    if (job?.error) throw new Error("The production status could not be checked.");
    const failure = job?.data?.error || block.error;
    if (!failure && block.status !== "failed" && job?.data?.status !== "failed") throw new Error("No video failure is recorded for this request.");
    const reference = crypto.randomUUID().slice(0, 8).toUpperCase();
    const email = renderEmail({ preheader: `Video support request ${reference}`, heading: "Video generation needs help", intro: [
      `Reference: ${reference}`, `User: ${user.email ?? user.id}`, `Workspace ID: ${canvas.data.workspace_id}`, `Canvas ID: ${canvas.data.id}`,
      `Variant ID: ${block.variant_id ?? "not admitted"}`, `Job ID: ${job?.data?.id ?? "not submitted"}`,
      `Status: ${job?.data?.status ?? block.status}`, `Phase: ${job?.data?.phase ?? "unknown"}`,
      `Error: ${String(failure ?? "Video could not start").slice(0, 500)}`, `Received: ${new Date().toISOString()}`,
    ], signOff: false });
    await sendViaSendGrid({ to: FROM.email, subject: `AutoSocials video support ${reference}`, ...email, categories: ["support"] });
    return { reference };
  });
