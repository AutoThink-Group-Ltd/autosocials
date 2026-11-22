import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aiChat, loadDossierContext } from "./dossier.server";
import { requireUser } from "./supabase-admin.server";

const Input = z.object({
  caption: z.string().optional(),
  niche: z.string().optional(),
  platform: z.string().optional(),
  workspace_id: z.string().nullable().optional(),
});

/** Vibe suggests 8-12 hashtags (without #) for a post. */
export const suggestHashtags = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    const dossier = await loadDossierContext(data.workspace_id);
    const sys = `You are Vibe, suggesting hashtags for a ${data.platform ?? "instagram"} post.
${dossier}
If a WORKSPACE DOSSIER is provided, anchor the niche tags to the brand's actual audience, services and category from the dossier.
Return ONLY a JSON array of 8-12 lowercase hashtags WITHOUT the # symbol.
Mix 3 broad + 5 niche + 2 micro tags. No banned, spammy, or shadow-flagged terms.
Niche context: ${data.niche ?? "creator marketing"}.`;

    const json = await aiChat({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: data.caption || "Generic creator-marketing content." },
      ],
      response_format: { type: "json_object" },
    });
    const raw = json.choices?.[0]?.message?.content ?? "[]";
    let tags: unknown[] = [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) tags = parsed;
      else if (parsed && typeof parsed === "object") {
        const obj = parsed as { hashtags?: unknown; tags?: unknown };
        tags = Array.isArray(obj.hashtags) ? obj.hashtags : Array.isArray(obj.tags) ? obj.tags : [];
      }
    } catch {
      tags = raw.match(/[a-z0-9_]+/gi) ?? [];
    }
    const hashtags = tags
      .map((t) => String(t).replace(/^#/, "").toLowerCase())
      .filter(Boolean)
      .slice(0, 12);
    return { hashtags };
  });
