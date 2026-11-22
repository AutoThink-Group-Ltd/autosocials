import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Send, MessageSquare, AlertTriangle, Clock, Eye, MousePointerClick, Search, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

interface ActivityItem {
  id: string;
  type: "sent" | "reply" | "bounce" | "open" | "click" | "search" | "list_add";
  text: string;
  time: string;
}

const ActivityPage = () => {
  const { currentWorkspace } = useWorkspace();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    const fetchActivity = async () => {
      setLoading(true);
      const wsId = currentWorkspace.id;

      const [sentRes, repliesRes, searchRes, listMembersRes] = await Promise.all([
        supabase
          .from("email_send_log")
          .select("id, to_email, to_name, subject, status, sent_at")
          .eq("workspace_id", wsId)
          .order("sent_at", { ascending: false })
          .limit(200),
        supabase
          .from("email_replies")
          .select("id, from_email, from_name, subject, received_at")
          .eq("workspace_id", wsId)
          .order("received_at", { ascending: false })
          .limit(50),
        supabase
          .from("search_queries")
          .select("id, query, platform, result_count, searched_at")
          .eq("workspace_id", wsId)
          .order("searched_at", { ascending: false })
          .limit(50),
        supabase
          .from("list_members")
          .select("id, added_at, creator_id, list_id, creator_profiles(display_name, username)")
          .order("added_at", { ascending: false })
          .limit(50),
      ]);

      const sentEmails = sentRes.data || [];
      const replies = repliesRes.data || [];
      const searches = searchRes.data || [];
      const listMembers = listMembersRes.data || [];

      // Get workspace list IDs to filter list_members
      const { data: wsLists } = await supabase
        .from("creator_lists")
        .select("id, name")
        .eq("workspace_id", wsId);
      const wsListMap = new Map((wsLists || []).map(l => [l.id, l.name]));

      const items: ActivityItem[] = [];

      // Email sends & bounces
      sentEmails.forEach((e) => {
        const name = e.to_name || e.to_email;
        if (e.status === "bounced" || e.status === "dlq") {
          items.push({
            id: `bounce-${e.id}`,
            type: "bounce",
            text: `Email to ${name} bounced`,
            time: e.sent_at || "",
          });
        } else {
          items.push({
            id: `sent-${e.id}`,
            type: "sent",
            text: `Email sent to ${name}`,
            time: e.sent_at || "",
          });
        }
      });

      // Replies
      replies.forEach((r) => {
        const name = r.from_name || r.from_email;
        items.push({
          id: `reply-${r.id}`,
          type: "reply",
          text: `${name} replied: "${r.subject || "(no subject)"}"`,
          time: r.received_at || "",
        });
      });

      // Searches
      searches.forEach((s) => {
        items.push({
          id: `search-${s.id}`,
          type: "search",
          text: `Searched "${s.query}" on ${s.platform}${s.result_count ? ` — ${s.result_count} results` : ""}`,
          time: s.searched_at || "",
        });
      });

      // List member additions (filtered to workspace lists)
      listMembers.forEach((lm: any) => {
        const listName = wsListMap.get(lm.list_id);
        if (!listName) return;
        const creatorName = lm.creator_profiles?.display_name || lm.creator_profiles?.username || "a creator";
        items.push({
          id: `list-${lm.id}`,
          type: "list_add",
          text: `Added ${creatorName} to "${listName}"`,
          time: lm.added_at || "",
        });
      });

      items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setActivities(items);
      setLoading(false);
    };
    fetchActivity();
  }, [currentWorkspace?.id]);

  const iconMap: Record<string, { icon: any; className: string }> = {
    sent: { icon: Send, className: "text-primary bg-primary/10" },
    reply: { icon: MessageSquare, className: "text-emerald-500 bg-emerald-500/10" },
    bounce: { icon: AlertTriangle, className: "text-destructive bg-destructive/10" },
    open: { icon: Eye, className: "text-blue-500 bg-blue-500/10" },
    click: { icon: MousePointerClick, className: "text-amber-500 bg-amber-500/10" },
    search: { icon: Search, className: "text-violet-500 bg-violet-500/10" },
    list_add: { icon: UserPlus, className: "text-sky-500 bg-sky-500/10" },
  };

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-1">Activity</h1>
        <p className="text-muted-foreground">Recent activity across your workspace</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No activity yet. Start using the platform to see activity here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map((activity, i) => {
            const config = iconMap[activity.type] || iconMap["sent"]!;
            const Icon = config.icon;
            return (
              <motion.div
                key={activity.id}
                className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border hover:shadow-soft transition-all"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.5) }}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.className}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{activity.text}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {activity.time
                      ? formatDistanceToNow(new Date(activity.time), { addSuffix: true })
                      : ""}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ActivityPage;
