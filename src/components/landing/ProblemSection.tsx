import { motion } from "framer-motion";
import { BrandIconSearch, BrandIconScatter, BrandIconBlind, BrandIconLeak } from "./BrandIcons";

const problems = [
  { Icon: BrandIconSearch, title: "Hours of manual research", description: "Scrolling through social feeds trying to find creators who fit your brand." },
  { Icon: BrandIconScatter, title: "Scattered outreach", description: "Copy-pasting messages across DMs, emails, and platforms with no system." },
  { Icon: BrandIconBlind, title: "Zero visibility", description: "No way to track who replied, who's interested, or where things stand." },
  { Icon: BrandIconLeak, title: "Missed opportunities", description: "Great creators slip through the cracks because there's no pipeline." },
];

const ProblemSection = () => {
  return (
    <section className="py-24 md:py-36 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_20%_50%,hsl(var(--brand-pink)/0.04),transparent)]" />
      <div className="relative max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.4 }}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-4 block">The problem</span>
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6 leading-tight">
              Creator outreach
              <br />
              <span className="gradient-brand-text">shouldn't be this hard.</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
              Businesses waste countless hours trying to find, contact, and collaborate with creators — using tools that weren't designed for this workflow.
            </p>
          </motion.div>

          <div className="space-y-4">
            {problems.map((problem, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-4 p-5 bg-card rounded-2xl border border-border hover:border-primary/15 hover:shadow-card transition-all duration-200 group"
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <div className="flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                  <problem.Icon className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">{problem.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{problem.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProblemSection;
