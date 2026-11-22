import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Eye, Trash2, Mail, MailX, CheckSquare, Square, ExternalLink, ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
type Creator = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  platform: string;
  follower_count: number | null;
  engagement_rate: number | null;
  avg_views: number | null;
  total_likes: number | null;
  niches: string[] | null;
  contact_email: string | null;
  profile_url: string | null;
};

type SortKey = "name" | "platform" | "email";
type SortDir = "asc" | "desc";

interface CreatorTableViewProps {
  creators: Creator[];
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onRemove?: (id: string) => void;
  showRemove?: boolean;
  gradients?: string[];
  /** When provided, the row "View" button calls this instead of navigating to the full-page profile. Used by drawer-first inspection. */
  onView?: (id: string) => void;
}

function formatCount(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function formatEngagement(rate: number | null | undefined): string {
  if (!rate) return "—";
  if (rate > 1) return `${rate.toFixed(1)}%`;
  return `${(rate * 100).toFixed(1)}%`;
}

const defaultGradients = [
  "from-pink-400 to-rose-500",
  "from-violet-400 to-purple-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-cyan-400 to-blue-500",
];

function SortIcon({ column, activeKey, dir }: { column: SortKey; activeKey: SortKey | null; dir: SortDir }) {
  if (activeKey !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
  return dir === "asc"
    ? <ArrowUp className="w-3 h-3 ml-1 text-primary" />
    : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
}

function sortCreators(creators: Creator[], key: SortKey | null, dir: SortDir): Creator[] {
  if (!key) return creators;
  return [...creators].sort((a, b) => {
    let av: string | number | null = null;
    let bv: string | number | null = null;
    switch (key) {
      case "name": av = (a.display_name || a.username).toLowerCase(); bv = (b.display_name || b.username).toLowerCase(); break;
      case "platform": av = a.platform; bv = b.platform; break;
      case "email": av = a.contact_email || ""; bv = b.contact_email || ""; break;
    }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });
}

export const CreatorTableView = ({
  creators,
  selectedIds,
  onToggleSelect,
  onRemove,
  showRemove = false,
  gradients = defaultGradients,
  onView,
}: CreatorTableViewProps) => {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = sortCreators(creators, sortKey, sortDir);

  const sortableHead = (label: string, key: SortKey, className?: string) => (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground transition-colors ${className || ""}`}
      onClick={() => toggleSort(key)}
    >
      <span className="inline-flex items-center">
        {label}
        <SortIcon column={key} activeKey={sortKey} dir={sortDir} />
      </span>
    </TableHead>
  );

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {onToggleSelect && <TableHead className="w-10" />}
            {sortableHead("Creator", "name", "min-w-[200px]")}
            {sortableHead("Platform", "platform")}
            {sortableHead("Email", "email")}
            <TableHead>Niches</TableHead>
            <TableHead className="w-[120px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((creator, i) => {
            const isSelected = selectedIds?.has(creator.id) ?? false;
            return (
              <TableRow
                key={creator.id}
                className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                onClick={() => onToggleSelect?.(creator.id)}
              >
                {onToggleSelect && (
                  <TableCell className="pr-0">
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground" />
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    {creator.avatar_url ? (
                      <img src={creator.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradients[i % gradients.length]} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-white text-xs font-bold">
                          {(creator.display_name || creator.username)[0]?.toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{creator.display_name || creator.username}</p>
                      <p className="text-xs text-muted-foreground">@{creator.username}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium capitalize">{creator.platform}</span>
                </TableCell>
                <TableCell>
                  {creator.contact_email ? (
                    <a href={`mailto:${creator.contact_email}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-400 truncate max-w-[220px]">
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{creator.contact_email}</span>
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/50">
                      <MailX className="w-3 h-3" /> None
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {creator.niches?.slice(0, 3).map((n) => (
                      <span key={n} className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">{n}</span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); if (onView) onView(creator.id); else navigate(`/app/creator/${creator.id}`); }}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    {creator.profile_url && (
                      <a href={creator.profile_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><ExternalLink className="w-3.5 h-3.5" /></Button>
                      </a>
                    )}
                    {showRemove && onRemove && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onRemove(creator.id); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default CreatorTableView;
