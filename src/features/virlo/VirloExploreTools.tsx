import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { runVirloOperation, listVirloResources } from "@/lib/virlo.functions";
import type { VirloOperation } from "@/lib/virlo-catalog";
import { cn } from "@/lib/utils";
import {
  acquirePendingRequest,
  completePendingRequest,
  type PendingRequest,
} from "./pendingRequest";

type Platform = "tiktok" | "instagram" | "youtube";
type Cadence =
  | "six_hours"
  | "twelve_hours"
  | "daily"
  | "every_other_day"
  | "weekly"
  | "bi_weekly"
  | "monthly";
type OperationName =
  | "topic_trends"
  | "content_trends"
  | "hooks"
  | "sounds"
  | "hashtags"
  | "ads"
  | "places"
  | "raw_search"
  | "raw_hashtag"
  | "raw_creator"
  | "raw_creator_videos"
  | "raw_video"
  | "raw_comments"
  | "raw_transcript"
  | "creator_lookup"
  | "video_lookup"
  | "hashtag_lookup"
  | "sound_lookup"
  | "place_lookup"
  | "research_start"
  | "track_creator"
  | "track_video";
const options: { value: OperationName; label: string; group: string }[] = [
  { value: "topic_trends", label: "Topic trends", group: "Trends" },
  { value: "content_trends", label: "Content formats", group: "Trends" },
  { value: "hooks", label: "Search hooks", group: "Hooks, sounds & hashtags" },
  {
    value: "sounds",
    label: "Trending sounds",
    group: "Hooks, sounds & hashtags",
  },
  {
    value: "hashtags",
    label: "Hashtag analytics",
    group: "Hooks, sounds & hashtags",
  },
  { value: "ads", label: "Search Meta ads", group: "Competitor ads" },
  { value: "places", label: "Find tagged places", group: "Places" },
  { value: "place_lookup", label: "Research a place", group: "Places" },
  { value: "creator_lookup", label: "Creator deep dive", group: "Deep dives" },
  { value: "video_lookup", label: "Video deep dive", group: "Deep dives" },
  { value: "hashtag_lookup", label: "Hashtag deep dive", group: "Deep dives" },
  { value: "sound_lookup", label: "Sound deep dive", group: "Deep dives" },
  {
    value: "research_start",
    label: "Research a niche",
    group: "Niche research",
  },
  { value: "raw_search", label: "Live video search", group: "Live data" },
  { value: "raw_hashtag", label: "Live hashtag videos", group: "Live data" },
  { value: "raw_creator", label: "Live creator profile", group: "Live data" },
  {
    value: "raw_creator_videos",
    label: "Live creator videos",
    group: "Live data",
  },
  { value: "raw_video", label: "Live video details", group: "Live data" },
  { value: "raw_comments", label: "Live video comments", group: "Live data" },
  { value: "raw_transcript", label: "Video transcript", group: "Live data" },
  { value: "track_creator", label: "Track a creator", group: "Tracking" },
  { value: "track_video", label: "Track a video", group: "Tracking" },
];
const field =
  "w-full rounded-xl border border-border-control bg-surface px-3 py-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const button =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-ink px-4 text-sm font-semibold text-inverse hover:bg-ink-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
type Props = {
  workspaceId: string;
  configured: boolean;
  onResult: (result: {
    id: string;
    data: unknown;
    title: string;
    kind: string;
  }) => void;
  result: ReactNode;
};

export function VirloExploreTools({
  workspaceId,
  configured,
  onResult,
  result,
}: Props) {
  const cache = useQueryClient();
  const [operation, setOperation] = useState<OperationName>("topic_trends");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [region, setRegion] = useState<"global" | "gb" | "us" | "au" | "sg">(
    "gb",
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [collectionDepth, setCollectionDepth] = useState<"none" | "standard" | "deep" | "full">("none");
  const [audience, setAudience] = useState(false);
  const [trends, setTrends] = useState(false);
  const [intelligence, setIntelligence] = useState(false);
  const [ads, setAds] = useState(false);
  const [formError, setFormError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const resources = useQuery({
    queryKey: ["virlo-resources", workspaceId],
    queryFn: () => listVirloResources({ data: { workspace_id: workspaceId } }),
  });
  const run = useMutation({
    mutationFn: (input: {
      action: VirloOperation;
      title: string;
      confirmed?: boolean;
      pending: PendingRequest;
    }) =>
      runVirloOperation({
        data: {
          workspace_id: workspaceId,
          operation: input.action,
          request_id: input.pending.id,
          confirmed: input.confirmed ?? false,
        },
      }),
    onSuccess: (data, input) => {
      completePendingRequest(input.pending);
      onResult({
        id: data.id,
        data: data.data,
        title: input.title,
        kind: input.action.operation,
      });
      void cache.invalidateQueries({
        queryKey: ["virlo-resources", workspaceId],
      });
    },
  });
  const runOnce = async (input: {
    action: VirloOperation;
    title: string;
    confirmed?: boolean;
  }) => {
    if (preparing || run.isPending) return;
    setPreparing(true);
    setFormError("");
    try {
      const pending = await acquirePendingRequest(workspaceId, {
        type: "operation",
        action: input.action,
      });
      run.mutate({ ...input, pending });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Research could not start safely.",
      );
    } finally {
      setPreparing(false);
    }
  };
  const label =
    options.find((item) => item.value === operation)?.label ?? "Research";
  const needQuery = ![
    "topic_trends",
    "content_trends",
    "sounds",
    "hashtags",
  ].includes(operation);
  const needsPlatform = ![
    "topic_trends",
    "ads",
    "places",
    "place_lookup",
    "research_start",
  ].includes(operation);
  const isTracking =
    operation === "track_creator" || operation === "track_video";
  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    const q = query.trim();
    if (needQuery && q.length < 2) {
      setFormError("Enter at least two characters.");
      return;
    }
    if (operation === "hashtags" && (!start || !end)) {
      setFormError("Choose a start and end date.");
      return;
    }
    let action: VirloOperation;
    switch (operation) {
      case "topic_trends":
        action = { operation, region };
        break;
      case "content_trends":
      case "sounds":
        action = { operation, platform, page: 1 };
        break;
      case "hooks":
        action = { operation, query: q, platform, page: 1 };
        break;
      case "hashtags":
        action = {
          operation,
          platform,
          page: 1,
          start_date: start,
          end_date: end,
        };
        break;
      case "ads":
        action = { operation, query: q, country: "GB" };
        break;
      case "places":
        action = { operation, query: q, page: 1 };
        break;
      case "place_lookup":
        action = { operation, query: q };
        break;
      case "raw_search":
        action = { operation, query: q, platform };
        break;
      case "raw_hashtag":
        action = { operation, hashtag: q, platform };
        break;
      case "raw_creator":
      case "raw_creator_videos":
        action = { operation, handle: q, platform };
        break;
      case "raw_video":
      case "raw_comments":
      case "video_lookup":
        action = { operation, url: q, platform };
        break;
      case "raw_transcript":
        if (platform === "instagram") {
          setFormError("Transcripts are available for TikTok and YouTube.");
          return;
        }
        action = { operation, url: q, platform };
        break;
      case "creator_lookup":
        action = {
          operation,
          handle: q,
          platform,
          audience,
          trends,
          intelligence,
        };
        break;
      case "hashtag_lookup":
        action = { operation, hashtag: q, platform, trends };
        break;
      case "sound_lookup":
        if (platform === "youtube") {
          setFormError("Sound lookups are available for TikTok and Instagram.");
          return;
        }
        action = { operation, sound_id: q, platform, trends };
        break;
      case "research_start":
        action = {
          operation,
          intent: q,
          keywords: q
            .split(",")
            .map((x) => x.trim())
            .filter((x) => x.length >= 2)
            .slice(0, 50),
          platforms: ["tiktok", "instagram", "youtube"],
          intelligence,
          ads,
        };
        break;
      case "track_creator":
        action = { operation, handle: q, platform, cadence, ...(collectionDepth !== "none" ? { collection_depth: collectionDepth } : {}) };
        break;
      case "track_video":
        action = { operation, url: q, platform, cadence };
        break;
    }
    const confirmed =
      isTracking &&
      window.confirm(
        `Start ${cadence.replaceAll("_", " ")} checks for this ${operation === "track_creator" ? "creator" : "video"}? Checks repeat until paused. AutoSocials pays $0.25 per check to Virlo.${operation === "track_creator" && collectionDepth !== "none" ? ` The ${collectionDepth} back-catalog collection adds $${collectionDepth === "standard" ? "0.50" : collectionDepth === "deep" ? "1.00" : "2.00"} once.` : ""}`,
      );
    if (isTracking && !confirmed) return;
    runOnce({
      action,
      title: `${label}${q ? ` · ${q}` : ""}`.slice(0, 200),
      confirmed,
    });
  }
  function openTrackedView(item: { id: string; label: string; kind: string }, view: "posts" | "posting-cadence" | "audience-demographics" | "audience-geography") {
    const paid = view === "audience-demographics" || view === "audience-geography";
    if (paid && !window.confirm(`Refresh Virlo audience ${view === "audience-demographics" ? "demographics" : "geography"} for ${item.label}? A fresh audience snapshot may cost US$0.50.`)) return;
    runOnce({
      action: { operation: "tracking_data", kind: "creators", id: item.id, view },
      title: `${item.label} · ${view.replaceAll("-", " ")}`,
      confirmed: paid,
    });
  }
  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5"
      >
        <label className="block space-y-1.5 text-sm font-medium text-ink">
          Research tool
          <select
            value={operation}
            onChange={(e) => {
              setOperation(e.target.value as OperationName);
              setFormError("");
            }}
            className={field}
          >
            {[...new Set(options.map((o) => o.group))].map((group) => (
              <optgroup key={group} label={group}>
                {options
                  .filter((o) => o.group === group)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {needQuery && (
            <label className="space-y-1.5 text-sm font-medium text-ink">
              {[
                "track_video",
                "video_lookup",
                "raw_video",
                "raw_comments",
                "raw_transcript",
              ].includes(operation)
                ? "Public video URL"
                : [
                      "track_creator",
                      "creator_lookup",
                      "raw_creator",
                      "raw_creator_videos",
                    ].includes(operation)
                  ? "Creator handle"
                  : operation === "sound_lookup"
                    ? "Sound ID"
                    : operation === "research_start"
                      ? "Niche and keywords (separate keywords with commas)"
                      : "Search or hashtag"}
              <input
                className={field}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={2000}
                required
              />
            </label>
          )}
          {needsPlatform && (
            <label className="space-y-1.5 text-sm font-medium text-ink">
              Platform
              <select
                className={field}
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
              >
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
                <option value="youtube">YouTube Shorts</option>
              </select>
            </label>
          )}
          {operation === "topic_trends" && (
            <label className="space-y-1.5 text-sm font-medium text-ink">
              Region
              <select
                className={field}
                value={region}
                onChange={(e) => setRegion(e.target.value as typeof region)}
              >
                <option value="gb">United Kingdom</option>
                <option value="global">Global</option>
                <option value="us">United States</option>
                <option value="au">Australia</option>
                <option value="sg">Singapore</option>
              </select>
            </label>
          )}
          {operation === "hashtags" && (
            <>
              <label className="space-y-1.5 text-sm font-medium text-ink">
                From
                <input
                  type="date"
                  className={field}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-ink">
                To
                <input
                  type="date"
                  className={field}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </label>
            </>
          )}
          {isTracking && (
            <label className="space-y-1.5 text-sm font-medium text-ink">
              Check frequency
              <select
                className={field}
                value={cadence}
                onChange={(e) => setCadence(e.target.value as Cadence)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="bi_weekly">Every two weeks</option>
                <option value="monthly">Monthly</option>
                <option value="six_hours">Every six hours</option>
                <option value="twelve_hours">Every twelve hours</option>
                <option value="every_other_day">Every other day</option>
              </select>
            </label>
          )}
          {operation === "track_creator" && <label className="block space-y-1.5 text-sm font-medium text-ink">Older posts <select className={field} value={collectionDepth} onChange={(e) => setCollectionDepth(e.target.value as typeof collectionDepth)}><option value="none">Current posts only</option><option value="standard">Standard · up to 50 · +$0.50</option><option value="deep">Deep · up to 200 · +$1.00</option><option value="full">Full · up to 500 · +$2.00</option></select></label>}
        </div>
        {(operation === "creator_lookup" ||
          operation === "research_start" ||
          operation === "hashtag_lookup" ||
          operation === "sound_lookup") && (
          <fieldset className="flex flex-wrap gap-4 text-sm text-text-secondary">
            <legend className="mb-2 font-medium text-ink">Options</legend>
            {operation === "creator_lookup" && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={audience}
                  onChange={(e) => setAudience(e.target.checked)}
                />
                Commenter audience insights
              </label>
            )}
            {operation !== "research_start" && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={trends}
                  onChange={(e) => setTrends(e.target.checked)}
                />
                Trend analysis
              </label>
            )}
            {(operation === "creator_lookup" ||
              operation === "research_start") && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={intelligence}
                  onChange={(e) => setIntelligence(e.target.checked)}
                />
                Detailed video analysis
              </label>
            )}
            {operation === "research_start" && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ads}
                  onChange={(e) => setAds(e.target.checked)}
                />
                Include Meta ads
              </label>
            )}
          </fieldset>
        )}
        {isTracking && (
          <p className="text-xs text-text-secondary">
            Tracking checks repeat until paused. AutoSocials covers provider
            usage; you will be asked to confirm.
          </p>
        )}
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        {run.isError && (
          <p role="alert" className="text-sm text-danger">
            {run.error instanceof Error
              ? run.error.message
              : "Research could not be completed."}{" "}
            If the outcome is uncertain, check your research before starting it
            again.
          </p>
        )}
        <button
          type="submit"
          className={button}
          disabled={!configured || run.isPending || preparing}
        >
          {run.isPending ? "Working…" : label}
        </button>
      </form>
      {result}
      <section aria-label="Tracked research" className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">
          Your research and tracking
        </h2>
        <p className="text-sm text-text-secondary">
          Open a report or pause and resume recurring checks for this business.
        </p>
        {!configured && <p className="text-sm text-warning">Turning Research off does not stop existing Virlo checks. Pause active tracking here or in Virlo; the saved provider key is needed to pause it.</p>}
        {resources.isError && (
          <p role="alert" className="text-sm text-danger">
            Tracking information is unavailable.
          </p>
        )}
        {resources.data?.length ? (
          <ul className="space-y-2">
            {resources.data.map((item) => (
              <li
                key={`${item.kind}-${item.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div>
                  <p className="font-medium text-ink">
                    {item.label.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs capitalize text-text-secondary">
                    {item.kind.replaceAll("_", " ")} · {item.status}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(item.kind === "creators" || item.kind === "videos") && (
                    <>
                      <button
                        type="button"
                        disabled={!configured || run.isPending || preparing}
                        className={cn(button, "bg-surface-subtle text-ink")}
                        onClick={() =>
                          runOnce({
                            action: {
                              operation: "tracking_data",
                              kind: item.kind as "creators" | "videos",
                              id: item.id,
                              view: "report",
                            },
                            title: `${item.label} · report`,
                          })
                        }
                      >
                        View report
                      </button>
                      {item.kind === "creators" && ([
                        ["posts", "Recent posts"],
                        ["posting-cadence", "Posting cadence"],
                        ["audience-demographics", "Audience demographics · $0.50"],
                        ["audience-geography", "Audience geography · $0.50"],
                      ] as const).map(([view, label]) => (
                        <button
                          key={view}
                          type="button"
                          disabled={!configured || run.isPending || preparing}
                          className={cn(button, "bg-surface-subtle text-ink")}
                          onClick={() => openTrackedView(item, view)}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={(!configured && item.status !== "active") || run.isPending || preparing}
                        className={cn(button, "bg-surface-subtle text-ink")}
                        onClick={() => {
                          const active = item.status !== "active";
                          if (active && !item.cadence) {
                            setFormError(
                              "The tracking frequency is unavailable. Check it before resuming.",
                            );
                            return;
                          }
                          if (
                            active &&
                            !window.confirm(
                              `Resume recurring checks at ${item.cadence ? item.cadence.replaceAll("_", " ") : "an unavailable frequency"}? Checks are free for you; AutoSocials pays an estimated $0.25 per check to Virlo.`,
                            )
                          )
                            return;
                          runOnce({
                            action: {
                              operation: "tracking_update",
                              kind: item.kind as "creators" | "videos",
                              id: item.id,
                              status: active ? "active" : "paused",
                            },
                            title: `${item.label} · tracking`,
                            confirmed: active,
                          });
                        }}
                      >
                        {item.status === "active" ? "Pause" : "Resume"}
                      </button>
                    </>
                  )}
                  {item.kind === "research" && (
                    <>
                      <button
                        type="button"
                        disabled={run.isPending || preparing}
                        className={cn(button, "bg-surface-subtle text-ink")}
                        onClick={() =>
                          runOnce({
                            action: {
                              operation: "research_status",
                              id: item.id,
                            },
                            title: `${item.label} · status`,
                          })
                        }
                      >
                        Check status
                      </button>
                      <button
                        type="button"
                        disabled={run.isPending || preparing}
                        className={cn(button, "bg-surface-subtle text-ink")}
                        onClick={() =>
                          runOnce({
                            action: {
                              operation: "research_data",
                              id: item.id,
                              view: "summary",
                            },
                            title: `${item.label} · summary`,
                          })
                        }
                      >
                        View summary
                      </button>
                    </>
                  )}
                  {[
                    "lookup_creator",
                    "lookup_video",
                    "lookup_hashtag",
                    "lookup_sound",
                    "lookup_place",
                  ].includes(item.kind) && (
                    <button
                      type="button"
                      disabled={run.isPending || preparing}
                      className={cn(button, "bg-surface-subtle text-ink")}
                      onClick={() =>
                        runOnce({
                          action: {
                            operation: "lookup_status",
                            lookup: item.kind.replace("lookup_", "") as
                              | "creator"
                              | "video"
                              | "hashtag"
                              | "sound"
                              | "place",
                            id: item.id,
                          },
                          title: `${item.label} · status`,
                        })
                      }
                    >
                      Check status
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          !resources.isPending && (
            <p className="text-sm text-text-secondary">No tracked items yet.</p>
          )
        )}
      </section>
    </div>
  );
}
