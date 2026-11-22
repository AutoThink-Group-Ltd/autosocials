import { useEffect, useState } from "react";
import { CreateWizard } from "./wizard/CreateWizard";
import { WrittenPosts } from "./WrittenPosts";
import { PersonalIdeaBatchReview } from "./PersonalIdeaBatchReview";
import { TileDesignLibrary } from "./TileDesignLibrary";
import { SocialTiles } from "./SocialTiles";
import { tilePlanSchema, type TilePlan } from "@/lib/social-tiles";
import { referenceIdsSchema, defaultSocialDesign } from "@/lib/social-design";
import { creationEntry, creationQuantity } from "@/lib/creation-entry";
import type { CreateSearch } from "@/lib/create-pipeline";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAgentTileHandoff } from "@/lib/agent-content.functions";

type TileHandoff = {
  brief: string;
  plan?: TilePlan;
  storageKey?: string;
  count?: number;
  referenceIds?: string[];
  historyOnly?: boolean;
};

export function CreatePage({
  workspaceId,
  workspaceName,
  search,
  onNavigate,
  onBack,
  onBatch,
}: {
  workspaceId: string;
  workspaceName: string;
  search: CreateSearch;
  onNavigate: (search: CreateSearch) => void;
  onBack: () => void;
  onBatch: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const loadAgentTile = useServerFn(getAgentTileHandoff);
  const [handoffError, setHandoffError] = useState("");
  const wizard = search.start ?? search.wizard;
  const fresh = !!search.start;
  const [settings, setSettings] = useState<{
    count: number;
    entry: ReturnType<typeof creationEntry>;
    tile: TileHandoff;
  } | null>(null);
  useEffect(() => {
    const tile: TileHandoff = { brief: "" };
    if (wizard === "tiles" && !fresh) {
      const incoming = `as:social-tiles:${workspaceId}`;
      const saved = `as:unified-tile-active:${workspaceId}`;
      try {
        const raw =
          sessionStorage.getItem(incoming) ?? sessionStorage.getItem(saved);
        const data = raw ? JSON.parse(raw) : null;
        if (typeof data?.brief === "string")
          tile.brief = data.brief.slice(0, 2000);
        const refs = referenceIdsSchema.safeParse(data?.referenceIds);
        if (refs.success) tile.referenceIds = refs.data;
        if (typeof data?.count === "number")
          tile.count = creationQuantity(data.count, "tiles");
        const plan = tilePlanSchema.safeParse(data?.plan);
        if (plan.success) tile.plan = plan.data;
        if (data?.historyOnly === true) tile.historyOnly = true;
        if (
          typeof data?.storageKey === "string" &&
          data.storageKey.startsWith(`as:postcard-tile-archive:${workspaceId}:`)
        )
          tile.storageKey = data.storageKey;
        if (sessionStorage.getItem(incoming)) {
          sessionStorage.setItem(saved, JSON.stringify(tile));
          sessionStorage.removeItem(incoming);
        }
      } catch {
        /* Invalid local draft. The wizard can still open a fresh brief. */
      }
    }
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      setSettings({
        count: creationQuantity(
          fresh ? 1 : sessionStorage.getItem(`as:create-count:${workspaceId}`),
          wizard === "tiles" ? "tiles" : "video",
        ),
        entry: creationEntry(
          fresh
            ? null
            : sessionStorage.getItem(`as:create-entry:${workspaceId}`),
        ),
        tile,
      });
    };
    if (wizard === "tiles" && search.agentTile) {
      setSettings(null);
      setHandoffError("");
      void loadAgentTile({
        data: { workspace_id: workspaceId, handoff_id: search.agentTile },
      })
        .then((handoff) => {
          if (cancelled) return;
          tile.brief = handoff.brief;
          tile.referenceIds = handoff.referenceIds;
          tile.plan = handoff.plan;
          tile.count = 1;
          try {
            sessionStorage.setItem(
              `as:unified-tile-active:${workspaceId}`,
              JSON.stringify(tile),
            );
          } catch {
            /* In-memory handoff still works. */
          }
          finish();
        })
        .catch(() => {
          if (!cancelled) {
            setHandoffError(
              "This tile handoff could not be opened. Check the workspace or ask for a new link.",
            );
            finish();
          }
        });
    } else finish();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, wizard, fresh, search.agentTile, loadAgentTile]);

  if (search.ideaBatch)
    return (
      <PersonalIdeaBatchReview
        workspaceId={workspaceId}
        batchId={search.ideaBatch}
        backLabel={
          search.stage === "production" ? "Back to production" : "Back to plans"
        }
        onBack={onBack}
        onOpenItem={(idea, result) => {
          const brief = `${idea.title}\n\n${idea.angle}`;
          if (idea.format === "written") {
            sessionStorage.setItem(`as:written-idea:${workspaceId}`, brief);
            if (result.text)
              sessionStorage.setItem(
                `as:written-draft:${workspaceId}`,
                result.text,
              );
            onNavigate({ wizard: "written" });
          } else if (idea.format === "tiles" && result.plan) {
            sessionStorage.setItem(
              `as:social-tiles:${workspaceId}`,
              JSON.stringify({ brief, plan: result.plan }),
            );
            onNavigate({ wizard: "tiles" });
          } else if (result.videoBatchId)
            onNavigate({ wizard: "video", batch: result.videoBatchId });
        }}
      />
    );
  if (!settings)
    return (
      <p role="status" className="p-4 text-sm">
        Opening brief…
      </p>
    );
  if (wizard === "written")
    return <WrittenPosts workspaceId={workspaceId} onBack={onBack} />;
  if (wizard === "tiles" && handoffError)
    return <p role="alert">{handoffError}</p>;
  if (wizard === "tiles")
    return (
      <TileDesignLibrary key={workspaceId} workspaceId={workspaceId}>
        <SocialTiles
          initialBrief={settings.tile.brief}
          {...(settings.tile.referenceIds
            ? { initialReferenceIds: settings.tile.referenceIds }
            : {})}
          {...(settings.tile.plan ? { initialPlan: settings.tile.plan } : {})}
          {...(settings.tile.storageKey
            ? { initialStorageKey: settings.tile.storageKey }
            : {})}
          historyOnly={!!settings.tile.historyOnly}
          autoGenerate={!!settings.tile.brief && !settings.tile.plan}
          requestedCount={settings.tile.count ?? settings.count}
          initialEntry={settings.entry === "style" ? "styles" : "narratives"}
          onBackToCreate={onBack}
          onReviewPlan={async (plan, brief, id) => {
            const title = `${plan.brand} social tiles`;
            const { error } = await supabase.from("canvases").upsert(
              {
                id,
                workspace_id: workspaceId,
                module: "create",
                title,
                blocks: [
                  { type: "social_tiles", title, brief: brief || title, plan },
                ],
                updated_by: "user",
              },
              { onConflict: "id", ignoreDuplicates: true },
            );
            if (error)
              throw new Error("Could not save the tile plan. Try again.");
            await queryClient.invalidateQueries({
              queryKey: ["pipeline-plans", workspaceId],
            });
            onNavigate({ stage: "plans", item: `canvas:${id}` });
          }}
        />
      </TileDesignLibrary>
    );
  return (
    <CreateWizard
      requestedCount={settings.count}
      fresh={fresh}
      initialBatchId={search.batch}
      onBatchChange={onBatch}
      onOpenTileHistory={() => {
        sessionStorage.setItem(
          `as:social-tiles:${workspaceId}`,
          JSON.stringify({ historyOnly: true }),
        );
        onNavigate({ wizard: "tiles" });
      }}
      onTileIdea={(idea, style) => {
        const plan: TilePlan = {
          brand: workspaceName.slice(0, 60) || "Your business",
          tiles: Array.from(
            { length: creationQuantity(settings.count, "tiles") },
            () => ({
              headline: idea.title.slice(0, 80),
              supporting: idea.message.slice(0, 120),
              design: defaultSocialDesign(style.direction),
              direction: `${style.direction}. ${idea.treatment ?? ""}`.slice(
                0,
                220,
              ),
            }),
          ),
        };
        const storageKey = `as:postcard-tile-archive:${workspaceId}:${crypto.randomUUID()}`;
        sessionStorage.setItem(
          `as:social-tiles:${workspaceId}`,
          JSON.stringify({ plan, storageKey }),
        );
        onNavigate({ wizard: "tiles" });
      }}
    />
  );
}
