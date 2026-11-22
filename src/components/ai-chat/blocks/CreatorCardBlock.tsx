import type { CreatorCardBlock as CreatorCardBlockT } from "../types";
import { Music2, Instagram } from "lucide-react";

function fmt(n?: number) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function CreatorCardBlockView({ block }: { block: CreatorCardBlockT }) {
  const c = block.creator;
  const Platform = c.platform === "instagram" ? Instagram : Music2;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/50 p-3">
      {c.avatarUrl ? (
        <img src={c.avatarUrl} alt={c.handle} referrerPolicy="no-referrer" className="w-12 h-12 rounded-full object-cover" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground">
          {c.handle.replace(/^@/, "").slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Platform className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground truncate">{c.displayName || c.handle}</span>
        </div>
        <div className="text-xs text-muted-foreground truncate">{c.handle}</div>
        {c.bio && <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{c.bio}</div>}
      </div>
      <div className="text-right text-xs">
        <div className="text-foreground font-semibold">{fmt(c.followers)}</div>
        <div className="text-muted-foreground">followers</div>
        {c.engagementRate != null && (
          <div className="text-muted-foreground mt-0.5">{(c.engagementRate * 100).toFixed(1)}% ER</div>
        )}
      </div>
    </div>
  );
}