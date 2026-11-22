import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { saveTilesInput, tileDraftsInput } from "./social-tile-storage";

const save = createServerOnlyFn(async (input: unknown) => {
  const data = saveTilesInput.parse(input);
  const { requireUser } = await import("./supabase-admin.server");
  const { saveTilesForUser } = await import("./social-tile-storage.server");
  const user = await requireUser();
  return saveTilesForUser(user.id, data);
});
const drafts = createServerOnlyFn(async (input: unknown) => {
  const data = tileDraftsInput.parse(input);
  const { requireUser } = await import("./supabase-admin.server");
  const { createTileDraftsForUser } =
    await import("./social-tile-storage.server");
  const user = await requireUser();
  return createTileDraftsForUser(user.id, data);
});
export const saveSocialTiles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => saveTilesInput.parse(input))
  .handler(({ data }) => save(data));
export const createSocialTileDrafts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tileDraftsInput.parse(input))
  .handler(({ data }) => drafts(data));
