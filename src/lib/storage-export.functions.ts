import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";

const pageInput = z.object({
  bucket: z.string().min(1).max(100),
  path: z.string().max(1024).default(""),
  offset: z.number().int().min(0).max(10_000_000).default(0),
});

async function requireSuperAdmin() {
  const user = await requireUser();
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error || !data) throw new Error("Only super admins can export Storage.");
  return admin;
}

/** Lists source buckets for the authenticated super admin. */
export const listStorageExportBuckets = createServerFn({
  method: "POST",
}).handler(async () => {
  const admin = await requireSuperAdmin();
  const { data, error } = await admin.storage.listBuckets();
  if (error)
    throw new Error(`Could not list Storage buckets: ${error.message}`);
  return (data ?? []).map(({ id, name, public: isPublic }) => ({
    id,
    name,
    public: isPublic,
  }));
});

/** Lists one bounded page and signs its files; the service key never leaves the server. */
export const getStorageExportPage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => pageInput.parse(input))
  .handler(async ({ data }) => {
    const admin = await requireSuperAdmin();
    const { data: buckets, error: bucketError } =
      await admin.storage.listBuckets();
    if (bucketError)
      throw new Error(
        `Could not verify Storage bucket: ${bucketError.message}`,
      );
    if (!(buckets ?? []).some((bucket) => bucket.name === data.bucket))
      throw new Error("Storage bucket not found.");
    if (
      data.path.split("/").some((part) => part === "..") ||
      data.path.startsWith("/")
    )
      throw new Error("Invalid Storage path.");

    const { data: entries, error } = await admin.storage
      .from(data.bucket)
      .list(data.path, {
        limit: 100,
        offset: data.offset,
        sortBy: { column: "name", order: "asc" },
      });
    if (error)
      throw new Error(`Could not list ${data.bucket}: ${error.message}`);

    const folders: string[] = [];
    const pendingFiles: {
      path: string;
      name: string;
      size: number;
      contentType: string | null;
    }[] = [];
    for (const entry of entries ?? []) {
      const fullPath = data.path ? `${data.path}/${entry.name}` : entry.name;
      if (!entry.id && !entry.metadata) {
        folders.push(fullPath);
        continue;
      }
      pendingFiles.push({
        path: fullPath,
        name: entry.name,
        size:
          typeof entry.metadata?.size === "number" ? entry.metadata.size : 0,
        contentType:
          typeof entry.metadata?.mimetype === "string"
            ? entry.metadata.mimetype
            : null,
      });
    }
    const files: ((typeof pendingFiles)[number] & { signedUrl: string })[] = [];
    if (pendingFiles.length) {
      const { data: signedFiles, error: signError } = await admin.storage
        .from(data.bucket)
        .createSignedUrls(
          pendingFiles.map((file) => file.path),
          86400,
          { download: true },
        );
      if (
        signError ||
        !signedFiles ||
        signedFiles.length !== pendingFiles.length ||
        signedFiles.some((file) => !file.signedUrl)
      ) {
        throw new Error(`Could not prepare downloads for ${data.bucket}.`);
      }
      for (let i = 0; i < pendingFiles.length; i++)
        files.push({
          ...pendingFiles[i]!,
          signedUrl: signedFiles[i]!.signedUrl!,
        });
    }
    return { folders, files, count: entries?.length ?? 0, pageSize: 100 };
  });
