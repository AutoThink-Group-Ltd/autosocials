import { getCreativeDnaKit } from "@/lib/brand-dna.functions";
import { loadCanvasDna, type CanvasDna } from "./canvas-brand-dna";
import { DesignQuotation } from "./DesignQuotation";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import type { TilePlan } from "@/lib/social-tiles";
import {
  generateSocialTileImage,
  checkSocialTileImage,
  getSocialTileImage,
  quoteSocialTileImage,
} from "@/lib/social-tile-image.functions";
import {
  saveSocialTiles,
  createSocialTileDrafts,
} from "@/lib/social-tile-storage.functions";
import { renderSocialDesign } from "./render-social-design";
import { designEntrySchema, type DesignEntry } from "@/lib/tile-design-draft";
import { useDesignDraft, useDesignLogo } from "./use-design-draft";
import { DesignReferencePicker } from "./DesignReferencePicker";

type Tile = TilePlan["tiles"][number];
type Entry = DesignEntry;
const button =
  "rounded-lg border border-border-control px-4 py-2 text-sm font-semibold disabled:opacity-50";
const field = "w-full rounded-lg border border-border-control bg-surface p-2";

function Preview({
  tile,
  brand,
  url,
  logoUrl,
  dna,
}: {
  tile: Tile;
  brand: string;
  url?: string | undefined;
  logoUrl?: string | undefined;
  dna?: CanvasDna | undefined;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [previewError, setPreviewError] = useState(false);
  useEffect(() => {
    let active = true;
    setPreviewError(false);
    const target = ref.current;
    if (target && tile.design) {
      const temporary = document.createElement("canvas");
      void renderSocialDesign(temporary, {
        headline: tile.headline,
        supporting: tile.supporting,
        design: tile.design,
        ...(tile.quote ? { quote: tile.quote } : {}),
        ...(url ? { artworkUrl: url } : {}),
        ...(logoUrl ? { logoUrl } : {}),
        brand, dna,
      })
        .then(() => {
          if (!active) return;
          target.width = temporary.width;
          target.height = temporary.height;
          target.getContext("2d")?.drawImage(temporary, 0, 0);
        })
        .catch(() => {
          if (active) {
            target.width = target.width;
            setPreviewError(true);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [tile, brand, url, logoUrl, dna]);
  return (
    <>
      <canvas
        ref={ref}
        className="w-full rounded-lg"
        aria-label={`Preview: ${tile.headline}`}
      />
      {previewError && <p role="alert">Could not draw this design preview.</p>}
    </>
  );
}

type EditorProps = {
  workspaceId: string;
  plan: TilePlan;
  storageKey?: string;
  onBack: () => void;
  designId?: string;
  initialEntries?: DesignEntry[];
  initialVersion?: string;
};

export function SocialDesignEditor(props: EditorProps) {
  const key = props.storageKey ?? "as:postcard-tile-run:" + props.workspaceId;
  const original = JSON.stringify(props.plan);
  const [restored, setRestored] = useState<{
    key: string;
    original: string;
    entries?: DesignEntry[];
    designId?: string;
    version?: string;
  } | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (
        saved?.workspaceId === props.workspaceId &&
        JSON.stringify(saved.originalPlan) === original
      ) {
        const entries = designEntrySchema
          .array()
          .min(1)
          .max(5)
          .safeParse(saved.designEntries);
        if (entries.success) {
          setRestored({
            key,
            original,
            entries: entries.data,
            designId: saved.designId,
            version: saved.version,
          });
          return;
        }
      }
    } catch {
      /* The server plan is usable without a browser checkpoint. */
    }
    setRestored({ key, original });
  }, [key, props.workspaceId, original]);
  if (!restored || restored.key !== key || restored.original !== original)
    return <p role="status">Opening design…</p>;
  const entries = props.initialEntries ?? restored.entries;
  const id = props.designId ?? restored.designId;
  const version = props.initialVersion ?? restored.version;
  return (
    <TileEditor
      key={key + original}
      {...props}
      storageKey={key}
      {...(entries ? { initialEntries: entries } : {})}
      {...(id ? { designId: id } : {})}
      {...(version ? { initialVersion: version } : {})}
    />
  );
}

function TileEditor({
  workspaceId,
  plan,
  storageKey: key,
  onBack,
  designId,
  initialEntries,
  initialVersion,
}: EditorProps & { storageKey: string }) {
  const designDraft = useDesignDraft(workspaceId, designId, initialVersion);
  const logo = useDesignLogo(plan.standalone ? "" : workspaceId);
  const dnaKit=useServerFn(getCreativeDnaKit);
  const dnaPreview=useQuery({queryKey:["tile-design-dna",workspaceId],enabled:!plan.standalone,queryFn:async()=>loadCanvasDna(await dnaKit({data:{workspaceId,format:"tile"}})),staleTime:60000});
  const generate = useServerFn(generateSocialTileImage),
    check = useServerFn(checkSocialTileImage),
    get = useServerFn(getSocialTileImage),
    quote = useServerFn(quoteSocialTileImage),
    save = useServerFn(saveSocialTiles),
    draft = useServerFn(createSocialTileDrafts);
  const [entries, setEntries] = useState<Entry[]>(() => {
    if (initialEntries) return initialEntries;
    return plan.tiles.map((tile) => ({
      tile,
      requestId: tile.artwork?.requestId ?? crypto.randomUUID(),
      postId: crypto.randomUUID(),
      ...(tile.artwork?.fileId ? { fileId: tile.artwork.fileId } : {}),
      status: tile.artwork?.fileId ? "ready" : "not_started",
    }));
  });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const pricing = useQuery({
    queryKey: ["tile-artwork-quote", workspaceId],
    queryFn: () => quote({ data: { workspace_id: workspaceId } }),
    retry: false,
  });
  const persist = (next: Entry[]) => {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        workspaceId,
        originalPlan: plan,
        plan: { ...plan, tiles: next.map((e) => e.tile) },
        designId: designDraft.id,
        version: designDraft.version.current,
        designEntries: next,
      }),
    );
    setEntries(next);
  };
  useEffect(() => {
    let active = true;
    void Promise.all(
      entries
        .filter((e) => e.fileId && !urls[e.fileId])
        .map(async (e) => {
          const image = await get({
            data: { workspace_id: workspaceId, file_id: e.fileId! },
          });
          return [e.fileId!, image.data_url] as const;
        }),
    )
      .then((items) => {
        if (active && items.length)
          setUrls((old) => ({ ...old, ...Object.fromEntries(items) }));
      })
      .catch(() => {
        if (active)
          setMessage("Could not load saved artwork. Try reopening the design.");
      });
    return () => {
      active = false;
    };
  }, [entries, get, workspaceId]);
  const update = (i: number, fn: (e: Entry) => Entry) =>
    persist(entries.map((e, n) => (n === i ? fn(e) : e)));
  const run = async (
    i: number,
    statusOnly: boolean,
    regenerate = false,
    source = entries,
    batch = false,
  ): Promise<Entry[]> => {
    const entry = source[i]!;
    if (!entry.tile.design || (!statusOnly && !pricing.data)) return source;
    if (!batch) setBusy(true);
    setMessage("");
    let next = [...source];
    try {
      const requestId = regenerate ? crypto.randomUUID() : entry.requestId;
      next[i] = {
        ...entry,
        requestId,
        dnaJobId: entry.dnaJobId ?? entry.requestId,
        status: "pending",
      };
      persist(next);
      await designDraft.save({ ...plan, tiles: next.map((e) => e.tile) }, next);
      persist(next);
      const result = statusOnly
        ? await check({
            data: { workspace_id: workspaceId, request_id: requestId },
          })
        : await generate({
            data: {
              workspace_id: workspaceId,
              request_id: requestId,
              ...(plan.standalone ? { standalone: true as const } : { identity: {format:"tile" as const,job_id:entry.dnaJobId ?? entry.requestId} }),
              expected_credits: pricing.data!.credits,
              expected_rate_id: pricing.data!.rateId,
              prompt: `Create original artwork with no text, lettering, logos or watermark. ${entry.tile.direction ?? ""} Topic: ${entry.tile.headline}. ${entry.tile.supporting}`,
              design: entry.tile.design,
            },
          });
      if (result.status === "ready") {
        next[i] = {
          ...next[i]!,
          fileId: result.file_id,
          status: "ready",
          tile: {
            ...entry.tile,
            artwork: { requestId, fileId: result.file_id },
          },
        };
        setUrls((old) => ({ ...old, [result.file_id]: result.data_url }));
      } else next[i] = { ...next[i]!, status: result.status };
      persist(next);
      await designDraft.save({ ...plan, tiles: next.map((e) => e.tile) }, next);
      persist(next);
      setMessage(
        result.status === "ready"
          ? "Artwork is ready."
          : result.status === "not_found"
            ? "No request was found; you can create artwork."
            : "message" in result
              ? result.message
              : "Check this request again before retrying.",
      );
    } catch {
      setMessage(
        "Could not confirm the request. Check its status before starting another.",
      );
    } finally {
      if (!batch) setBusy(false);
    }
    return next;
  };
  const exportTile = async (
    i: number,
    action: "download" | "save" | "draft",
  ) => {
    const e = entries[i]!;
    if (!e.tile.design) return;
    setBusy(true);
    setMessage("");
    try {
      if (
        e.tile.design.treatment === "illustration" &&
        (!e.fileId || !urls[e.fileId])
      )
        throw new Error("Create or load the artwork first.");
      const dna=plan.standalone ? undefined : await loadCanvasDna(await dnaKit({data:{workspaceId,format:"tile",jobId:e.dnaJobId ?? e.requestId}}));
      const canvas = document.createElement("canvas");
      await renderSocialDesign(canvas, {
        dna,
        headline: e.tile.headline,
        supporting: e.tile.supporting,
        design: e.tile.design,
        ...(e.tile.quote ? { quote: e.tile.quote } : {}),
        ...(e.fileId && urls[e.fileId] ? { artworkUrl: urls[e.fileId] } : {}),
        ...(logo ? { logoUrl: logo } : {}),
        brand: plan.brand,
      });
      if (action === "download") {
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `social-tile-${i + 1}.png`;
        a.click();
        return;
      }
      const encoded = canvas.toDataURL("image/jpeg", 0.9).split(",")[1]!;
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(encoded),
      );
      const signature = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const reuse = signature === e.savedSignature && !!e.savedFileId;
      const id = reuse ? e.savedFileId! : crypto.randomUUID();
      const postId = reuse ? e.postId : crypto.randomUUID();
      const next = entries.map((item, n) =>
        n === i
          ? { ...item, savedSignature: signature, savedFileId: id, postId }
          : item,
      );
      await designDraft.save(
        { ...plan, tiles: next.map((entry) => entry.tile) },
        next,
      );
      persist(next);
      const result = await save({
        data: {
          workspace_id: workspaceId,
          tiles: [
            {
              id,
              headline: e.tile.headline,
              mime: "image/jpeg",
              image_base64: encoded,
            },
          ],
        },
      });
      if (!result.results[0]?.ok) throw new Error("Could not save the tile.");
      if (action === "draft") {
        const result = await draft({
          data: {
            workspace_id: workspaceId,
            tiles: [
              {
                file_id: id,
                post_id: postId,
                caption: [e.tile.headline, e.tile.supporting]
                  .filter(Boolean)
                  .join("\n\n"),
              },
            ],
          },
        });
        if (!result.results[0]?.ok)
          throw new Error(
            "Tile saved, but the publishing draft could not be created.",
          );
      }
      setMessage(
        action === "draft"
          ? "Tile saved and draft prepared in Publish."
          : "Tile saved in Brand assets.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not export this tile.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-5" aria-label="Design selected social tiles">
      <h2 className="font-display text-2xl font-bold">
        Edit your social tiles
      </h2>
      <p className="text-sm text-muted-foreground">
        Edit the copy and design, then create artwork or save your finished
        tile.
      </p>
      <button className={button} onClick={onBack} disabled={busy}>
        Back to narratives
      </button>
      <button
        className={button}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void designDraft
            .save({ ...plan, tiles: entries.map((e) => e.tile) }, entries)
            .then(() => {
              persist(entries);
              setMessage("Editable design saved.");
            })
            .catch(() => setMessage("Could not save the editable design."))
            .finally(() => setBusy(false));
        }}
      >
        Save editable design
      </button>
      {pricing.data && (
        <p className="text-sm font-semibold">
          Create missing artwork:{" "}
          {entries.filter(
            (e) =>
              e.tile.design?.treatment === "illustration" &&
              ["not_started", "not_found"].includes(e.status),
          ).length * pricing.data.credits}{" "}
          credits total
        </p>
      )}
      <button
        className={button}
        disabled={
          busy ||
          !pricing.data ||
          !entries.some(
            (e) =>
              e.tile.design?.treatment === "illustration" &&
              ["not_started", "not_found"].includes(e.status),
          )
        }
        onClick={() => {
          setBusy(true);
          void (async () => {
            let next = entries;
            for (let i = 0; i < next.length; i++) {
              const e = next[i]!;
              if (
                e.tile.design?.treatment === "illustration" &&
                ["not_started", "not_found"].includes(e.status)
              ) {
                next = await run(i, false, false, next, true);
                if (next[i]!.status !== "ready") break;
              }
            }
          })().finally(() => setBusy(false));
        }}
      >
        Create missing artwork
      </button>
      {message && <p role="status">{message}</p>}
      {entries.map((entry, i) => {
        const d = entry.tile.design;
        if (!d) return null;
        const edit = (patch: Partial<Tile>) =>
          update(i, (e) => ({ ...e, tile: { ...e.tile, ...patch } }));
        const design = (patch: Partial<typeof d>) =>
          edit({ design: { ...d, ...patch } });
        return (
          <article
            key={i}
            className="grid gap-4 rounded-xl border border-border-control p-4 md:grid-cols-2"
          >
            <fieldset disabled={busy} className="space-y-3">
              <label className="block text-sm">
                Headline
                <input
                  className={field}
                  maxLength={80}
                  value={entry.tile.headline}
                  onChange={(e) => edit({ headline: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Supporting copy
                <textarea
                  className={field}
                  maxLength={120}
                  value={entry.tile.supporting}
                  onChange={(e) => edit({ supporting: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Format
                <select
                  className={field}
                  value={d.aspect}
                  onChange={(e) =>
                    design({ aspect: e.target.value as typeof d.aspect })
                  }
                >
                  <option value="square">Square</option>
                  <option value="portrait">Portrait</option>
                </select>
              </label>
              <label className="block text-sm">
                Treatment
                <select
                  className={field}
                  value={d.treatment}
                  onChange={(e) =>
                    design({ treatment: e.target.value as typeof d.treatment })
                  }
                >
                  <option value="illustration">Illustration</option>
                  <option value="typography">Typography</option>
                </select>
              </label>
              <label className="block text-sm">
                Composition
                <select
                  className={field}
                  value={d.composition}
                  onChange={(e) =>
                    design({
                      composition: e.target.value as typeof d.composition,
                    })
                  }
                >
                  <option value="top">Top</option>
                  <option value="right">Right</option>
                  <option value="full">Full</option>
                </select>
              </label>
              <label className="block text-sm">
                Typeface
                <select
                  className={field}
                  value={d.typeface}
                  onChange={(e) =>
                    design({ typeface: e.target.value as typeof d.typeface })
                  }
                >
                  <option value="sans">Sans</option>
                  <option value="serif">Serif</option>
                  <option value="condensed">Condensed</option>
                </select>
              </label>
              <label className="block text-sm">
                Paper{" "}
                <input
                  type="color"
                  value={d.paper ?? "#171717"}
                  onChange={(e) => design({ paper: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Ink{" "}
                <input
                  type="color"
                  value={d.ink ?? "#ffffff"}
                  onChange={(e) => design({ ink: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Accent
                <input
                  type="color"
                  value={d.accent}
                  onChange={(e) => design({ accent: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Emphasis
                <input
                  className={field}
                  value={d.emphasis}
                  onChange={(e) => design({ emphasis: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Artwork direction
                <textarea
                  className={field}
                  maxLength={300}
                  value={d.medium}
                  onChange={(e) => design({ medium: e.target.value })}
                />
              </label>
              <DesignReferencePicker
                workspaceId={workspaceId}
                value={d.referenceIds ?? []}
                onChange={(referenceIds) => design({ referenceIds })}
              />
              {entry.tile.quoteNotice && (
                <p className="text-sm">{entry.tile.quoteNotice}</p>
              )}
              <DesignQuotation
                workspaceId={workspaceId}
                quote={entry.tile.quote}
                onChange={(quote) => edit({ quote, quoteNotice: undefined })}
              />
            </fieldset>
            <div className="space-y-3">
              <Preview
                tile={entry.tile}
                brand={plan.brand}
                dna={plan.standalone ? undefined : dnaPreview.data}
                logoUrl={logo}
                url={entry.fileId ? urls[entry.fileId] : undefined}
              />
              {d.treatment === "illustration" && (
                <>
                  <p className="text-sm">
                    {pricing.data
                      ? `Artwork: ${pricing.data.credits} credits per request`
                      : "Checking artwork price…"}
                  </p>
                  {["pending", "reconciliation_required"].includes(
                    entry.status,
                  ) ? (
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() => void run(i, true)}
                    >
                      Check artwork status
                    </button>
                  ) : (
                    <button
                      className={button}
                      disabled={busy || !pricing.data}
                      onClick={() =>
                        void run(i, false, entry.status === "ready")
                      }
                    >
                      {entry.status === "ready"
                        ? "Regenerate artwork"
                        : "Create artwork"}
                    </button>
                  )}
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className={button}
                  disabled={busy || !entry.tile.headline.trim()}
                  onClick={() => void exportTile(i, "download")}
                >
                  Download
                </button>
                <button
                  className={button}
                  disabled={busy || !entry.tile.headline.trim()}
                  onClick={() => void exportTile(i, "save")}
                >
                  Save tile
                </button>
                <button
                  className={button}
                  disabled={busy || !entry.tile.headline.trim()}
                  onClick={() => void exportTile(i, "draft")}
                >
                  Prepare publishing draft
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
