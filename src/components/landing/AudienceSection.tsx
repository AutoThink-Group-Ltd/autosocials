import { motion } from "framer-motion";
import { BrandIconStartup, BrandIconAgency, BrandIconEcommerce, BrandIconLocal, BrandIconGrowth } from "./BrandIcons";

const audiences = [
  { Icon: BrandIconStartup, title: "SaaS Startups", description: "Find creators who genuinely talk about your product category" },
  { Icon: BrandIconAgency, title: "Agencies", description: "Run creator outreach campaigns for multiple clients at once" },
  { Icon: BrandIconEcommerce, title: "Ecommerce Brands", description: "Discover creators who review and showcase products like yours" },
  { Icon: BrandIconLocal, title: "Local Businesses", description: "Find local creators to drive foot traffic and awareness" },
  { Icon: BrandIconGrowth, title: "Growing Companies", description: "Scale your social presence without scaling your team" },
];

const AudienceSection = () => {
  return (
    <section id="who-its-for" className="py-24 md:py-36 bg-secondary/30 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_70%_30%,hsl(var(--brand-purple)/0.04),transparent)]" />
      <div className="relative max-w-7xl mx-auto px-6">
        <motion.div
          className="max-w-2xl mx-auto text-center mb-16"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.4 }}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-4 block">Who it's for</span>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 leading-tight">
            Built for teams that{" "}
            <span className="gradient-brand-text">want to grow</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            From solo founders to brand teams — AutoSocials works for anyone serious about social growth.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {audiences.map((item, i) => (
            <motion.div
              key={i}
              className="flex items-start gap-4 p-6 rounded-2xl bg-card border border-border hover:border-primary/15 hover:shadow-card transition-all duration-200 group"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
            >
              <div className="flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                <item.Icon className="w-11 h-11" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AudienceSection;
