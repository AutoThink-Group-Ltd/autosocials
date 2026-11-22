import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  getBrandDna,
  rebuildBrandDna,
  editBrandDna,
  retryBrandDnaTiles,
  importBrandDna,
  prepareBrandDnaImport,
  adoptBrandDna,
} from "@/lib/brand-dna.functions";
import {
  hasCustomShowcase,
  showcaseNeedsReview,
  usesAutoTillShowcase,
} from "@/lib/brand-dna";
import type {
  BrandDnaView,
  DnaAsset,
  DnaEdits,
  DnaEvidence,
} from "@/lib/brand-dna";
import { cn } from "@/lib/utils";

const sections = [
  "Overview",
  "Colour",
  "Typography",
  "Imagery",
  "Voice",
  "In action",
] as const;
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border-control bg-canvas px-4 text-sm font-medium transition hover:bg-surface-subtle disabled:opacity-50";
const primary = `${button} border-ink bg-ink text-inverse hover:bg-ink-hover`;
const field =
  "w-full rounded-lg border border-border-control bg-canvas px-3 py-2 text-sm text-ink";
const card = "rounded-2xl border border-border bg-canvas";
const validHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
const cleanFont = (value: string) =>
  value.replace(/[^\w\s-]/g, "").slice(0, 80);
function Evidence({ value }: { value: DnaEvidence }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
      <span className="rounded-full bg-surface-subtle px-2 py-1 capitalize">
        {value.status}
      </span>
      <span>
        {value.confidence} confidence · {value.source}
      </span>
      {value.note && <span>· {value.note}</span>}
    </span>
  );
}
function imageUrl(view: BrandDnaView, asset?: DnaAsset) {
  return asset && view.urls[asset.previewPath || asset.path || ""];
}
function AssetImage({
  view,
  asset,
  className,
}: {
  view: BrandDnaView;
  asset?: DnaAsset;
  className?: string;
}) {
  const url = imageUrl(view, asset);
  return url ? (
    <img
      src={url}
      alt={asset?.label || "Brand asset"}
      className={cn("h-full w-full object-contain", className)}
    />
  ) : (
    <div className="flex h-full min-h-28 items-center justify-center text-sm text-text-secondary">
      No preview available
    </div>
  );
}

export function BrandDnaPage() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  const qc = useQueryClient();
  const get = useServerFn(getBrandDna),
    rebuild = useServerFn(rebuildBrandDna),
    edit = useServerFn(editBrandDna),
    retry = useServerFn(retryBrandDnaTiles),
    importPackage = useServerFn(importBrandDna),
    prepareImport = useServerFn(prepareBrandDnaImport),
    adopt = useServerFn(adoptBrandDna);
  const [page, setPage] = useState(0),
    [asset, setAsset] = useState<DnaAsset | null>(null),
    [tile, setTile] = useState<number | null>(null),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [website, setWebsite] = useState("");
  const [subpage, setSubpage] = useState(0);
  useEffect(() => {
    setSubpage(0);
  }, [page, ws]);
  const [overviewDetails, setOverviewDetails] = useState(false);
  const [colourDetails, setColourDetails] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [changes, setChanges] = useState<DnaEdits>({});
  const [personalityText, setPersonalityText] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setPage(0);
    setAsset(null);
    setTile(null);
    setEditing(false);
    setComparing(false);
    setOverviewDetails(false);
    setColourDetails(false);
    setChanges({});
    setPersonalityText("");
  }, [ws]);
  const query = useQuery({
    queryKey: ["brand-dna", ws],
    enabled: !!ws,
    queryFn: () => get({ data: { workspaceId: ws! } }),
    refetchInterval: (q) =>
      (q.state.data?.run &&
        ["queued", "running"].includes(q.state.data.run.status)) ||
      q.state.data?.tiles.some((t) => ["queued", "running"].includes(t.status))
        ? 3000
        : false,
  });
  const view = query.data,
    dna = view?.version?.dna;
  useEffect(() => {
    setWebsite(view?.website || "");
  }, [view?.website]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["brand-dna", ws] });
  const act = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast.success(success);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const start = () =>
    ws &&
    act(
      () =>
        rebuild({
          data: {
            workspaceId: ws,
            ...(website.trim() && website.trim() !== view?.website
              ? { website: website.trim() }
              : {}),
          },
        }),
      "Brand DNA rebuild started",
    );
  const save = () =>
    ws &&
    view?.version &&
    act(async () => {
      await edit({
        data: {
          workspaceId: ws,
          versionId: view.version!.id,
          changes: {
            ...changes,
            personality: personalityText
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          },
        },
      });
      setEditing(false);
    }, "Corrections saved");
  const confirm = () =>
    ws &&
    view?.version &&
    act(
      () =>
        edit({
          data: { workspaceId: ws, versionId: view.version!.id, confirm: true },
        }),
      "Brand DNA approved",
    );
  const onUpload = async (file?: File) => {
    if (!file || !ws) return;
    await act(async () => {
      const prepared = await prepareImport({
        data: { workspaceId: ws, bytes: file.size },
      });
      for (let i = 0; i < prepared.parts.length; i++) {
        const part = prepared.parts[i]!;
        const result = await supabase.storage
          .from("brand-dna-private")
          .uploadToSignedUrl(
            part.path,
            part.token,
            file.slice(i * prepared.partBytes, (i + 1) * prepared.partBytes),
            { contentType: "application/octet-stream", upsert: false },
          );
        if (result.error) throw result.error;
      }
      await importPackage({
        data: { workspaceId: ws, objectPath: prepared.objectPath },
      });
    }, "Brand package imported");
  };
  const fonts = useMemo(
    () =>
      dna?.fonts
        .map((font, i) => {
          const source = dna.assets.find((a) => a.id === font.assetId);
          const url = source && imageUrl(view!, source);
          return url
            ? `@font-face{font-family:'dna-font-${i}';src:url(${JSON.stringify(url)});font-display:swap}`
            : "";
        })
        .join("\n") || "",
    [dna, view],
  );
  if (!ws) return <p className="p-6">Pick a workspace first.</p>;
  const working = view?.run && ["queued", "running"].includes(view.run.status);
  const logo = dna?.assets.find((a) => a.id === dna.logoId);
  const images =
    dna?.assets.filter((a) =>
      [
        "logo",
        "icon",
        "portrait",
        "illustration",
        "product",
        "photo",
        "screenshot",
        "reference",
      ].includes(a.kind),
    ) || [];
  const voiceEntries = dna
    ? (
        [
          ["Voice", dna.voice],
          ["Key messages", dna.messages],
          ["Examples", dna.examples],
          ["Offerings", dna.offerings],
          ["Visual language", dna.visualLanguage],
        ] as const
      ).flatMap(([title, entries]) =>
        entries.map((entry) => ({ title, ...entry })),
      )
    : [];
  const count =
    page === 1
      ? dna?.colours.length || 0
      : page === 2
        ? dna?.fonts.length || 0
        : page === 3
          ? images.length
          : page === 4
            ? voiceEntries.length
            : 0;
  const perPage = page === 1 ? 3 : page === 2 ? 2 : page === 3 ? 4 : 2;
  const pages = Math.max(1, Math.ceil(count / perPage));
  return (
    <main className="min-h-[calc(100dvh-3rem)] bg-surface p-4 text-ink md:p-6">
      {fonts && <style>{fonts}</style>}
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <a
              href="/app/brand-assets"
              className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-ink"
            >
              <ArrowLeft size={13} /> Brand assets
            </a>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
              Brand DNA
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              A living picture of your brand, ready to guide every creation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {view?.canEdit && (
              <>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => upload.current?.click()}
                >
                  <Upload size={16} /> Import ZIP
                </button>
                <input
                  ref={upload}
                  type="file"
                  accept=".zip,application/zip"
                  hidden
                  onChange={(e) => {
                    void onUpload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  className={button}
                  disabled={busy || !!working}
                  onClick={start}
                >
                  <RefreshCw size={16} /> Rebuild
                </button>
              </>
            )}
          </div>
        </div>
        {query.isLoading && (
          <p className="mt-8 text-sm text-text-secondary">
            Loading your brand…
          </p>
        )}
        {query.isError && (
          <p role="alert" className="mt-8 text-sm text-destructive">
            Could not load Brand DNA. Please try again.
          </p>
        )}
        {view && (
          <>
            {(working || view.run?.status === "failed") && (
              <div role="status" className={cn(card, "mt-6 p-5")}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle">
                    {working ? (
                      <LoaderCircle className="animate-spin" size={20} />
                    ) : (
                      <Sparkles size={20} />
                    )}
                  </span>
                  <div>
                    <p className="font-semibold">
                      {working
                        ? "Building your brand DNA"
                        : "The last build needs attention"}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {view.run?.error || view.run?.phase || "Getting started"}
                    </p>
                  </div>
                </div>
                <div
                  className="mt-4 grid grid-cols-4 gap-1"
                  aria-label="Build stages"
                >
                  {["Discover", "Understand", "Design", "Finish"].map(
                    (x, i) => (
                      <div key={x}>
                        <div
                          className={cn(
                            "h-1 rounded-full bg-border",
                            working && "animate-pulse",
                            i === 0 && "bg-ink",
                          )}
                        />
                        <span className="mt-1 block text-[10px] text-text-secondary">
                          {x}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
            {!dna && !working && (
              <div
                className={cn(
                  card,
                  "mt-8 grid gap-8 p-8 md:grid-cols-2 md:p-12",
                )}
              >
                <div>
                  <span className="inline-flex rounded-full bg-surface-subtle p-3">
                    <Sparkles />
                  </span>
                  <h2 className="mt-6 font-display text-2xl font-bold">
                    Let’s get to know your brand.
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-6 text-text-secondary">
                    Start with your website or import a brand package. We’ll
                    bring the visual and verbal details together for you to
                    review.
                  </p>
                </div>
                <div className="self-center">
                  <label
                    className="mb-2 block text-sm font-medium"
                    htmlFor="dna-website"
                  >
                    Website
                  </label>
                  <input
                    id="dna-website"
                    className={field}
                    type="url"
                    placeholder="https://yourbrand.com"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                  <button
                    className={cn(primary, "mt-3 w-full")}
                    disabled={!view.canEdit || busy || !website.trim()}
                    onClick={start}
                  >
                    <Sparkles size={16} /> Build Brand DNA
                  </button>
                  <p className="mt-3 text-xs text-text-secondary">
                    Already have a brand package? Use Import ZIP above.
                  </p>
                </div>
              </div>
            )}
            {dna && (
              <>
                {view.candidate && (
                  <div
                    className={cn(
                      card,
                      "mt-5 flex flex-wrap items-center justify-between gap-3 p-4",
                    )}
                  >
                    <p className="text-sm">
                      A rebuilt identity is ready to compare with your approved
                      version.
                    </p>
                    <button
                      className={button}
                      onClick={() => setComparing(true)}
                    >
                      Compare rebuild
                    </button>
                  </div>
                )}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 font-medium",
                        view.version?.confirmed
                          ? "bg-ink text-inverse"
                          : "bg-surface-subtle",
                      )}
                    >
                      {view.version?.confirmed
                        ? "Approved"
                        : "Ready for review"}
                    </span>
                    <span>
                      Updated{" "}
                      {new Date(view.version!.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {view.downloads && (
                      <>
                        <a
                          className={button}
                          href={view.downloads.json}
                          download
                        >
                          Download JSON
                        </a>
                        <a
                          className={button}
                          href={view.downloads.markdown}
                          download
                        >
                          Download guide
                        </a>
                      </>
                    )}
                    {view.canEdit && (
                      <>
                        <button
                          className={button}
                          onClick={() => {
                            setChanges({
                              name: dna.name,
                              description: dna.description,
                              personality: dna.personality,
                              colours: dna.colours,
                              fonts: dna.fonts,
                              voice: dna.voice,
                              ...(dna.logoId ? { logoId: dna.logoId } : {}),
                              hiddenAssetIds: [],
                            });
                            setPersonalityText(dna.personality.join(", "));
                            setEditing(true);
                          }}
                        >
                          Make corrections
                        </button>
                        <button
                          className={primary}
                          disabled={busy || view.version?.confirmed}
                          onClick={confirm}
                        >
                          <Check size={16} />
                          {view.version?.confirmed ? "Approved" : "Approve DNA"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-2 border-b border-border">
                  <div
                    role="tablist"
                    aria-label="Brand DNA sections"
                    className="flex min-w-0 flex-1 overflow-x-auto"
                  >
                    {sections.map((name, i) => (
                      <button
                        key={name}
                        role="tab"
                        aria-selected={page === i}
                        onClick={() => setPage(i)}
                        className={cn(
                          "shrink-0 border-b-2 px-3 py-3 text-sm font-medium",
                          page === i
                            ? "border-ink text-ink"
                            : "border-transparent text-text-secondary hover:text-ink",
                        )}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button
                      aria-label="Previous section"
                      disabled={page === 0}
                      className="rounded-lg p-2 hover:bg-surface-subtle disabled:opacity-30"
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      aria-label="Next section"
                      disabled={page === sections.length - 1}
                      className="rounded-lg p-2 hover:bg-surface-subtle disabled:opacity-30"
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
                <section
                  role="tabpanel"
                  className="py-6 lg:max-h-[calc(100dvh-360px)] lg:overflow-y-auto"
                  key={page}
                >
                  {pages > 1 && (
                    <div className="mb-3 flex items-center justify-end gap-3 text-xs text-text-secondary">
                      <button
                        className={button}
                        disabled={subpage === 0}
                        onClick={() => setSubpage(subpage - 1)}
                        aria-label="Previous items"
                      >
                        Previous
                      </button>
                      <span>
                        Page {subpage + 1} of {pages}
                      </span>
                      <button
                        className={button}
                        disabled={subpage >= pages - 1}
                        onClick={() => setSubpage(subpage + 1)}
                        aria-label="Next items"
                      >
                        Next
                      </button>
                    </div>
                  )}
                  {page === 0 && (
                    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
                      <div className={cn(card, "overflow-hidden")}>
                        <div className="flex h-32 items-center justify-center bg-surface-subtle p-5">
                          {logo ? (
                            <AssetImage
                              view={view}
                              asset={logo}
                              className="max-h-24"
                            />
                          ) : (
                            <span className="font-display text-4xl font-bold">
                              {dna.name}
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
                            The brand at a glance
                          </p>
                          <h2 className="mt-2 font-display text-3xl font-bold">
                            {dna.name}
                          </h2>
                          <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-text-secondary">
                            {dna.description || "No description detected yet."}
                          </p>
                          <div className="mt-5 flex flex-wrap gap-2">
                            {dna.personality.slice(0, 3).map((p) => (
                              <span
                                key={p}
                                className="rounded-full border border-border-control px-3 py-1 text-xs"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-5">
                        <div className={cn(card, "p-4")}>
                          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
                            Identity snapshot
                          </p>
                          <div className="mt-5 flex gap-2">
                            {dna.colours.slice(0, 6).map((c, i) => (
                              <div
                                key={i}
                                title={`${c.role}: ${c.hex}`}
                                className="h-14 flex-1 rounded-xl border border-border"
                                style={{
                                  backgroundColor: validHex(c.hex)
                                    ? c.hex
                                    : undefined,
                                }}
                              />
                            ))}
                          </div>
                          <p className="mt-3 line-clamp-1 text-sm text-text-secondary">
                            {dna.fonts.map((f) => f.family).join(" · ") ||
                              "No typefaces identified yet"}
                          </p>
                        </div>
                        <div className={cn(card, "p-4")}>
                          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
                            What needs a closer look
                          </p>
                          {dna.gaps.length ? (
                            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                              {dna.gaps.slice(0, 2).map((g) => (
                                <li key={g} className="line-clamp-1">
                                  • {g}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-3 text-sm text-text-secondary">
                              Review the details in each section before
                              approving.
                            </p>
                          )}
                          <button
                            className="mt-3 text-sm font-medium underline underline-offset-4"
                            onClick={() => setOverviewDetails(true)}
                          >
                            View overview details
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {page === 1 && (
                    <>
                      <Heading
                        number="02"
                        title="Colour palette"
                        subtitle="The colours and roles that make your brand recognisable."
                      />
                      {!!dna.colourUsage?.length && (
                        <button
                          className="mb-3 text-sm font-medium underline underline-offset-4"
                          onClick={() => setColourDetails(true)}
                        >
                          View colour usage
                        </button>
                      )}
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {dna.colours
                          .slice(subpage * perPage, (subpage + 1) * perPage)
                          .map((c, i) => (
                            <div
                              key={i}
                              className={cn(card, "overflow-hidden")}
                            >
                              <div
                                className="h-16 border-b border-border"
                                style={{
                                  backgroundColor: validHex(c.hex)
                                    ? c.hex
                                    : undefined,
                                }}
                              />
                              <div className="p-4">
                                <div className="flex justify-between gap-2">
                                  <h3 className="font-semibold">{c.role}</h3>
                                  <span className="font-mono text-sm">
                                    {c.hex}
                                  </span>
                                </div>
                                <p className="my-2 text-xs text-text-secondary">
                                  {c.surface}
                                  {c.original && c.original !== c.hex
                                    ? ` · Original: ${c.original}`
                                    : ""}
                                </p>
                                <Evidence value={c.evidence} />
                              </div>
                            </div>
                          ))}
                      </div>
                      {!dna.colours.length && <Empty />}
                    </>
                  )}
                  {page === 2 && (
                    <>
                      <Heading
                        number="03"
                        title="Typography"
                        subtitle="The type choices behind your brand’s character."
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        {dna.fonts
                          .slice(subpage * perPage, (subpage + 1) * perPage)
                          .map((f, i) => (
                            <div key={i} className={cn(card, "p-6")}>
                              <div className="flex justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-widest text-text-secondary">
                                    {f.role}
                                  </p>
                                  <h3 className="mt-1 text-xl font-semibold">
                                    {f.family}
                                  </h3>
                                </div>
                                <span className="text-xs text-text-secondary">
                                  {f.weights}
                                </span>
                              </div>
                              <div
                                className="my-0 overflow-hidden text-4xl"
                                style={{
                                  fontFamily: dna.assets.some(
                                    (a) =>
                                      a.id === f.assetId && imageUrl(view, a),
                                  )
                                    ? `dna-font-${i + subpage * perPage}`
                                    : `${cleanFont(f.family)}, sans-serif`,
                                }}
                              >
                                Aa Bb Cc
                              </div>
                              <p className="mb-3 text-sm text-text-secondary">
                                {f.surface}
                              </p>
                              <Evidence value={f.evidence} />
                            </div>
                          ))}
                      </div>
                      {!dna.fonts.length && <Empty />}
                    </>
                  )}
                  {page === 3 && (
                    <>
                      <Heading
                        number="04"
                        title="Imagery & assets"
                        subtitle="Explore the visual ingredients found for your brand."
                      />
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                        {images
                          .slice(subpage * perPage, (subpage + 1) * perPage)
                          .map((a) => (
                            <button
                              key={a.id}
                              className={cn(
                                card,
                                "overflow-hidden text-left hover:border-ink",
                              )}
                              onClick={() => setAsset(a)}
                            >
                              <div className="aspect-square bg-surface-subtle p-3 md:h-[min(20vh,160px)] md:aspect-auto">
                                <AssetImage
                                  view={view}
                                  asset={a}
                                  className="object-contain"
                                />
                              </div>
                              <div className="p-3">
                                <p className="truncate font-medium">
                                  {a.label}
                                </p>
                                <p className="mt-1 text-xs capitalize text-text-secondary">
                                  {a.kind} · {a.evidence.status}
                                </p>
                              </div>
                            </button>
                          ))}
                      </div>
                      {!images.length && <Empty />}
                    </>
                  )}
                  {page === 4 && (
                    <>
                      <Heading
                        number="05"
                        title="Voice & messaging"
                        subtitle="How your brand sounds and what it stands for."
                      />
                      <div className="grid gap-4 lg:grid-cols-2">
                        {voiceEntries
                          .slice(subpage * perPage, (subpage + 1) * perPage)
                          .map((entry, i) => (
                            <div key={i} className={cn(card, "p-6")}>
                              <h3 className="font-display text-lg font-bold">
                                {entry.title}
                              </h3>
                              <p className="mt-4 text-sm leading-6">
                                {entry.text}
                              </p>
                              <div className="mt-2">
                                <Evidence value={entry.evidence} />
                              </div>
                            </div>
                          ))}
                      </div>
                      {!voiceEntries.length && <Empty />}
                    </>
                  )}
                  {page === 5 && (
                    <>
                      <Heading
                        number="06"
                        title="Your brand in action"
                        subtitle="Three creative directions to show how your identity can come together."
                      />
                      <div className="grid gap-4 md:grid-cols-3">
                        {(
                          ["product", "promotional", "educational"] as const
                        ).map((kind, i) => {
                          const t = view.tiles.find((x) => x.kind === kind);
                          return (
                            <button
                              key={kind}
                              onClick={() => setTile(i)}
                              className={cn(
                                card,
                                "overflow-hidden text-left hover:border-ink",
                              )}
                            >
                              <div
                                className={cn(
                                  "aspect-square",
                                  usesAutoTillShowcase(view.version!.dna)
                                    ? "bg-ink"
                                    : "bg-surface-subtle",
                                )}
                              >
                                {t?.url ? (
                                  <img
                                    src={t.url}
                                    alt={`${kind} social tile`}
                                    width={1000}
                                    height={1000}
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-text-secondary">
                                    {t?.status === "running" ||
                                    t?.status === "queued" ? (
                                      <>
                                        <LoaderCircle className="animate-spin" />
                                        Creating…
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles />{" "}
                                        {t?.status === "failed"
                                          ? "Couldn’t create this tile"
                                          : "Not available yet"}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center justify-between p-4">
                                <span className="font-semibold capitalize">
                                  {kind}
                                </span>
                                <span className="flex items-center gap-2">
                                  {showcaseNeedsReview(t?.notes) && (
                                    <span className="text-xs text-text-secondary">
                                      Review design
                                    </span>
                                  )}
                                  <Eye size={16} />
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {view.canEdit &&
                        hasCustomShowcase(view.version!.dna) &&
                        view.tiles.length === 3 &&
                        view.tiles.every(
                          (t) => t.status === "ready" || t.status === "failed",
                        ) && (
                          <button
                            className={cn(button, "mt-4")}
                            disabled={busy}
                            onClick={() =>
                              void act(
                                () =>
                                  retry({
                                    data: {
                                      workspaceId: ws,
                                      versionId: view.version!.id,
                                      refreshDesign: true,
                                    },
                                  }),
                                "Showcase refresh started",
                              )
                            }
                          >
                            <RefreshCw size={16} /> Refresh tile designs
                          </button>
                        )}
                      {view.canEdit &&
                        !hasCustomShowcase(view.version!.dna) &&
                        view.tiles.some((t) => t.status === "failed") && (
                          <button
                            className={cn(button, "mt-4")}
                            disabled={busy}
                            onClick={() =>
                              void act(
                                () =>
                                  retry({
                                    data: {
                                      workspaceId: ws,
                                      versionId: view.version!.id,
                                    },
                                  }),
                                "Retry started",
                              )
                            }
                          >
                            <RefreshCw size={16} /> Retry failed tiles
                          </button>
                        )}
                    </>
                  )}
                </section>
                <div className="flex items-center justify-between border-t border-border pt-4 text-sm text-text-secondary">
                  <span>{String(page + 1).padStart(2, "0")} / 06</span>
                  <button
                    className="inline-flex items-center gap-2 disabled:opacity-40"
                    disabled={page === 5}
                    onClick={() => setPage(page + 1)}
                  >
                    Next: {sections[page + 1] || "Complete"}{" "}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
      <Dialog open={colourDetails} onOpenChange={setColourDetails}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Colour usage</DialogTitle>
            <DialogDescription>
              Observed combinations and context-specific treatments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {dna?.colourUsage?.map((item, i) => (
              <div key={i}>
                <p className="text-sm leading-6">{item.text}</p>
                <div className="mt-1">
                  <Evidence value={item.evidence} />
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={overviewDetails} onOpenChange={setOverviewDetails}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Brand overview details</DialogTitle>
            <DialogDescription>
              Review the full summary and outstanding gaps.
            </DialogDescription>
          </DialogHeader>
          {dna && (
            <>
              <p className="text-sm leading-6">
                {dna.description || "No description detected yet."}
              </p>
              <p className="text-sm">{dna.personality.join(" · ")}</p>
              <h3 className="font-semibold">What needs a closer look</h3>
              {dna.gaps.length ? (
                <ul className="space-y-2 text-sm">
                  {dna.gaps.map((g) => (
                    <li key={g}>• {g}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-secondary">No gaps listed.</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!asset} onOpenChange={(open) => !open && setAsset(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{asset?.label}</DialogTitle>
            <DialogDescription>
              Asset details and source evidence
            </DialogDescription>
          </DialogHeader>
          {asset && view && (
            <>
              <div className="h-72 rounded-xl bg-surface-subtle p-4">
                <AssetImage view={view} asset={asset} />
              </div>
              <p className="text-sm capitalize">
                {asset.kind} · {asset.reusable ? "Reusable" : "Reference only"}
              </p>
              <p className="text-sm text-text-secondary">
                {asset.usage || asset.surface || asset.source}
              </p>
              <Evidence value={asset.evidence} />
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={tile !== null}
        onOpenChange={(open) => !open && setTile(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[1050px]">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {tile !== null
                ? ["Product", "Promotional", "Educational"][tile]
                : ""}{" "}
              direction
            </DialogTitle>
            <DialogDescription>1000 × 1000 px</DialogDescription>
          </DialogHeader>
          {tile !== null &&
            (() => {
              const t = view?.tiles.find(
                (x) =>
                  x.kind === ["product", "promotional", "educational"][tile],
              );
              return t?.url ? (
                <figure>
                  <img
                    src={t.url}
                    alt={`${t.kind} social tile`}
                    width={1000}
                    height={1000}
                    className="mx-auto h-auto w-full max-w-[1000px] rounded-xl"
                  />
                  {t.notes?.length ? (
                    <figcaption className="mt-2 text-sm text-text-secondary">
                      {t.notes.join(" ")}
                    </figcaption>
                  ) : null}
                </figure>
              ) : (
                <div className="py-12 text-center text-sm text-text-secondary">
                  <p>{t?.error || "This tile is not ready yet."}</p>
                  {t?.status === "failed" && view?.canEdit && view.version && (
                    <button
                      className={cn(button, "mt-4")}
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () =>
                            retry({
                              data: {
                                workspaceId: ws,
                                versionId: view.version!.id,
                                kind: t.kind,
                              },
                            }),
                          "Retry started",
                        )
                      }
                    >
                      <RefreshCw size={16} /> Retry this tile
                    </button>
                  )}
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
      <Dialog open={comparing} onOpenChange={setComparing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compare rebuilt identity</DialogTitle>
            <DialogDescription>
              Your approved version stays in place until you choose to use the
              rebuild.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {view?.candidate?.differences.map((difference, i) => (
              <li key={i}>• {difference}</li>
            ))}
          </ul>
          {view?.canEdit && (
            <button
              className={primary}
              disabled={busy}
              onClick={() =>
                view?.candidate &&
                view.version &&
                void act(async () => {
                  await adopt({
                    data: {
                      workspaceId: ws,
                      versionId: view.version!.id,
                      candidateId: view.candidate!.id,
                    },
                  });
                  setComparing(false);
                }, "Rebuilt identity selected")
              }
            >
              Use rebuilt identity
            </button>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Correct your Brand DNA</DialogTitle>
            <DialogDescription>
              Adjust what we found. Your corrections are saved for this version.
            </DialogDescription>
          </DialogHeader>
          {dna && (
            <div className="space-y-5">
              <label className="block text-sm font-medium">
                Brand name
                <input
                  className={cn(field, "mt-1")}
                  value={changes.name || ""}
                  onChange={(e) =>
                    setChanges({ ...changes, name: e.target.value })
                  }
                />
              </label>
              <label className="block text-sm font-medium">
                Description
                <textarea
                  className={cn(field, "mt-1 min-h-24")}
                  value={changes.description || ""}
                  onChange={(e) =>
                    setChanges({ ...changes, description: e.target.value })
                  }
                />
              </label>
              <label className="block text-sm font-medium">
                Personality{" "}
                <span className="font-normal text-text-secondary">
                  (comma separated)
                </span>
                <input
                  className={cn(field, "mt-1")}
                  value={personalityText}
                  onChange={(e) => setPersonalityText(e.target.value)}
                />
              </label>
              <fieldset>
                <legend className="text-sm font-medium">Colours</legend>
                <div className="mt-2 space-y-2">
                  {changes.colours?.map((c, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        aria-label={`Colour ${i + 1} role`}
                        className={field}
                        value={c.role}
                        onChange={(e) =>
                          setChanges({
                            ...changes,
                            colours: changes.colours!.map((x, j) =>
                              j === i ? { ...x, role: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <input
                        aria-label={`Colour ${i + 1} hex`}
                        className={cn(field, "max-w-32 font-mono")}
                        value={c.hex}
                        onChange={(e) =>
                          setChanges({
                            ...changes,
                            colours: changes.colours!.map((x, j) =>
                              j === i ? { ...x, hex: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-medium">Typefaces</legend>
                <div className="mt-2 space-y-2">
                  {changes.fonts?.map((f, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="w-24 self-center text-xs text-text-secondary">
                        {f.role}
                      </span>
                      <input
                        aria-label={`${f.role} font family`}
                        className={field}
                        value={f.family}
                        onChange={(e) =>
                          setChanges({
                            ...changes,
                            fonts: changes.fonts!.map((x, j) =>
                              j === i ? { ...x, family: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-medium">Voice</legend>
                <div className="mt-2 space-y-2">
                  {changes.voice?.map((v, i) => (
                    <textarea
                      key={i}
                      aria-label={`Voice statement ${i + 1}`}
                      className={field}
                      value={v.text}
                      onChange={(e) =>
                        setChanges({
                          ...changes,
                          voice: changes.voice!.map((x, j) =>
                            j === i ? { ...x, text: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-medium">
                Logo
                <select
                  className={cn(field, "mt-1")}
                  value={changes.logoId || ""}
                  onChange={(e) =>
                    setChanges({ ...changes, logoId: e.target.value })
                  }
                >
                  <option value="">No logo selected</option>
                  {dna.assets
                    .filter((a) => a.kind === "logo")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                </select>
              </label>
              <fieldset>
                <legend className="text-sm font-medium">
                  Hide unsuitable assets
                </legend>
                <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                  {images.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={
                          changes.hiddenAssetIds?.includes(a.id) || false
                        }
                        onChange={(e) =>
                          setChanges({
                            ...changes,
                            hiddenAssetIds: e.target.checked
                              ? [...(changes.hiddenAssetIds || []), a.id]
                              : (changes.hiddenAssetIds || []).filter(
                                  (id) => id !== a.id,
                                ),
                          })
                        }
                      />
                      {a.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex justify-end gap-2">
                <button className={button} onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button
                  className={primary}
                  disabled={
                    busy || changes.colours?.some((c) => !validHex(c.hex))
                  }
                  onClick={save}
                >
                  Save corrections
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
function Heading({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
        {number} / Brand DNA
      </p>
      <h2 className="mt-2 font-display text-2xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
    </div>
  );
}
function Empty() {
  return (
    <div className={cn(card, "p-10 text-center text-sm text-text-secondary")}>
      Nothing identified here yet. Try a rebuild or add a brand package.
    </div>
  );
}
