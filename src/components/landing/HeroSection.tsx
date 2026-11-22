import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import CreatorNetworkViz from "./CreatorNetworkViz";

const simulationSteps = [
  { text: "Analyzing your product category...", delay: 800 },
  { text: "Found 3,482 relevant creators", delay: 1600, done: true },
  { text: "Generated collaboration brief", delay: 2400, done: true },
  { text: "Drafted creator outreach messages", delay: 3200, done: true },
];

const HeroSection = () => {
  const [inputValue, setInputValue] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState<number[]>([]);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const placeholders = ["example.com", "your-brand.com"];

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSimulate = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setVisibleSteps([]);
    simulationSteps.forEach((_, i) => {
      setTimeout(() => setVisibleSteps((prev) => [...prev, i]), simulationSteps[i]?.delay ?? 0);
    });
    setTimeout(() => setIsSimulating(false), 4500);
  };

  return (
    <section className="relative pt-32 pb-20 md:pt-44 md:pb-36 overflow-hidden">
      {/* Layered background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--brand-pink)/0.08),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--brand-pink)/0.2),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_60%,hsl(var(--brand-purple)/0.05),transparent)] dark:bg-[radial-gradient(ellipse_60%_40%_at_80%_60%,hsl(var(--brand-purple)/0.15),transparent)]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[radial-gradient(circle,hsl(var(--brand-pink)/0.03),transparent_70%)] dark:bg-[radial-gradient(circle,hsl(var(--brand-pink)/0.1),transparent_70%)]" />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left - Copy + interactive input */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/8 border border-primary/15 mb-8">
                <div className="w-1.5 h-1.5 rounded-full gradient-brand animate-pulse" />
                <span className="text-xs font-medium text-foreground/70">Your social growth engine</span>
              </div>
            </motion.div>

            <motion.h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.08] mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Discover creators.{" "}
              <br className="hidden sm:block" />
              Scale your{" "}
              <span className="gradient-brand-text">social growth.</span>
            </motion.h1>

            <motion.p
              className="text-lg text-muted-foreground max-w-lg mb-10 leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Find relevant creators, recruit them at scale, and manage collaborations — all from one platform. Starting with TikTok.
            </motion.p>

            {/* Interactive product entry */}
            <motion.div
              className="mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <div className="relative max-w-md">
                <div className="flex items-center gap-2 p-1.5 bg-card rounded-xl border border-border shadow-elevated">
                  <div className="flex-1 relative">
                    <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={placeholders[placeholderIndex]}
                      className="w-full h-11 pl-9 pr-4 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-hidden"
                      onKeyDown={(e) => e.key === "Enter" && handleSimulate()}
                    />
                  </div>
                  <Button variant="brand" size="sm" onClick={handleSimulate} className="rounded-lg h-9 px-4">
                    Find Creators
                  </Button>
                </div>

                {/* Simulation results */}
                <AnimatePresence>
                  {visibleSteps.length > 0 && (
                    <motion.div
                      className="mt-3 p-4 bg-card rounded-xl border border-border shadow-card space-y-2.5"
                      initial={{ opacity: 0, y: -8, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: "auto" }}
                      exit={{ opacity: 0, y: -8 }}
                    >
                      {visibleSteps.map((stepIdx) => {
                        const step = simulationSteps[stepIdx];
                        if (!step) return null;
                        return (
                          <motion.div
                            key={stepIdx}
                            className="flex items-center gap-2.5"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                          >
                            {step.done ? (
                              <div className="w-5 h-5 rounded-full gradient-brand flex items-center justify-center">
                                <Check className="w-3 h-3 text-primary-foreground" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                            )}
                            <span className={`text-sm ${step.done ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                              {step.text}
                            </span>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            <motion.div
              className="flex flex-col sm:flex-row items-start gap-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <Link to="/app">
                <Button variant="brand" size="lg" className="group">
                  Start Discovering Creators
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button variant="ghost" size="lg" className="text-muted-foreground">
                  See How It Works
                </Button>
              </a>
            </motion.div>
          </div>

          {/* Right - Network visualization */}
          <motion.div
            className="relative hidden lg:block"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <div className="relative aspect-square max-w-[500px] mx-auto">
              {/* Glow behind */}
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,hsl(var(--brand-pink)/0.08),transparent_60%)] dark:bg-[radial-gradient(circle,hsl(var(--brand-pink)/0.2),transparent_60%)]" />
              <CreatorNetworkViz />
              {/* Floating labels */}
              <motion.div
                className="absolute top-8 right-4 px-3 py-1.5 bg-card/90 backdrop-blur-sm rounded-lg border border-border shadow-soft text-xs font-medium text-foreground"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <span className="text-primary mr-1">↑ 24%</span> engagement
              </motion.div>
              <motion.div
                className="absolute bottom-12 left-0 px-3 py-1.5 bg-card/90 backdrop-blur-sm rounded-lg border border-border shadow-soft text-xs font-medium text-foreground"
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              >
                <span className="gradient-brand-text font-semibold">3,482</span> creators found
              </motion.div>
              <motion.div
                className="absolute top-1/2 -right-2 px-3 py-1.5 bg-card/90 backdrop-blur-sm rounded-lg border border-border shadow-soft text-xs font-medium text-foreground"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              >
                ✉️ 12 replies today
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
