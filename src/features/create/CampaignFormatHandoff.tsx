import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { savePersonalIdeaBatch } from "@/lib/personal-idea-batch.functions";
import type { ContentCampaign } from "@/lib/content-campaign";

export function CampaignFormatHandoff({ workspaceId, post, revision, disabled }: {
  workspaceId: string;
  post: ContentCampaign["posts"][number];
  revision: string;
  disabled?: boolean;
}) {
  const navigate = useNavigate();
  const save = useServerFn(savePersonalIdeaBatch);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (post.format !== "video" && post.format !== "carousel") return null;

  async function open() {
    setBusy(true);
    setError("");
    try {
      if (post.format === "carousel") {
        const brief = [post.title, post.brief, post.caption].join("\n\n").slice(0, 2000);
        sessionStorage.setItem(`as:campaign-carousel:${workspaceId}:${post.id}`, brief);
        await navigate({ to: "/app/create", search: { carousel: "new", campaignPost: post.id } });
      } else {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode([workspaceId, revision, post.id].join(":")));
        const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        const id = [hex.slice(0,8), hex.slice(8,12), "4" + hex.slice(13,16), "a" + hex.slice(17,20), hex.slice(20,32)].join("-");
        const batch = await save({ data: { workspace_id: workspaceId, request_id: id, items: [{ title: post.title.slice(0,100), angle: post.brief.slice(0,240), format: "video" }] } });
        await navigate({ to: "/app/create", search: { ideaBatch: batch.batchId } });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open production.");
    } finally {
      setBusy(false);
    }
  }
  return <div><button type="button" disabled={disabled || busy} onClick={() => void open()} className="rounded-lg border border-border-control px-3 py-2">{post.format === "video" ? "Prepare video" : "Design carousel"}</button>{error && <p role="alert">{error}</p>}</div>;
}
