import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./supabase-admin.server";
const base = z.object({ workspace_id: z.string().uuid(), batch_id: z.string().uuid() });
export const AssetCreationSaveInput = base.extend({ recipe_id: z.enum(["branded-motion", "illustrated-explainer", "cinematic-ad", "reaction-demo"]), file_ids: z.array(z.string().uuid()).max(20), deferred: z.boolean().default(false), alternative: z.literal("graphics").optional(), music_file_id: z.string().uuid().optional(), music_rights_confirmed: z.boolean().optional(), duration: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(), size: z.enum(["1080x1920", "1080x1080", "1080x1350", "1920x1080"]).optional(), captions: z.enum(["clean", "off"]).optional(), voice: z.string().max(128).optional(), note: z.string().max(300).optional() }).strict();
export const getAssetCreation = createServerFn({ method: "POST" }).inputValidator((i: unknown) => base.parse(i)).handler(async ({ data }) => {
  const user = await requireUser(); const { loadAssetCreation } = await import("./asset-creation.server"); return loadAssetCreation(user.id, data.workspace_id, data.batch_id);
});
export const saveAssetCreation = createServerFn({ method: "POST" }).inputValidator((i: unknown) => AssetCreationSaveInput.parse(i)).handler(async ({ data }) => {
  const user = await requireUser(); const { persistAssetCreation } = await import("./asset-creation.server"); return persistAssetCreation(user.id, data);
});

export const recommendAssetCreation = createServerFn({ method: "POST" }).inputValidator((i: unknown) => base.extend({ recipe_id: z.enum(["branded-motion", "illustrated-explainer", "cinematic-ad", "reaction-demo"]) }).parse(i)).handler(async ({ data }) => {
  const user = await requireUser(); const { recommendAssetFiles } = await import("./asset-creation.server"); return recommendAssetFiles(user.id, data.workspace_id, data.batch_id, data.recipe_id);
});
