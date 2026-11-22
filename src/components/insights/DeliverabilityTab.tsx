import { motion } from "framer-motion";
import { Send, Eye, MousePointerClick, AlertTriangle, Mail, MessageSquare, TrendingUp, BarChart3 } from "lucide-react";

interface DeliverabilityTabProps {
  totalSent: number;
  totalReplies: number;
  replyRate: number;
  totalOpens: number;
  openRate: number;
  totalClicks: number;
  clickRate: number;
  totalBounces: number;
  bounceRate: number;
  dailyMetrics: { date: string; sent: number; opens: number; clicks: number; bounces: number }[];
}

const DeliverabilityTab = (props: DeliverabilityTabProps) => {
  const { totalSent, totalReplies, replyRate, totalOpens, openRate, totalClicks, clickRate, totalBounces, bounceRate, dailyMetrics } = props;

  const stats = [
    { label: "Emails Sent", value: totalSent.toLocaleString(), icon: Send, color: "text-primary" },
    { label: "Replies Received", value: totalReplies.toLocaleString(), icon: MessageSquare, color: "text-emerald-500" },
    { label: "Reply Rate", value: `${replyRate}%`, icon: TrendingUp, color: "text-violet-500" },
    { label: "Opens", value: totalOpens.toLocaleString(), icon: Eye, color: "text-blue-500" },
    { label: "Open Rate", value: `${openRate}%`, icon: Mail, color: "text-sky-500" },
    { label: "Clicks", value: totalClicks.toLocaleString(), icon: MousePointerClick, color: "text-amber-500" },
    { label: "Click Rate", value: `${clickRate}%`, icon: BarChart3, color: "text-orange-500" },
    { label: "Bounce Rate", value: `${bounceRate}%`, icon: AlertTriangle, color: "text-destructive" },
  ];

  const deliverySummary = [
    { label: "Delivered", value: totalSent - totalBounces, pct: totalSent > 0 ? Math.round(((totalSent - totalBounces) / totalSent) * 100) : 0, color: "stroke-emerald-500" },
    { label: "Opened", value: totalOpens, pct: openRate, color: "stroke-blue-500" },
    { label: "Clicked", value: totalClicks, pct: clickRate, color: "stroke-amber-500" },
    { label: "Bounced", value: totalBounces, pct: bounceRate, color: "stroke-destructive" },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            className="bg-card rounded-xl border border-border p-5 hover:shadow-card hover:-translate-y-0.5 transition-all duration-200"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center mb-3">
              <stat.icon className={`w-[18px] h-[18px] ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Daily sending chart */}
        <motion.div
          className="bg-card rounded-xl border border-border p-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-sm font-semibold text-foreground mb-5 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Daily Sending (Last 14 Days)
          </h3>
          {dailyMetrics.length > 0 ? (
            <div className="space-y-2">
              {dailyMetrics.map((d, i) => {
                const maxVal = Math.max(...dailyMetrics.map(m => m.sent), 1);
                return (
                  <div key={d.date} className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground w-16 text-right font-mono">
                      {new Date(d.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    </span>
                    <div className="flex-1 h-6 bg-secondary/50 rounded-md overflow-hidden">
                      <motion.div
                        className="h-full bg-primary/80 rounded-md flex items-center px-2"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max((d.sent / maxVal) * 100, 2)}%` }}
                        transition={{ duration: 0.5, delay: 0.3 + i * 0.03 }}
                      >
                        {d.sent > 0 && (
                          <span className="text-[10px] font-semibold text-primary-foreground">{d.sent}</span>
                        )}
                      </motion.div>
                    </div>
                    <div className="flex gap-2 text-[10px] text-muted-foreground w-28">
                      <span title="Opens">👁 {d.opens}</span>
                      <span title="Clicks">🖱 {d.clicks}</span>
                      <span title="Bounces">⚠ {d.bounces}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No sending data yet. Send your first campaign to see metrics here.
            </div>
          )}
        </motion.div>

        {/* Donut summary */}
        <motion.div
          className="bg-card rounded-xl border border-border p-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <h3 className="text-sm font-semibold text-foreground mb-5 flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" /> Deliverability Summary
          </h3>
          <div className="grid grid-cols-2 gap-6">
            {deliverySummary.map((item) => (
              <div key={item.label} className="text-center">
                <div className="relative w-20 h-20 mx-auto mb-3">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-secondary" strokeWidth="2.5" />
                    <circle
                      cx="18" cy="18" r="15.9" fill="none"
                      className={item.color}
                      strokeWidth="2.5"
                      strokeDasharray={`${item.pct} ${100 - item.pct}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">
                    {item.pct}%
                  </span>
                </div>
                <p className="text-base font-semibold text-foreground">{item.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default DeliverabilityTab;
