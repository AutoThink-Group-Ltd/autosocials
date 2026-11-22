// Loads the workspace Dossier — the authoritative brand/business context
// that every Vibe skill must honour when planning, drafting, or acting.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const MAX_TOTAL_CHARS = 18000; // hard cap injected into prompts

export async function loadDossierContext(workspaceId?: string | null): Promise<string> {
  if (!workspaceId) return "";
  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await supa
      .from("dossier_documents")
      .select("title,content,updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (error || !data || data.length === 0) return "";

    let total = 0;
    const parts: string[] = [];
    for (const d of data) {
      const body = (d.content || "").trim();
      if (!body) continue;
      const block = `\n### ${d.title}\n${body}\n`;
      if (total + block.length > MAX_TOTAL_CHARS) {
        parts.push(`\n### ${d.title}\n${body.slice(0, Math.max(0, MAX_TOTAL_CHARS - total - 200))}\n…(truncated)\n`);
        break;
      }
      parts.push(block);
      total += block.length;
    }
    if (parts.length === 0) return "";

    return `
## WORKSPACE DOSSIER (AUTHORITATIVE)
The following documents are the workspace's source of truth — business model,
brand voice, ICP, offers, internal knowledge. Treat these as the highest
authority when planning, drafting, recommending, or acting. If a request
conflicts with the dossier, follow the dossier and surface the conflict to
the user. Never contradict the dossier. Never invent facts not supported by it.
${parts.join("")}
## END DOSSIER
`;
  } catch (e) {
    console.error("loadDossierContext failed:", e);
    return "";
  }
}