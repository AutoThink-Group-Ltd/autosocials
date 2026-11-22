import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import {
  saveTileDesignInput,
  tileDesignKey,
  tileDesignListInput,
} from "./tile-design-draft";
const save = createServerOnlyFn(async (input: unknown) => {
  const data = saveTileDesignInput.parse(input);
  const { requireUser } = await import("./supabase-admin.server");
  return (await import("./tile-design-draft.server")).saveTileDesignForUser(
    (await requireUser()).id,
    data,
  );
});
const get = createServerOnlyFn(async (input: unknown) => {
  const data = tileDesignKey.parse(input);
  const { requireUser } = await import("./supabase-admin.server");
  return (await import("./tile-design-draft.server")).getTileDesignForUser(
    (await requireUser()).id,
    data.workspace_id,
    data.id,
  );
});
const list = createServerOnlyFn(async (input: unknown) => {
  const data = tileDesignListInput.parse(input);
  const { requireUser } = await import("./supabase-admin.server");
  return (await import("./tile-design-draft.server")).listTileDesignsForUser(
    (await requireUser()).id,
    data.workspace_id,
  );
});
const logo = createServerOnlyFn(async (input: unknown) => {
  const data = tileDesignListInput.parse(input);
  const { requireUser } = await import("./supabase-admin.server");
  return (
    (await (
      await import("./tile-design-draft.server")
    ).getDesignLogoForUser((await requireUser()).id, data.workspace_id)) ?? null
  );
});
export const saveTileDesignDraft = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => saveTileDesignInput.parse(input))
  .handler(({ data }) => save(data));
export const getTileDesignDraft = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tileDesignKey.parse(input))
  .handler(({ data }) => get(data));
export const listTileDesignDrafts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tileDesignListInput.parse(input))
  .handler(({ data }) => list(data));
export const getDesignLogo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tileDesignListInput.parse(input))
  .handler(({ data }) => logo(data));
