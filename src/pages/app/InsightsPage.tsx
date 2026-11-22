import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Hash, Mail } from "lucide-react";
import InsightsOverviewCards from "@/components/insights/InsightsOverviewCards";
import CreatorsTab from "@/components/insights/CreatorsTab";
import NichesTab from "@/components/insights/NichesTab";
import DeliverabilityTab from "@/components/insights/DeliverabilityTab";

interface CreatorEmailData {
  to_email: string;
  to_name: string | null;
  follower_count: number | null;
  avatar_url: string | null;
  username: string | null;
  display_name: string | null;
  niches: string[] | null;
  emailCount: number;
}

interface NicheEmailData {
  niche: string;
  creatorCount: number;
  emailCount: number;
  avgFollowers: number;
}

interface InsightsData {
  totalSent: number;
  totalReplies: number;
  replyRate: number;
  totalOpens: number;
  openRate: number;
  totalClicks: number;
  clickRate: number;
  totalBounces: number;
  bounceRate: number;
  totalSearches: number;
  totalLists: number;
  totalCreatorsInLists: number;
  nicheBreakdown: { niche: string; count: number }[];
  dailyMetrics: { date: string; sent: number; opens: number; clicks: number; bounces: number }[];
  creatorStats: CreatorEmailData[];
  nicheStats: NicheEmailData[];
}

const InsightsPage = () => {
  const { currentWorkspace } = useWorkspace();
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    const fetchInsights = async () => {
      setLoading(true);
      const wsId = currentWorkspace.id;

      const results = await Promise.all([
        supabase
          .from("workspace_sending_metrics")
          .select("*")
          .eq("workspace_id", wsId)
          .order("metric_date", { ascending: true }),
        supabase
          .from("email_replies")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", wsId),
        supabase
          .from("search_queries")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", wsId),
        supabase
          .from("creator_lists")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", wsId),
        supabase
          .from("list_members")
          .select("creator_id, list_id, creator_profiles(niches)")
          .limit(1000),
        supabase
          .from("email_send_log")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", wsId),
        // Fetch email logs with recipient details for creator/niche analysis
        supabase
          .from("email_send_log")
          .select("to_email, to_name")
          .eq("workspace_id", wsId)
          .order("sent_at", { ascending: false })
          .limit(1000),
      ]);

      const metrics = results[0].data || [];
      const replyCount = results[1].count ?? 0;
      const searchCount = results[2].count ?? 0;
      const listCount = results[3].count ?? 0;
      const listMembers = results[4].data || [];
      const emailSentCount = results[5].count ?? 0;
      const emailLogs = results[6].data || [];

      const totalSent = emailSentCount;
      const totalOpens = (metrics || []).reduce((s, m) => s + (m.opens || 0), 0);
      const totalClicks = (metrics || []).reduce((s, m) => s + (m.clicks || 0), 0);
      const totalBounces = (metrics || []).reduce((s, m) => s + (m.bounces || 0), 0);

      const totalReplies = replyCount || 0;
      const replyRate = totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0;
      const openRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0;
      const clickRate = totalSent > 0 ? Math.round((totalClicks / totalSent) * 100) : 0;
      const bounceRate = totalSent > 0 ? Math.round((totalBounces / totalSent) * 100) : 0;

      // Workspace lists
      const { data: wsLists } = await supabase
        .from("creator_lists")
        .select("id")
        .eq("workspace_id", wsId);
      const wsListIds = new Set<string>((wsLists || []).map(l => l.id));
      const wsListMembers = (listMembers || []).filter((lm: any) => wsListIds.has(lm.list_id));
      const uniqueCreatorIds = new Set(wsListMembers.map((lm: any) => lm.creator_id));

      // Niche breakdown from saved creators
      const nicheCounts: Record<string, number> = {};
      wsListMembers.forEach((lm: any) => {
        const niches = lm.creator_profiles?.niches || [];
        niches.forEach((n: string) => {
          nicheCounts[n] = (nicheCounts[n] || 0) + 1;
        });
      });
      const nicheBreakdown = Object.entries(nicheCounts)
        .map(([niche, count]) => ({ niche, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);

      // Daily metrics
      const dailyMetrics = (metrics || []).slice(-14).map((m) => ({
        date: m.metric_date,
        sent: m.emails_sent || 0,
        opens: m.opens || 0,
        clicks: m.clicks || 0,
        bounces: m.bounces || 0,
      }));

      // Build creator stats: group emails by to_email, then match to creator_profiles
      const emailsByRecipient: Record<string, { count: number; to_name: string | null }> = {};
      emailLogs.forEach((log: any) => {
        const email = log.to_email?.toLowerCase();
        if (!email) return;
        if (!emailsByRecipient[email]) {
          emailsByRecipient[email] = { count: 0, to_name: log.to_name };
        }
        emailsByRecipient[email].count++;
      });

      // Fetch creator profiles that match emailed addresses
      const emailAddresses = Object.keys(emailsByRecipient);
      let matchedCreators: any[] = [];
      if (emailAddresses.length > 0) {
        // Batch in chunks of 50 for the in() filter
        const chunks = [];
        for (let i = 0; i < emailAddresses.length; i += 50) {
          chunks.push(emailAddresses.slice(i, i + 50));
        }
        const creatorResults = await Promise.all(
          chunks.map(chunk =>
            supabase
              .from("creator_profiles")
              .select("contact_email, follower_count, avatar_url, username, display_name, niches")
              .in("contact_email", chunk)
          )
        );
        matchedCreators = creatorResults.flatMap(r => r.data || []);
      }

      const creatorMap = new Map<string, any>();
      matchedCreators.forEach(c => {
        if (c.contact_email) creatorMap.set(c.contact_email.toLowerCase(), c);
      });

      const creatorStats: CreatorEmailData[] = emailAddresses
        .map(email => {
          const creator = creatorMap.get(email);
          const info = emailsByRecipient[email];
          return {
            to_email: email,
            to_name: info?.to_name ?? "",
            follower_count: creator?.follower_count || null,
            avatar_url: creator?.avatar_url || null,
            username: creator?.username || null,
            display_name: creator?.display_name || null,
            niches: creator?.niches || null,
            emailCount: info?.count ?? 0,
          };
        })
        .sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0));

      // Build niche email stats
      const nicheEmailMap: Record<string, { creators: Set<string>; emails: number; totalFollowers: number; count: number }> = {};
      creatorStats.forEach(c => {
        const niches = c.niches || [];
        niches.forEach(n => {
          if (!nicheEmailMap[n]) {
            nicheEmailMap[n] = { creators: new Set(), emails: 0, totalFollowers: 0, count: 0 };
          }
          nicheEmailMap[n].creators.add(c.to_email);
          nicheEmailMap[n].emails += c.emailCount;
          nicheEmailMap[n].totalFollowers += c.follower_count || 0;
          nicheEmailMap[n].count++;
        });
      });

      const nicheStats: NicheEmailData[] = Object.entries(nicheEmailMap)
        .map(([niche, data]) => ({
          niche,
          creatorCount: data.creators.size,
          emailCount: data.emails,
          avgFollowers: data.count > 0 ? Math.round(data.totalFollowers / data.count) : 0,
        }))
        .sort((a, b) => b.emailCount - a.emailCount)
        .slice(0, 15);

      setData({
        totalSent,
        totalReplies,
        replyRate,
        totalOpens,
        openRate,
        totalClicks,
        clickRate,
        totalBounces,
        bounceRate,
        totalSearches: searchCount || 0,
        totalLists: listCount || 0,
        totalCreatorsInLists: uniqueCreatorIds.size,
        nicheBreakdown,
        dailyMetrics,
        creatorStats,
        nicheStats,
      });
      setLoading(false);
    };
    fetchInsights();
  }, [currentWorkspace?.id]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 md:p-8 space-y-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-10 w-80 rounded-lg" />
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">Campaign Insights</h1>
        <p className="text-muted-foreground text-sm">Real-time performance metrics for your outreach campaigns</p>
      </div>

      <InsightsOverviewCards
        totalSearches={data.totalSearches}
        totalLists={data.totalLists}
        totalCreatorsInLists={data.totalCreatorsInLists}
        totalSent={data.totalSent}
        totalReplies={data.totalReplies}
        replyRate={data.replyRate}
      />

      <Tabs defaultValue="creators" className="w-full">
        <TabsList className="bg-secondary/50 border border-border mb-6">
          <TabsTrigger value="creators" className="gap-1.5 data-[state=active]:bg-card">
            <Users className="w-4 h-4" />
            Creators
          </TabsTrigger>
          <TabsTrigger value="niches" className="gap-1.5 data-[state=active]:bg-card">
            <Hash className="w-4 h-4" />
            Niches
          </TabsTrigger>
          <TabsTrigger value="deliverability" className="gap-1.5 data-[state=active]:bg-card">
            <Mail className="w-4 h-4" />
            Deliverability
          </TabsTrigger>
        </TabsList>

        <TabsContent value="creators">
          <CreatorsTab creatorStats={data.creatorStats} />
        </TabsContent>

        <TabsContent value="niches">
          <NichesTab nicheStats={data.nicheStats} nicheBreakdown={data.nicheBreakdown} />
        </TabsContent>

        <TabsContent value="deliverability">
          <DeliverabilityTab
            totalSent={data.totalSent}
            totalReplies={data.totalReplies}
            replyRate={data.replyRate}
            totalOpens={data.totalOpens}
            openRate={data.openRate}
            totalClicks={data.totalClicks}
            clickRate={data.clickRate}
            totalBounces={data.totalBounces}
            bounceRate={data.bounceRate}
            dailyMetrics={data.dailyMetrics}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default InsightsPage;
