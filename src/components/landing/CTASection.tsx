import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const CTASection = () => {
  return (
    <section className="py-24 md:py-36 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          className="relative max-w-4xl mx-auto text-center p-12 md:p-20 rounded-3xl overflow-hidden"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.4 }}
        >
          {/* Background layers */}
          <div className="absolute inset-0 gradient-brand opacity-[0.06]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,hsl(var(--brand-pink)/0.1),transparent)]" />
          <div className="absolute inset-0 border border-primary/10 rounded-3xl" />

          <div className="relative">
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/15 mb-8"
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <div className="w-1.5 h-1.5 rounded-full gradient-brand" />
              <span className="text-xs font-medium text-primary">Free to start — no credit card required</span>
            </motion.div>

            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-5 leading-tight">
              Ready to scale your{" "}
              <span className="gradient-brand-text">social growth?</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto">
              Join businesses already using AutoSocials to discover creators, reach out, and grow their social presence.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/app">
                <Button variant="brand" size="xl" className="group">
                  Get Started Free
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button variant="outline" size="xl">
                  See How It Works
                </Button>
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
