import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SaveToListPopover } from "@/components/app/SaveToListPopover";
import {
  Loader2, ExternalLink, Users, Heart, TrendingUp, Mail, MapPin, Tag, ArrowUpRight, Plus, Check,
} from "lucide-react";

interface Props {
  creatorId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (listIds: string[]) => void;
  alreadySaved?: boolean;
}

interface CreatorRow {
  id: string;
  platform: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  profile_url: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  engagement_rate: number | null;
  avg_views: number | null;
  total_likes: number | null;
  video_count: number | null;
  location: string | null;
  niches: string[] | null;
  contact_email: string | null;
  contact_source: string | null;
  website_url: string | null;
}

const fmt = (n: number | null | undefined) => {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
};

/**
 * Inspection-Layer drawer for a creator. Shows the minimum useful information
 * to decide what to do next (Save · Draft outreach · Open full profile).
 * Per /ux/decision-framework.md: don't navigate when the user only wants to
 * see; use a Sheet.
 */
export function CreatorProfileSheet({ creatorId, open, onOpenChange, onSaved, alreadySaved }: Props) {
  const [data, setData] = useState<CreatorRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !creatorId) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    (async () => {
      const { data: row } = await supabase
        .from("creator_profiles")
        .select("id,platform,username,display_name,bio,profile_url,avatar_url,follower_count,engagement_rate,avg_views,total_likes,video_count,location,niches,contact_email,contact_source,website_url")
        .eq("id", creatorId)
        .maybeSingle();
      if (!cancelled) {
        setData(row as CreatorRow | null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, creatorId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading creator…
          </div>
        )}

        {!loading && !data && (
          <div className="py-20 text-center text-sm text-muted-foreground">Creator not found.</div>
        )}

        {data && (
          <div className="space-y-5">
            <SheetHeader className="space-y-3 text-left">
              <div className="flex items-center gap-3">
                {data.avatar_url ? (
                  <img
                    src={data.avatar_url}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-14 w-14 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center text-lg font-semibold text-muted-foreground">
                    {(data.display_name || data.username).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate">
                    {data.display_name || data.username}
                  </SheetTitle>
                  <SheetDescription className="flex items-center gap-1.5">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">{data.platform}</Badge>
                    <span className="truncate">@{data.username}</span>
                  </SheetDescription>
                </div>
              </div>

              {/* Control layer — primary actions live with context */}
              <div className="flex flex-wrap gap-2">
                <SaveToListPopover
                  creatorId={data.id}
                  onSaved={(ids) => onSaved?.(ids)}
                  trigger={
                    alreadySaved ? (
                      <Button size="sm" variant="brand" className="gap-1.5"><Check className="h-3.5 w-3.5" /> Saved</Button>
                    ) : (
                      <Button size="sm" variant="default" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Save to list</Button>
                    )
                  }
                />
                {data.contact_email && (
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <a href={`mailto:${data.contact_email}`}><Mail className="h-3.5 w-3.5" /> Email</a>
                  </Button>
                )}
                {data.profile_url && (
                  <Button asChild size="sm" variant="ghost" className="gap-1.5">
                    <a href={data.profile_url} target="_blank" rel="noreferrer noopener">
                      <ExternalLink className="h-3.5 w-3.5" /> Open on {data.platform}
                    </a>
                  </Button>
                )}
              </div>
            </SheetHeader>

            <Separator />

            {/* Context layer — minimum useful info */}
            <div className="grid grid-cols-3 gap-3">
              <Stat icon={<Users className="h-3.5 w-3.5" />} label="Followers" value={fmt(data.follower_count)} />
              <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Engagement" value={data.engagement_rate != null ? `${data.engagement_rate.toFixed(1)}%` : "—"} />
              <Stat icon={<Heart className="h-3.5 w-3.5" />} label="Avg views" value={fmt(data.avg_views)} />
            </div>

            {data.bio && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{data.bio}</p>
            )}

            {data.location && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {data.location}
              </div>
            )}

            {data.niches && data.niches.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {data.niches.slice(0, 8).map((n) => (
                  <Badge key={n} variant="secondary" className="gap-1"><Tag className="h-3 w-3" /> {n}</Badge>
                ))}
              </div>
            )}

            {data.contact_email && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <div className="font-medium text-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> {data.contact_email}
                </div>
                {data.contact_source && (
                  <div className="mt-0.5 text-muted-foreground">via {data.contact_source}</div>
                )}
              </div>
            )}

            <Separator />

            {/* Deep Workspace escape hatch */}
            <Button asChild variant="outline" className="w-full gap-1.5">
              <Link to={`/app/creator/${data.id}`} onClick={() => onOpenChange(false)}>
                Open full profile <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
