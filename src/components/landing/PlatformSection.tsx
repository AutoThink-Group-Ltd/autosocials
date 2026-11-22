import { motion } from "framer-motion";
import { CheckCircle2, Clock } from "lucide-react";

const platforms = [
  { name: "TikTok", status: "live" as const, description: "Discover and contact TikTok creators today", icon: "🎵" },
  { name: "Instagram", status: "coming" as const, description: "Reels creators and brand collaborations", icon: "📸" },
  { name: "YouTube", status: "coming" as const, description: "Long-form and Shorts creators", icon: "▶️" },
  { name: "Facebook Pages", status: "coming" as const, description: "Page owners and content creators", icon: "👥" },
];

const PlatformSection = () => {
  return (
    <section id="platforms" className="py-24 md:py-36 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_30%_80%,hsl(var(--brand-pink)/0.04),transparent)]" />
      <div className="relative max-w-7xl mx-auto px-6">
        <motion.div
          className="max-w-2xl mx-auto text-center mb-16"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.4 }}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-4 block">Multi-platform</span>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 leading-tight">
            One platform.{" "}
            <span className="gradient-brand-text">Every channel.</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Starting with TikTok. Expanding to every major platform where creators drive growth.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-4xl mx-auto">
          {platforms.map((platform, i) => (
            <motion.div
              key={i}
              className={`relative p-6 rounded-2xl border transition-all duration-200 group cursor-pointer overflow-hidden ${
                platform.status === "live"
                  ? "bg-card border-primary/20 shadow-card hover:shadow-elevated"
                  : "bg-card border-border hover:border-primary/10 hover:shadow-card"
              }`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              whileHover={{ y: -4 }}
            >
              {platform.status === "live" && (
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,hsl(var(--brand-pink)/0.05),transparent)] opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
              <div className="relative">
                <span className="text-3xl mb-4 block group-hover:scale-110 transition-transform origin-left">{platform.icon}</span>
                <div className="flex items-center gap-1.5 mb-3">
                  {platform.status === "live" ? (
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  ) : (
                    <Clock className="w-4 h-4 text-muted-foreground/40" />
                  )}
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                    platform.status === "live" ? "text-primary" : "text-muted-foreground/40"
                  }`}>
                    {platform.status === "live" ? "Live now" : "Coming soon"}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">{platform.name}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{platform.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PlatformSection;
