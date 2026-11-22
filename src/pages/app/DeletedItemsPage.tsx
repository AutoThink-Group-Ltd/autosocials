import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  Folder,
  Images,
  Lightbulb,
  Search,
  RotateCcw,
  Layers,
  X,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDeletedNarratives } from "@/features/create/DeletedNarratives";
import { usePipeline } from "@/features/create/PipelinePlans";
import { usePipelineAssetLibrary } from "@/features/create/PipelineAssets";
import {
  useDeletedIdeas,
  useDeletedHomeWork,
} from "@/features/home/DeletedIdeas";
import {
  contentTrashKey,
  listContentTrash,
  setContentTrashed,
  type ContentTrashKind,
} from "@/lib/content-trash";
import {
  listPipelineTrash,
  pipelineTrashKey,
  setPipelineTrashed,
} from "@/lib/pipeline-trash";

const pageSize = 6;

const assetLabels = {
  tile: "Social tile",
  written: "Written post",
  video: "Video",
  carousel: "LinkedIn carousel",
} satisfies Record<ContentTrashKind, string>;
const assetKinds = Object.keys(assetLabels) as ContentTrashKind[];
const sections = [
  { name: "Plans", icon: Folder },
  { name: "Assets", icon: Images },
  { name: "Ideas & narratives", icon: Lightbulb },
  { name: "Work in progress", icon: Layers },
] as const;
type Section = (typeof sections)[number]["name"];
type Item = {
  id: string;
  title: string;
  detail?: string;
  kind: string;
  disabled?: boolean;
  restore: () => Promise<unknown>;
};

function RestoreRow({ item }: { item: Item }) {
  const mutation = useMutation({ mutationFn: item.restore });
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p
            title={item.title}
            className="truncate text-sm font-medium leading-5"
          >
            {item.title}
          </p>
          <p className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">
            {item.kind}
            {item.detail && ` · ${item.detail}`}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Restore ${item.title}`}
          disabled={mutation.isPending || item.disabled}
          onClick={() => mutation.mutate()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium hover:bg-surface-subtle focus-visible:outline-2 disabled:opacity-50"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          {mutation.isPending ? "Restoring…" : "Restore"}
        </button>
      </div>
      {mutation.isError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Couldn’t restore this item. Try again.
        </p>
      )}
    </li>
  );
}

function DeletedContent({
  workspaceId,
  personal,
}: {
  workspaceId: string;
  personal: boolean;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Section | null>(null);
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  const plans = useQuery({
    queryKey: pipelineTrashKey(workspaceId),
    queryFn: () => listPipelineTrash(workspaceId),
  });
  const assets = useQueries({
    queries: assetKinds.map((kind) => ({
      queryKey: contentTrashKey(workspaceId, kind),
      queryFn: () => listContentTrash(workspaceId, kind),
    })),
  });
  const hasPlans = !!plans.data?.length;
  const hasAssets = assets.some((query) => query.data?.length);
  const pipeline = usePipeline(hasPlans ? workspaceId : "");
  const library = usePipelineAssetLibrary(hasAssets ? workspaceId : "");
  const ideas = useDeletedIdeas(workspaceId, personal);
  const narratives = useDeletedNarratives(workspaceId);
  const work = useDeletedHomeWork(workspaceId);
  const groups: Record<Section, Item[]> = {
    Plans: [],
    Assets: [],
    "Ideas & narratives": [...ideas.items, ...narratives.items],
    "Work in progress": [...work.items],
  };
  const entries = new Map(
    pipeline.data?.entries
      .filter((entry) => entry.stage !== "production" || !entry.hidden)
      .map((entry) => [entry.id, entry]),
  );
  for (const id of plans.data ?? []) {
    const entry = entries.get(id);
    const [prefix, scope, parentId, format] = id.split(":");
    const production = prefix === "production-item";
    const parent = production
      ? entries.get(
          scope === "batch"
            ? `personal:plan:${parentId}`
            : `${scope}:${parentId}`,
        )
      : undefined;
    const title =
      entry?.title ??
      [parent?.title, production ? format : prefix, id.slice(-8)]
        .filter(Boolean)
        .join(" · ");
    const section =
      prefix === "narrative"
        ? "Ideas & narratives"
        : production || entry?.stage === "production"
          ? "Work in progress"
          : "Plans";
    groups[section].push({
      id: `plan:${id}`,
      title,
      kind: entry?.subtitle ?? (production ? "Production item" : "Plan"),
      restore: async () => {
        await setPipelineTrashed(workspaceId, id, false);
        await client.invalidateQueries({
          queryKey: pipelineTrashKey(workspaceId),
        });
      },
    });
  }
  const titles = new Map(
    library.rows.map((row) => [`${row.type}:${row.id}`, row.title]),
  );
  for (const [index, query] of assets.entries()) {
    const kind = assetKinds[index]!;
    for (const id of query.data ?? []) {
      const key = `${kind}:${id}`;
      groups.Assets.push({
        id: key,
        title: titles.get(key) ?? `${assetLabels[kind]} · ${id.slice(-8)}`,
        kind: assetLabels[kind],
        restore: async () => {
          await setContentTrashed(workspaceId, kind, id, false);
          await client.invalidateQueries({
            queryKey: contentTrashKey(workspaceId, kind),
          });
        },
      });
    }
  }
  const queries = [
    plans,
    ...assets,
    narratives.query,
    work.query,
    ...(personal ? [ideas.query] : []),
    ...(hasPlans ? [pipeline] : []),
    ...(hasAssets ? [library.assets, library.carousels] : []),
  ];
  const loading = queries.some((query) => query.isPending);
  const failures = queries.filter((query) => query.isError);
  const term = search.trim().toLocaleLowerCase();
  const active =
    category ??
    sections.find(({ name }) => groups[name].length)?.name ??
    "Plans";
  const items = sections
    .flatMap(({ name }) => {
      if (!term && name !== active) return [];
      return groups[name].filter(
        (item) =>
          !term ||
          [item.title, item.detail, item.kind, name].some((text) =>
            text?.toLocaleLowerCase().includes(term),
          ),
      );
    })
    .sort((a, b) => a.title.localeCompare(b.title));
  const total = sections.reduce(
    (sum, section) => sum + groups[section.name].length,
    0,
  );
  const lastPage = Math.max(0, Math.ceil(items.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const offset = currentPage * pageSize;
  const heading = term ? "Search results" : active;
  function changeSearch(value: string) {
    setSearch(value);
    setPage(0);
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Deleted item categories"
          className="grid grid-cols-2 gap-1 border-b border-border bg-surface-subtle p-3 md:flex md:flex-col md:border-b-0 md:border-r"
        >
          {sections.map(({ name, icon: Icon }) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              aria-pressed={!term && active === name}
              onClick={() => {
                setCategory(name);
                changeSearch("");
              }}
              className="flex min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-surface aria-pressed:bg-ink aria-pressed:text-inverse"
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">{name}</span>
              <span className="text-xs tabular-nums opacity-75">
                {groups[name].length}
              </span>
            </button>
          ))}
        </nav>
        <section aria-label={heading} className="min-w-0">
          <div className="border-b border-border p-4 sm:px-5">
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                aria-label="Search deleted items"
                placeholder="Search all deleted items…"
                value={search}
                onChange={(event) => changeSearch(event.target.value)}
                className="w-full rounded-lg border border-border-control bg-surface py-2 pl-9 pr-9 text-sm"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => changeSearch("")}
                  className="absolute inset-y-0 right-1 px-2"
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-5 sm:px-5">
            <h2 className="font-display text-xl font-semibold">{heading}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>
          {loading && (
            <p
              role="status"
              className="px-5 py-2 text-sm text-muted-foreground"
            >
              Loading deleted items…
            </p>
          )}
          {failures.length > 0 && (
            <p role="alert" className="px-5 py-2 text-sm">
              Some deleted items couldn’t be loaded.{" "}
              <button
                className="underline"
                onClick={() =>
                  failures.forEach((query) => void query.refetch())
                }
              >
                Try again
              </button>
            </p>
          )}
          <ul className="divide-y divide-border">
            {items.slice(offset, offset + pageSize).map((item) => (
              <RestoreRow key={item.id} item={item} />
            ))}
          </ul>
          {!items.length && !loading && !failures.length && (
            <p
              role="status"
              className="px-5 py-8 text-sm text-muted-foreground"
            >
              {term
                ? "No deleted items match your search."
                : total
                  ? "No deleted items in this category."
                  : "No deleted items."}
            </p>
          )}
          {lastPage > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs sm:px-5">
              <span
                aria-live="polite"
                className="tabular-nums text-muted-foreground"
              >
                {offset + 1}–{Math.min(offset + pageSize, items.length)} of{" "}
                {items.length}
              </span>
              <div className="flex gap-2">
                {(["Previous", "Next"] as const).map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    disabled={
                      direction === "Previous"
                        ? currentPage === 0
                        : currentPage === lastPage
                    }
                    onClick={() =>
                      setPage(currentPage + (direction === "Previous" ? -1 : 1))
                    }
                    className="rounded-md border border-border-control px-3 py-1.5 font-medium disabled:opacity-40"
                  >
                    {direction}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
export default function DeletedItemsPage() {
  const { currentWorkspace } = useWorkspace();
  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 sm:px-8">
      <Link
        to="/app/settings"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Settings
      </Link>
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Deleted Items
      </h1>
      {currentWorkspace ? (
        <DeletedContent
          workspaceId={currentWorkspace.id}
          personal={currentWorkspace.workspace_kind === "personal"}
          key={currentWorkspace.id}
        />
      ) : (
        <p>Select a workspace to view deleted items.</p>
      )}
    </main>
  );
}
