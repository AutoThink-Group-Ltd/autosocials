import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const id = z.string().uuid();
const scope = z.object({ workspaceId: id, replyId: id });
async function access() { const [{ requireUser }, api] = await Promise.all([import("./supabase-admin.server"), import("./outreach-reply.server")]); return { user: await requireUser(), api }; }
export const draftOutreachReply = createServerFn({ method: "POST" }).inputValidator((data) => scope.parse(data)).handler(async ({ data }) => { const { user, api } = await access(); return api.draftOutreachReplyData(user.id, data); });
export const prepareOutreachReply = createServerFn({ method: "POST" }).inputValidator((data) => scope.extend({ body: z.string().trim().min(1).max(10000) }).parse(data)).handler(async ({ data }) => { const { user, api } = await access(); return api.prepareOutreachReplyData(user.id, data); });
export const approveOutreachReply = createServerFn({ method: "POST" }).inputValidator((data) => z.object({ workspaceId: id, reviewId: id, version: z.number().int().positive() }).parse(data)).handler(async ({ data }) => { const { user, api } = await access(); return api.approveOutreachReplyData(user.id, data); });
