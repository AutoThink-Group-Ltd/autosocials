import prompt from "../../prompts/profile-dna.txt?raw";
import { getAdminClient } from "./supabase-admin.server";
import { personalLinkedIn, profileDirectionSchema, profileDnaSchema } from "./profile-dna";

type Admin = ReturnType<typeof getAdminClient>;
const kind = "lead-profile-dna";

export async function buildLeadProfileDna(admin: Admin, workspaceId: string, profileUrl: string, excerpt: string, refresh: boolean, personalWorkspace = false) {
  const workspace = await admin.from("workspaces").select("name,contact_name,website,social_profiles").eq("id", workspaceId).single();
  if (workspace.error || personalLinkedIn(workspace.data?.social_profiles) !== profileUrl) return;
  const name = workspace.data.contact_name?.trim() || (personalWorkspace ? workspace.data.name : "LinkedIn profile");
  const profile = excerpt.match(/^Profile context: (.+)$/m)?.[1] ?? "";
  const posts = excerpt.split(/(?=^- (?:\S+|Date unavailable) https:\/\/)/m).slice(1, 21).flatMap((section) => {
    const url = section.match(/^- (?:\S+|Date unavailable) (https:\/\/\S+)/)?.[1];
    const caption = section.split("  Attribution: authored\n")[1]?.split(/\n  (?:Visual observation|Media cache)/)[0]?.trim();
    return url && caption ? [{ url, caption: caption.slice(0, 1200) }] : [];
  });
  const input = { version: 2, name, profileUrl, profile, posts, website: workspace.data.website, retryDay: refresh ? new Date().toISOString().slice(0, 10) : null };
  const [{ runBrandOperation }, { aiChat }] = await Promise.all([import("./brand-assets.functions"), import("./dossier.server")]);
  await runBrandOperation(admin, workspaceId, kind, input, async () => {
    const response = await aiChat({
      model: "gpt-6.1-terra",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify({ name, profile, posts: posts.map((post, i) => ({ number: i + 1, caption: post.caption })) }) },
      ],
    });
    const result = profileDirectionSchema.parse(JSON.parse(response.choices?.[0]?.message?.content ?? "null"));
    const exact = (fact: typeof result.role) => fact && profile.includes(fact.quote) && fact.quote.includes(fact.value) ? fact.value : null;
    return profileDnaSchema.parse({
      sourceUrl: profileUrl, name, companyWebsite: workspace.data.website, role: exact(result.role), employer: exact(result.employer), profileRead: !!profile,
      postCount: posts.length, topics: result.observedTopics.flatMap(({ topic, post }) => posts[post - 1] ? [{ topic, url: posts[post - 1]!.url }] : []),
      voice: result.voice, positioning: result.positioning, interpretation: result.interpretation, palette: result.palette, tiles: result.tiles,
    });
  });
}

export async function readLeadProfileDna(admin: Admin, workspaceId: string, profileUrl: string) {
  const db = admin as unknown as import("@supabase/supabase-js").SupabaseClient;
  const rows = await db.from("brand_work_operations").select("status,result,updated_at").eq("workspace_id", workspaceId)
    .eq("kind", kind).order("updated_at", { ascending: false }).limit(10);
  if (rows.error) throw new Error("Could not load Profile DNA.");
  const reports = (rows.data ?? []).filter((row) => row.status === "complete")
    .map((row) => profileDnaSchema.safeParse(row.result));
  const current = reports.find((report) => report.success && report.data.sourceUrl === profileUrl);
  const latest = rows.data?.[0];
  const status = latest?.status === "running" && Date.now() - Date.parse(latest.updated_at) > 20 * 60_000 ? "failed" : latest?.status ?? "pending";
  return { dna: current?.success ? current.data : null, status: String(status) };
}

export async function workspaceProfileContext(admin: Admin, workspaceId: string, socialProfiles: unknown) {
  const url = personalLinkedIn(socialProfiles);
  if (!url) return null;
  return readLeadProfileDna(admin, workspaceId, url);
}
