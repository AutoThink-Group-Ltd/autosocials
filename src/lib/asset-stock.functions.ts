import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./supabase-admin.server";
export const getAssetStockStatus = createServerFn({ method: "POST" }).inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(input)).handler(async ({ data }) => {
  const user = await requireUser(); const { stockStatusForUser } = await import("./asset-stock.server"); return stockStatusForUser(user.id, data.workspace_id);
});
export const searchAssetStock = createServerFn({ method: "POST" }).inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid(), query: z.string().trim().min(2).max(180) }).parse(input)).handler(async ({ data }) => {
  const user = await requireUser(); const { searchStockForUser } = await import("./asset-stock.server"); return searchStockForUser(user.id, data.workspace_id, data.query);
});
export const licenseAssetStock = createServerFn({ method: "POST" }).inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid(), image_id: z.string().regex(/^\d+$/), confirmed: z.literal(true) }).parse(input)).handler(async ({ data }) => {
  const user = await requireUser(); const { licenseStockForUser } = await import("./asset-stock.server"); return licenseStockForUser(user.id, data.workspace_id, data.image_id);
});
