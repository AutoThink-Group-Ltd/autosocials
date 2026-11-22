import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Users, TrendingUp, AlertTriangle, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { formatPrice } from "@/config/stripePlans";

const AdminBillingPage = () => {
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch all subscriptions
  const { data: subscriptions, isLoading: subsLoading } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_subscriptions")
        .select("*, workspaces(name)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch cancellation events
  const { data: cancellations, isLoading: cancLoading } = useQuery({
    queryKey: ["admin-cancellations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cancellation_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Compute revenue metrics
  const planPrices: Record<string, Record<string, number>> = {
    starter: { monthly: 4900 },
    growth: { monthly: 7900 },
    scale: { monthly: 19900 },
    pro: { monthly: 29900 },
  };

  const activeSubs = subscriptions?.filter(
    (s) => Boolean(s.stripe_subscription_id) && !s.courtesy_plan_key && (s.subscription_status === "active" || s.subscription_status === "trialing")
  ) ?? [];

  const mrr = activeSubs.reduce((sum, s) => {
    const prices = planPrices[s.plan_key || ""] || {};
    const amount = prices["monthly"] || 0;
    return sum + amount;
  }, 0);

  const arr = mrr * 12;
  const totalSubscribers = activeSubs.length;

  // Filter subscriptions
  const filtered = subscriptions?.filter((s) => {
    if (planFilter !== "all" && s.plan_key !== planFilter) return false;
    if (statusFilter !== "all" && s.subscription_status !== statusFilter) return false;
    return true;
  }) ?? [];

  // Churn stats
  const totalCancellations = cancellations?.length ?? 0;
  const reasonCounts: Record<string, number> = {};
  cancellations?.forEach((c) => {
    const r = c.reason || "unknown";
    reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  });
  const topReasons = Object.entries(reasonCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const statusBadge = (status: string | null) => {
    const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      active: { variant: "default", label: "Active" },
      trialing: { variant: "secondary", label: "Trial" },
      canceled: { variant: "destructive", label: "Cancelled" },
      free: { variant: "outline", label: "Free" },
    };
    const s = map[status || "free"] || { variant: "outline" as const, label: status || "Unknown" };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing Admin</h1>
        <p className="text-muted-foreground text-sm">Manage subscriptions, revenue and churn.</p>
      </div>

      <Tabs defaultValue="subscriptions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="subscriptions" className="gap-1.5">
            <Users className="w-4 h-4" /> Subscriptions
          </TabsTrigger>
          <TabsTrigger value="revenue" className="gap-1.5">
            <TrendingUp className="w-4 h-4" /> Revenue
          </TabsTrigger>
          <TabsTrigger value="churn" className="gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Churn
          </TabsTrigger>
        </TabsList>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions" className="space-y-4">
          <div className="flex gap-3">
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Plan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="scale">Scale</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trialing">Trial</SelectItem>
                <SelectItem value="canceled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {subsLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Workspace</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Current Period End</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No subscriptions found</TableCell></TableRow>
                    ) : (
                      filtered.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{(s.workspaces as any)?.name || s.workspace_id.slice(0, 8)}</TableCell>
                          <TableCell className="capitalize">{s.plan_key || "—"}</TableCell>
                          <TableCell className="capitalize">{s.billing_period || "—"}</TableCell>
                          <TableCell>{statusBadge(s.subscription_status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.current_period_end ? format(new Date(s.current_period_end), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.updated_at ? format(new Date(s.updated_at), "MMM d, yyyy") : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Estimated Monthly Recurring Revenue</CardDescription>
                <CardTitle className="text-3xl flex items-baseline gap-1">
                  <DollarSign className="w-5 h-5 text-muted-foreground" />
                  {formatPrice(mrr)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Estimated Annual Run Rate</CardDescription>
                <CardTitle className="text-3xl flex items-baseline gap-1">
                  <TrendingUp className="w-5 h-5 text-muted-foreground" />
                  {formatPrice(arr)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Subscribers</CardDescription>
                <CardTitle className="text-3xl flex items-baseline gap-1">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  {totalSubscribers}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Breakdown by Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {["starter", "growth", "scale", "pro"].map((plan) => {
                  const count = activeSubs.filter((s) => s.plan_key === plan).length;
                  const planMrr = activeSubs
                    .filter((s) => s.plan_key === plan)
                    .reduce((sum, s) => {
                      const prices = planPrices[plan] || {};
                      return sum + (prices["monthly"] || 0);
                    }, 0);
                  return (
                    <div key={plan} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="capitalize font-medium text-sm">{plan}</span>
                        <Badge variant="outline">{count} subscribers</Badge>
                      </div>
                      <span className="text-sm font-medium">{formatPrice(planMrr)}/mo</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Churn Tab */}
        <TabsContent value="churn" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Cancellations</CardDescription>
                <CardTitle className="text-3xl">{totalCancellations}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Top Reason</CardDescription>
                <CardTitle className="text-xl capitalize">
                  {topReasons[0]?.[0]?.replace(/_/g, " ") || "N/A"}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Reason breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cancellation Reasons</CardTitle>
            </CardHeader>
            <CardContent>
              {topReasons.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cancellations recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {topReasons.map(([reason, count]) => (
                    <div key={reason} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                      <span className="text-sm capitalize">{reason.replace(/_/g, " ")}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent cancellations timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Cancellations</CardTitle>
            </CardHeader>
            <CardContent>
              {cancLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : cancellations?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cancellations yet.</p>
              ) : (
                <div className="space-y-3">
                  {cancellations?.slice(0, 20).map((c) => (
                    <div key={c.id} className="flex items-start justify-between py-2 border-b border-border/40 last:border-0">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium capitalize">{(c.reason || "unknown").replace(/_/g, " ")}</span>
                          {c.plan_key && <Badge variant="outline" className="text-xs capitalize">{c.plan_key}</Badge>}
                        </div>
                        {c.details && <p className="text-xs text-muted-foreground">{c.details}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {c.created_at ? format(new Date(c.created_at), "MMM d, yyyy") : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminBillingPage;
