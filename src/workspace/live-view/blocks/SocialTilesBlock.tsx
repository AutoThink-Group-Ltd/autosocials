import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { Block } from "@/lib/sam.blocks";

type TileBlock = Extract<Block, { type: "social_tiles" }>;
export function SocialTilesBlock({
  block,
  workspaceId,
}: {
  block: TileBlock;
  workspaceId: string | null;
}) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const open = () => {
    if (!workspaceId) {
      setError("Choose a business before opening these tiles.");
      return;
    }
    try {
      sessionStorage.setItem(
        `as:social-tiles:${workspaceId}`,
        JSON.stringify({ brief: block.brief, ...(block.referenceIds?.length ? { referenceIds: block.referenceIds } : {}), ...(block.count ? { count: block.count } : {}) }),
      );
      window.dispatchEvent(new Event("as:social-tiles"));
      void navigate({ to: "/app/create", search: { stage: "plans", wizard: "tiles" } });
    } catch {
      setError("The request could not be opened. Please try again.");
    }
  };
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h3 className="font-display text-lg font-bold">{block.title}</h3>
      <p className="whitespace-pre-wrap text-sm">{block.brief}</p>
      <p className="text-sm text-muted-foreground">
        Review the copy, references and design before creating artwork.
      </p>
      <button
        type="button"
        onClick={open}
        className="rounded-lg bg-ink px-4 py-2 font-semibold text-inverse"
      >
        Open social tiles
      </button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
