import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";
/** Availability is honest: laptop browser automation is not a hosted product capture service. */
export const getAssetCaptureAvailability = createServerFn({ method: "POST" }).inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(input)).handler(async ({ data }) => {
  const user = await requireUser(); const admin = getAdminClient(); const result = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: data.workspace_id });
  if (result.error || !result.data) throw new Error("You do not have access to this business.");
  return { available: !!process.env.FIRECRAWL_API_KEY, state: "public_screenshot_only" as const, reason: "Public page screenshots are supported when website scanning is configured. Authenticated login and workflow recordings are not connected; upload a recording or save the request for later.", credential_upload_allowed: false as const };
});

export const capturePublicApp = createServerFn({ method: "POST" }).inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid(), url: z.string().url().max(2000), confirmed: z.literal(true) }).parse(input)).handler(async ({ data }) => {
  const user = await requireUser(); const { capturePublicAppForUser } = await import("./asset-capture.server"); return capturePublicAppForUser(user.id, data.workspace_id, data.url);
});
