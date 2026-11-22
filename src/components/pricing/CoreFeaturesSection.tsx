import { motion } from "framer-motion";
import { Check, Zap } from "lucide-react";
import { SHARED_FEATURES } from "@/config/stripePlans";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 16, scale: 0.95 } as const,
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 260, damping: 20 } },
};

export default function CoreFeaturesSection() {
  return (
    <div className="relative">
      {/* Glow background */}
      <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-primary/8 via-primary/4 to-transparent blur-xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-6 sm:p-8"
      >
        {/* Header */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          >
            <Zap className="w-5 h-5 text-primary fill-primary/20" />
          </motion.div>
          <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
            Everything you get with every plan
          </h3>
          <motion.div
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: 0.5 }}
          >
            <Zap className="w-5 h-5 text-primary fill-primary/20" />
          </motion.div>
        </div>

        {/* Feature pills */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="flex flex-wrap justify-center gap-3"
        >
          {SHARED_FEATURES.map((f) => (
            <motion.div
              key={f}
              variants={item}
              whileHover={{ scale: 1.05, y: -2 }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-primary/15 bg-primary/5 text-sm font-medium text-foreground shadow-xs hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-default"
            >
              <Check className="w-4 h-4 text-primary shrink-0" />
              <span>{f}</span>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
