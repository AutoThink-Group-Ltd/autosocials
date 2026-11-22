import type { MessagePreviewBlock as MessagePreviewBlockT } from "../types";
import { Mail, Instagram, Music2 } from "lucide-react";

const channelMeta = {
  instagram_dm: { label: "Instagram DM", Icon: Instagram },
  tiktok_dm: { label: "TikTok DM", Icon: Music2 },
  email: { label: "Email", Icon: Mail },
} as const;

export function MessagePreviewBlockView({ block }: { block: MessagePreviewBlockT }) {
  const meta = channelMeta[block.channel];
  const Icon = meta.Icon;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden max-w-md">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{meta.label}</span>
        <span className="text-xs text-muted-foreground/70 ml-auto truncate">to {block.to.handle}</span>
      </div>
      <div className="p-3 space-y-2">
        {block.subject && <div className="text-sm font-semibold text-foreground">{block.subject}</div>}
        <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{block.body}</div>
      </div>
    </div>
  );
}