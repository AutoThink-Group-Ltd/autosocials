import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aiChat, loadDossierContext } from "./dossier.server";
import { requireUser, getAdminClient } from "./supabase-admin.server";

const Input = z.object({
  brief: z.string(),
  platforms: z.array(z.string()).optional(),
  workspace_id: z.string().nullable().optional(),
});

/** Produce independently editable copy for each selected platform. */
export const composeCaption = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    if (data.workspace_id) {
      const { data: member, error } = await getAdminClient().rpc("is_workspace_member", {
        _user_id: user.id, _workspace_id: data.workspace_id,
      });
      if (error || !member) throw new Error("Workspace access denied");
    }
    const targets = [...new Set((data.platforms?.length ? data.platforms : ["instagram"]).filter((p) => p === "facebook" || p === "instagram"))];
    if (!targets.length) throw new Error("Choose Facebook or Instagram");
    const dossier = await loadDossierContext(data.workspace_id);
    const sys = `You are Sam, an AI copilot for AutoSocials. Write one social post caption for the named platform.
${dossier}
If a WORKSPACE DOSSIER is provided above, it is the source of truth for brand voice, ICP, offers and tone. The caption MUST sound like that brand. Never contradict the dossier.
- Voice: calm, confident, premium, never hypey.
- Instagram: lead with a hook in the first 125 chars; use 1-2 emoji max; 3-5 relevant hashtags at the end; stay under 2200 characters.
- Facebook: longer, conversational, no hashtags.
- Never invent facts. If brief is empty, ask for the topic in <30 chars.
Return only the caption text. No quotes, no markdown.`;
    const entries = await Promise.all(targets.map(async (platform) => {
      const json = await aiChat({
        model: "gpt-5.4-mini",
        messages: [
          { role: "system", content: `${sys}\nTarget platform: ${platform}.` },
          { role: "user", content: data.brief || "Ask what this post is about." },
        ],
      });
      return [platform, json.choices?.[0]?.message?.content?.trim() ?? ""] as const;
    }));
    const byPlatform = Object.fromEntries(entries);
    return { caption: entries[0]?.[1] ?? "", byPlatform };
  });
