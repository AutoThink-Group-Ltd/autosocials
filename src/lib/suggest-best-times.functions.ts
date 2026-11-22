// Returns recommended best post times per platform for a workspace.
// First call seeds heuristic defaults into best_post_times.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";

// Industry-baseline best slots (UTC, day=0=Sun .. 6=Sat, hour 0-23) — seed only.
const HEURISTICS: Record<string, { day: number; hour: number; score: number }[]> = {
  instagram: [
    { day: 1, hour: 11, score: 0.95 }, { day: 2, hour: 13, score: 0.92 },
    { day: 3, hour: 11, score: 0.94 }, { day: 4, hour: 14, score: 0.9 },
    { day: 5, hour: 10, score: 0.88 }, { day: 0, hour: 19, score: 0.82 },
  ],
  facebook: [
    { day: 1, hour: 9, score: 0.9 }, { day: 2, hour: 13, score: 0.93 },
    { day: 3, hour: 14, score: 0.95 }, { day: 4, hour: 13, score: 0.92 },
    { day: 5, hour: 11, score: 0.85 },
  ],
  tiktok: [
    { day: 2, hour: 9, score: 0.92 }, { day: 2, hour: 19, score: 0.88 },
    { day: 3, hour: 12, score: 0.95 }, { day: 4, hour: 7, score: 0.86 },
    { day: 5, hour: 15, score: 0.9 }, { day: 6, hour: 11, score: 0.84 },
  ],
};

const Input = z.object({
  workspace_id: z.string().min(1),
  platforms: z.array(z.string()).optional(),
});

export const suggestBestTimes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    const admin = getAdminClient();
    const wanted = data.platforms && data.platforms.length ? data.platforms : Object.keys(HEURISTICS);

    for (const platform of wanted) {
      const { count } = await admin
        .from("best_post_times")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspace_id)
        .eq("platform", platform);
      if ((count ?? 0) === 0) {
        const seed = (HEURISTICS[platform] ?? []).map((s) => ({
          workspace_id: data.workspace_id,
          platform,
          day_of_week: s.day,
          hour: s.hour,
          score: s.score,
          source: "heuristic",
        }));
        if (seed.length) await admin.from("best_post_times").insert(seed);
      }
    }

    const { data: slots } = await admin
      .from("best_post_times")
      .select("platform, day_of_week, hour, score, source")
      .eq("workspace_id", data.workspace_id)
      .in("platform", wanted)
      .order("score", { ascending: false });

    return { slots: slots ?? [] };
  });
