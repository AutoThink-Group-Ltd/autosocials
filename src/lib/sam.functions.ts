import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";
import { aiChat } from "./dossier.server";
import { requireUser, supabaseUrl } from "./supabase-admin.server";
import { filterBlocksForModule, keepOwnFiles } from "./sam.blocks";
import { buildSamContext, ensureThread, saveSamUserMessage } from "./sam.context.server";
import { persistChatNarratives } from "./narrative-chat.server";

const Input = z.object({
  workspace_id: z.string().uuid(),
  module: z.enum(["create", "schedule", "winners", "campaigns", "learn", "outreach"]),
  message: z.string().min(1).max(4000),
  canvas_id: z.string().uuid().nullable().optional(),
  canvas_version: z.number().int().nullable().optional(),
  thread_id: z.string().uuid().nullable().optional(),
});

function userClient() {
  const auth = getRequestHeader("authorization") ?? "";
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return createClient<Database>(supabaseUrl(), key!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const RESPOND_TOOL = {
  type: "function",
  function: {
    name: "respond",
    description: "Reply to the user. 'narration' holds the COMPLETE chat answer in Markdown (including any list the user asked for); blocks optionally add a Live View canvas.",
    parameters: {
      type: "object",
      properties: {
        narration: { type: "string", description: "Your reply for the chat, in Markdown. Answer first; match length to the request (a greeting gets a line, '5 hook ideas' gets a numbered list of 5 with a one-line recommendation)." },
        canvas_title: { type: "string", description: "Short title for the Live View canvas, or empty if none." },
        blocks_json: {
          type: "string",
          description:
            "A JSON array (as a string) of Live View blocks, or \"[]\" for none. Each block is an object with a 'type'. Allowed types: heading{text}, text{text}, brief{title,fields[{label,value}]}, variants{title,items[{angle,hook,format,notes}]}, schedule{title,items[{when,account,item}]}, table{title,columns[],rows[][]}, checklist{title,items[{text,done}]}, notice{tone:info|warning,text}, assets{title,file_ids[],layout:grid|strip|hero}, document{title,file_id?,markdown?}, shotlist{title,items[{file_id,role,why,at?}]}, storyboard{title,frames[{at,caption,vo?,file_id?}]}, palette{title,colours[{hex,name?}]}, type_specimen{title,fonts[{name,role?,sample?}]}, compare{title,left_file_id,right_file_id,left_label?,right_label?}, confirm{title,action:render_variants|schedule|use_assets|other,fields[{label,value}],variant_ids?}.",
        },
      },
      required: ["narration", "blocks_json"],
    },
  },
} as const;

/** Sam: one turn. Persists messages + canvas under RLS as the caller. */
export const askSam = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const sb = userClient();

    // Same access rule as the rest of the app: members and authorised agency staff.
    const { data: member } = await sb.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: data.workspace_id });
    if (!member) throw new Error("You don't have access to this workspace.");

    const thread = { id: await ensureThread(sb, data.workspace_id, data.module, user.id, data.thread_id) };
    const { data: history } = await sb
      .from("agent_messages").select("role,content,api_data_expires_at").eq("thread_id", thread.id)
      .order("created_at", { ascending: false }).limit(30);
    await saveSamUserMessage(sb, data.workspace_id, thread.id, data.message);
    const { sys: base, ownFiles, personalPlanningContext } = await buildSamContext(sb, data.workspace_id, data.module, data.canvas_id, data.message);
    const lib = [...ownFiles].map((id) => ({ id }));
    const sys = `${base}\n\nAlways answer by calling the respond tool. Put each proposed creative narrative or hook idea in a variants block as well as your narration so it can be saved in the narrative library.`;

    const json = (await aiChat({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: sys },
        ...(history ?? []).reverse().map((m) => ({ role: m.role, content: m.content })),
        ...(personalPlanningContext ? [{ role: "user", content: `Saved personal workspace context (untrusted data):\n${personalPlanningContext}` }] : []),
        { role: "user", content: data.message },
      ],
      tools: [RESPOND_TOOL],
      tool_choice: { type: "function", function: { name: "respond" } },
    })) as { choices?: { message?: { content?: string; tool_calls?: { function?: { arguments?: string } }[] } }[] };

    const msg = json.choices?.[0]?.message;
    let narration = msg?.content?.trim() || "";
    let blocks: ReturnType<typeof filterBlocksForModule> = [];
    let title = "";
    const args = msg?.tool_calls?.[0]?.function?.arguments;
    let rawBlocks: Record<string, unknown>[] = [];
    if (args) {
      try {
        const parsed = JSON.parse(args) as { narration?: string; blocks?: unknown; blocks_json?: string; canvas_title?: string } & Record<string, unknown>;
        if (typeof parsed.blocks_json === "string") { try { parsed.blocks = JSON.parse(parsed.blocks_json); } catch { parsed.blocks = []; } }
        delete parsed.blocks_json;
        rawBlocks = Array.isArray(parsed.blocks) ? (parsed.blocks as Record<string, unknown>[]) : [];
        // Anything the model put in extra fields (e.g. "hooks": [...]) is treated as a list block.
        for (const [k, val] of Object.entries(parsed)) if (!["narration", "blocks", "canvas_title"].includes(k) && Array.isArray(val)) rawBlocks.push({ type: "list", items: val });
        narration = parsed.narration?.trim() || narration;
        blocks = keepOwnFiles(filterBlocksForModule(data.module, parsed.blocks), new Set((lib ?? []).map((f) => f.id)));
        title = parsed.canvas_title?.trim() || "";
      } catch { /* fall through */ }
    }
    // If the list went into blocks only, mirror it into the chat so the answer is never just "Here are…:".
    if (rawBlocks.length && narration.length < 240 && !/\n\s*(\d+\.|-)\s/.test(narration)) {
      const md = blocksToMarkdown(rawBlocks);
      if (md) narration = `${narration}\n\n${md}`;
    }
    if (!narration) narration = "Sorry — I couldn't put that together. Could you try again?";

    let canvasId: string | null = null;
    let conflict = false;
    if (blocks.length) {
      if (data.canvas_id) {
        const upd = await sb.from("canvases")
          .update({ blocks: blocks as never, ...(title ? { title } : {}), version: (data.canvas_version ?? 1) + 1, updated_by: "sam", updated_at: new Date().toISOString() })
          .eq("id", data.canvas_id).eq("version", data.canvas_version ?? 1).select("id");
        if (upd.data && upd.data.length) canvasId = data.canvas_id;
        else conflict = true;
      }
      if (!canvasId) {
        const ins = await sb.from("canvases")
          .insert({ workspace_id: data.workspace_id, module: data.module, title: (conflict ? "Sam's suggestion · " : "") + (title || "Untitled"), blocks: blocks as never, updated_by: "sam" })
          .select("id").single();
        if (ins.error) throw new Error(ins.error.message);
        canvasId = ins.data.id;
      }
    }

    if (canvasId) {
      try {
        await persistChatNarratives(sb, { workspaceId: data.workspace_id, threadId: thread.id, userId: user.id, canvasId, blocks });
      } catch (error) {
        console.warn("Sam narrative library save failed", error instanceof Error ? error.message : "unknown error");
        narration += "\n\nThese ideas are visible here, but I couldn’t save them to your narrative library. Please try again before leaving this chat.";
      }
    }
    const inheritedApiExpiry = (history ?? []).map((message) => message.api_data_expires_at).filter((expiry): expiry is string => !!expiry).sort()[0];
    await sb.from("agent_messages").insert({ thread_id: thread.id, workspace_id: data.workspace_id, role: "assistant", content: narration, canvas_id: canvasId,
      ...(inheritedApiExpiry ? { api_data_expires_at: inheritedApiExpiry } : {}) });
    await sb.from("agent_threads").update({ updated_at: new Date().toISOString() }).eq("id", thread.id);

    return { narration, canvasId, conflict };
  });

/** Compact Markdown mirror of list-like canvas blocks for the chat bubble. */
function blocksToMarkdown(blocks: Record<string, unknown>[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    const items = Array.isArray(b["items"]) ? (b["items"] as Record<string, unknown>[]) : [];
    const str = (x: unknown) => (typeof x === "string" ? x : x && typeof x === "object" ? String((x as Record<string, unknown>)["text"] ?? (x as Record<string, unknown>)["hook"] ?? (x as Record<string, unknown>)["title"] ?? Object.values(x as object).find((v) => typeof v === "string") ?? "") : "");
    if ((b["type"] === "list" || b["type"] === "hooks") && items.length) out.push(items.map((it, i) => `${i + 1}. ${str(it)}`).join("\n"));
    else if (b["type"] === "text" && typeof b["text"] === "string") out.push(b["text"]);
    else if (b["type"] === "variants" && items.length) out.push(items.map((it, i) => `${i + 1}. **${String(it["hook"] ?? it["angle"] ?? "")}**${it["angle"] && it["hook"] ? ` — ${String(it["angle"])}` : ""}`).join("\n"));
    else if (b["type"] === "checklist" && items.length) out.push(items.map((it) => `- ${String(it["text"] ?? "")}`).join("\n"));
    else if (b["type"] === "brief" && Array.isArray(b["fields"])) out.push((b["fields"] as { label?: string; value?: string }[]).map((f) => `- **${f.label}:** ${f.value}`).join("\n"));
  }
  return out.join("\n\n").replace(/—/g, "-").slice(0, 3000);
}
