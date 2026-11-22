import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { BrandIconDiscover, BrandIconOutreach, BrandIconCollaborate } from "./BrandIcons";

const steps = [
  {
    Icon: BrandIconDiscover,
    number: "01",
    title: "Discover",
    description: "Browse a curated feed of active creators. Filter by niche, platform, followers, location, and engagement.",
    visual: (
      <div className="space-y-2">
        {["SaaS & Tech", "Marketing", "AI Tools"].map((niche, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5 bg-background rounded-lg border border-border">
            <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold">{niche[0]}</span>
            </div>
            <div className="flex-1">
              <div className="h-2 w-20 bg-secondary rounded-full" />
              <div className="h-1.5 w-12 bg-secondary/60 rounded-full mt-1" />
            </div>
            <span className="text-[10px] font-medium text-primary px-2 py-0.5 bg-primary/8 rounded-full">{niche}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    Icon: BrandIconOutreach,
    number: "02",
    title: "Outreach",
    description: "Save creators to lists, craft personalized messages, and contact them in bulk. Future AI assistance built in.",
    visual: (
      <div className="p-3 bg-background rounded-lg border border-border">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full gradient-brand" />
          <div className="h-2 w-24 bg-secondary rounded-full" />
        </div>
        <div className="space-y-1.5 pl-8">
          <div className="h-2 w-full bg-secondary/60 rounded-full" />
          <div className="h-2 w-3/4 bg-secondary/40 rounded-full" />
        </div>
        <div className="mt-3 flex gap-2 pl-8">
          <div className="h-6 w-16 rounded-md gradient-brand opacity-80" />
          <div className="h-6 w-16 rounded-md bg-secondary" />
        </div>
      </div>
    ),
  },
  {
    Icon: BrandIconCollaborate,
    number: "03",
    title: "Collaborate",
    description: "Track every conversation, manage content delivery, and move creators through your pipeline from first contact to published content.",
    visual: (
      <div className="flex gap-2">
        {["Contacted", "Replied", "Delivered"].map((stage, i) => (
          <div key={i} className="flex-1 p-2 bg-background rounded-lg border border-border">
            <div className="text-[9px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{stage}</div>
            {Array.from({ length: 2 - i }).map((_, j) => (
              <div key={j} className="h-6 w-full bg-secondary/60 rounded mb-1.5 last:mb-0" />
            ))}
          </div>
        ))}
      </div>
    ),
  },
];

const SolutionSection = () => {
  return (
    <section id="how-it-works" className="py-24 md:py-36 bg-secondary/30 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,hsl(var(--brand-purple)/0.04),transparent)]" />
      <div className="relative max-w-7xl mx-auto px-6">
        <motion.div
          className="max-w-2xl mx-auto text-center mb-20"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.4 }}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-4 block">How it works</span>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 leading-tight">
            Three steps to{" "}
            <span className="gradient-brand-text">social growth</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            From discovery to delivered content — a clear, repeatable workflow.
          </p>
        </motion.div>

        <div className="space-y-8">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              className="grid md:grid-cols-2 gap-8 items-center p-8 md:p-10 bg-card rounded-2xl border border-border hover:shadow-elevated transition-all duration-300 group"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.35 }}
            >
              <div className={i % 2 === 1 ? "md:order-2" : ""}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-sm font-bold gradient-brand-text">{step.number}</span>
                  <step.Icon className="w-10 h-10 group-hover:scale-105 transition-transform duration-200" />
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-3">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed mb-4">{step.description}</p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all cursor-pointer">
                  Learn more <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className={`p-4 rounded-xl bg-secondary/50 ${i % 2 === 1 ? "md:order-1" : ""}`}>
                {step.visual}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SolutionSection;
