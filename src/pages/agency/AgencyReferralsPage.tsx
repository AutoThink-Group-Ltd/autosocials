import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Link2, Copy, Plus, MousePointerClick, UserPlus, TrendingUp,
  Loader2, DollarSign, Percent,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays, startOfDay } from "date-fns";

const AgencyReferralsPage = () => {
  const { user } = useAuth();
  const [agencyProfile, setAgencyProfile] = useState<any>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [clicks, setClicks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) loadData();
  }, [user?.id]);

  const loadData = async () => {
    const { data: profile } = await supabase
      .from("agency_profiles")
      .select("*")
      .eq("user_id", user!.id)
      .single();

    setAgencyProfile(profile);

    if (profile) {
      const { data: linksData } = await supabase
        .from("agency_referral_links")
        .select("*")
        .eq("agency_user_id", user!.id)
        .order("created_at", { ascending: false });
      setLinks(linksData || []);

      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data: clicksData } = await supabase
        .from("agency_referral_clicks")
        .select("clicked_at")
        .eq("agency_profile_id", profile.id)
        .gte("clicked_at", thirtyDaysAgo)
        .order("clicked_at", { ascending: true });
      setClicks(clicksData || []);
    }

    setLoading(false);
  };

  const totalClicks = links.reduce((sum, l) => sum + (l.click_count || 0), 0);
  const totalSignups = links.reduce((sum, l) => sum + (l.signup_count || 0), 0);
  const conversionRate = totalClicks > 0 ? ((totalSignups / totalClicks) * 100).toFixed(1) : "0";

  const defaultLink = agencyProfile?.referral_code
    ? `${window.location.origin}/partner/${agencyProfile.referral_code}`
    : null;

  // Build 30-day chart data
  const chartData = useMemo(() => {
    const days: { date: string; clicks: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = startOfDay(subDays(new Date(), i));
      const dayStr = format(day, "yyyy-MM-dd");
      const label = format(day, "MMM d");
      const count = clicks.filter((c) => {
        const clickDay = format(new Date(c.clicked_at), "yyyy-MM-dd");
        return clickDay === dayStr;
      }).length;
      days.push({ date: label, clicks: count });
    }
    return days;
  }, [clicks]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Link copied to clipboard");
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agencyProfile || !newSlug.trim()) return;
    setCreating(true);
    try {
      const slug = newSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const { error } = await supabase.from("agency_referral_links").insert({
        agency_profile_id: agencyProfile.id,
        agency_user_id: user!.id,
        slug,
        label: newLabel.trim() || slug,
      });
      if (error) throw error;
      toast.success("Referral link created");
      setNewSlug("");
      setNewLabel("");
      setCreateOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create link");
    } finally {
      setCreating(false);
    }
  };

  const toggleLink = async (id: string, isActive: boolean) => {
    await supabase
      .from("agency_referral_links")
      .update({ is_active: !isActive })
      .eq("id", id);
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, is_active: !isActive } : l)));
  };

  // Auto-generate slug from label
  const handleLabelChange = (val: string) => {
    setNewLabel(val);
    if (!newSlug || newSlug === newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")) {
      setNewSlug(val.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 md:p-8 flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!agencyProfile) {
    return (
      <div className="p-4 sm:p-6 md:p-8 space-y-6">
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">Referral Links</h1>
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Link2 className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground">Agency profile required</h3>
            <p className="text-sm text-muted-foreground mt-1">Complete your agency profile in Settings to get your referral links.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">Referral Links</h1>
          <p className="text-muted-foreground mt-1">Share referral links and earn recurring commission</p>
        </div>
        <Button variant="default" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Link
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Total Clicks", value: totalClicks, icon: MousePointerClick, color: "text-blue-500" },
          { label: "Total Signups", value: totalSignups, icon: UserPlus, color: "text-green-500" },
          { label: "Conversion Rate", value: `${conversionRate}%`, icon: Percent, color: "text-foreground" },
          { label: "Active Links", value: links.filter((l) => l.is_active).length, icon: Link2, color: "text-foreground" },
        ].map((stat) => (
          <Card key={stat.label} className="border-border">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <p className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Clicks chart - last 30 days */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Clicks — Last 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="clickGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  interval="preserveStartEnd"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="clicks"
                  stroke="hsl(var(--primary))"
                  fill="url(#clickGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Commission info */}
      <Card className="border-primary/20 bg-secondary">
        <CardContent className="p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Earn 20% Recurring Commission</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Every client who signs up through your referral link and subscribes to a paid plan earns you 20% recurring commission for as long as they remain a subscriber.
            </p>
            <Button variant="link" className="px-0 mt-1 h-auto text-foreground" onClick={() => window.location.href = "/agency/revenue"}>
              View Revenue →
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Default referral link */}
      {defaultLink && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Default Referral Link</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 rounded-lg bg-secondary text-sm text-foreground font-mono truncate">
                {defaultLink}
              </div>
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(defaultLink)}>
                <Copy className="w-4 h-4 mr-1" />
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Custom referral links table */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Custom Referral Links ({links.length})</CardTitle>
          <CardDescription>Create custom-slugged links for different campaigns and placements</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {links.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <Link2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No custom links yet. Create one for specific campaigns.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Signups</TableHead>
                  <TableHead>Conv.</TableHead>
                  <TableHead>Last Click</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => {
                  const fullUrl = `${window.location.origin}/partner/${agencyProfile.referral_code}/${link.slug}`;
                  const linkConv = (link.click_count || 0) > 0
                    ? (((link.signup_count || 0) / (link.click_count || 1)) * 100).toFixed(1) + "%"
                    : "—";
                  return (
                    <TableRow key={link.id}>
                      <TableCell className="font-medium">{link.label || link.slug}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground font-mono truncate max-w-[180px] block">
                          /partner/.../{link.slug}
                        </span>
                      </TableCell>
                      <TableCell>{link.click_count || 0}</TableCell>
                      <TableCell>{link.signup_count || 0}</TableCell>
                      <TableCell className="text-sm">{linkConv}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {link.last_clicked_at
                          ? format(new Date(link.last_clicked_at), "MMM d, HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={link.is_active}
                          onCheckedChange={() => toggleLink(link.id, link.is_active)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => copyToClipboard(fullUrl)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Link Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Referral Link</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateLink} className="space-y-4">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={newLabel}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder="e.g. LinkedIn Bio, Email Signature"
              />
            </div>
            <div className="space-y-2">
              <Label>Custom Slug <span className="text-destructive">*</span></Label>
              <Input
                required
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="e.g. linkedin, email-sig"
              />
              {newSlug && agencyProfile?.referral_code && (
                <p className="text-xs text-muted-foreground font-mono">
                  {window.location.origin}/partner/{agencyProfile.referral_code}/{newSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-")}
                </p>
              )}
            </div>
            <Button type="submit" variant="default" className="w-full" disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Create Link
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AgencyReferralsPage;
