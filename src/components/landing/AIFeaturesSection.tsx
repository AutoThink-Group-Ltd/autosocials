import { motion } from "framer-motion";
import { BrandIconAIMatch, BrandIconBrief, BrandIconSmartMsg, BrandIconAutomation } from "./BrandIcons";

const features = [
  {
    Icon: BrandIconAIMatch,
    title: "AI creator matching",
    description: "Enter your product or website — AutoSocials understands your category and finds creators making relevant content.",
    tag: "Coming soon",
  },
  {
    Icon: BrandIconBrief,
    title: "Auto-generated briefs",
    description: "Get collaboration briefs tailored to each creator, based on their content style and your brand.",
    tag: "Coming soon",
  },
  {
    Icon: BrandIconSmartMsg,
    title: "Smart outreach messages",
    description: "AI-drafted invite messages that feel personal, not templated. Customised for each creator.",
    tag: "Coming soon",
  },
  {
    Icon: BrandIconAutomation,
    title: "Follow-up automation",
    description: "Automatic follow-ups at the right time, so you never miss a warm lead.",
    tag: "Coming soon",
  },
];

const AIFeaturesSection = () => {
  return (
    <section className="py-24 md:py-36 bg-secondary/30 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_80%_20%,hsl(var(--brand-purple)/0.05),transparent)]" />
      <div className="relative max-w-7xl mx-auto px-6">
        <motion.div
          className="max-w-2xl mx-auto text-center mb-16"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.4 }}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-4 block">AI-powered</span>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 leading-tight">
            Your AI-powered{" "}
            <span className="gradient-brand-text">growth co-pilot</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            AutoSocials is building intelligent features to automate the hardest parts of creator collaboration.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              className="relative p-8 bg-card rounded-2xl border border-border hover:border-primary/15 hover:shadow-elevated transition-all duration-200 group overflow-hidden"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--brand-pink)/0.03),transparent)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative">
                <div className="flex items-center justify-between mb-5">
                  <div className="group-hover:scale-105 transition-transform duration-200">
                    <feature.Icon className="w-11 h-11" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-2.5 py-1 bg-secondary rounded-full">
                    {feature.tag}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AIFeaturesSection;
