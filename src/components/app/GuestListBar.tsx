import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useGuestLists, type GuestCreator } from "@/hooks/useGuestLists";
import { SignupGateDialog } from "./SignupGateDialog";
import { List, X, Trash2, ArrowRight, Download, Send, AlertTriangle, MapPin } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";

function formatCount(n: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

const gradients = [
  "from-pink-400 to-rose-500",
  "from-violet-400 to-purple-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-cyan-400 to-blue-500",
];

export function GuestListBar() {
  const { creators, count, removeCreator, clearAll } = useGuestLists();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateAction, setGateAction] = useState("");
  const navigate = useNavigate();

  if (count === 0) return null;

  function triggerGate(action: string) {
    setGateAction(action);
    setGateOpen(true);
  }

  return (
    <>
      {/* Floating bar */}
      <AnimatePresence>
        <motion.div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
        >
          <div className="flex items-center gap-3 px-5 py-3 bg-card/95 backdrop-blur-lg rounded-2xl border border-border shadow-elevated">
            {/* Avatars stack */}
            <div className="flex -space-x-2">
              {creators.slice(0, 4).map((c, i) => (
                c.avatar_url ? (
                  <img
                    key={c.id}
                    src={c.avatar_url}
                    alt=""
                    className="w-7 h-7 rounded-full border-2 border-card object-cover"
                  />
                ) : (
                  <div
                    key={c.id}
                    className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradients[i % gradients.length]} border-2 border-card flex items-center justify-center`}
                  >
                    <span className="text-white text-[9px] font-bold">
                      {(c.display_name || c.username)[0]?.toUpperCase()}
                    </span>
                  </div>
                )
              ))}
              {count > 4 && (
                <div className="w-7 h-7 rounded-full bg-secondary border-2 border-card flex items-center justify-center">
                  <span className="text-[9px] font-medium text-muted-foreground">+{count - 4}</span>
                </div>
              )}
            </div>

            <div className="text-sm font-medium text-foreground">
              <span className="gradient-brand-text font-bold">{count}</span>{" "}
              creator{count !== 1 ? "s" : ""} saved
            </div>

            <div className="w-px h-5 bg-border" />

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8">
                  <List className="w-3.5 h-3.5" />
                  View List
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md p-0">
                <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
                  <SheetTitle className="flex items-center justify-between">
                    <span>Your Saved Creators ({count})</span>
                  </SheetTitle>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Temporary — disappears when you close this tab</span>
                  </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2" style={{ maxHeight: "calc(100vh - 260px)" }}>
                  {creators.map((creator, i) => {
                    const g = gradients[i % gradients.length];
                    return (
                      <div
                        key={creator.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors group cursor-pointer"
                        onClick={() => { navigate(`/creator/${creator.id}`); setSheetOpen(false); }}
                      >
                        {creator.avatar_url ? (
                          <img src={creator.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 border border-border" />
                        ) : (
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${g} flex items-center justify-center shrink-0`}>
                            <span className="text-white text-xs font-bold">{(creator.display_name || creator.username)[0]?.toUpperCase()}</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm text-foreground truncate">{creator.display_name || creator.username}</div>
                          <div className="text-xs text-muted-foreground">@{creator.username} · {formatCount(creator.follower_count)} followers</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeCreator(creator.id); }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Action buttons - all gated */}
                <div className="border-t border-border p-5 space-y-2">
                  <Button variant="brand" size="lg" className="w-full gap-2 group" onClick={() => triggerGate("Save your list permanently")}>
                    Save List Permanently
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => triggerGate("Export your creator list")}>
                      <Download className="w-3.5 h-3.5" /> Export
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => triggerGate("Contact these creators")}>
                      <Send className="w-3.5 h-3.5" /> Contact
                    </Button>
                  </div>
                  <button
                    onClick={clearAll}
                    className="w-full text-center text-xs text-muted-foreground hover:text-destructive transition-colors py-1.5 flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Clear all
                  </button>
                </div>
              </SheetContent>
            </Sheet>

            <Button variant="brand" size="sm" className="text-xs gap-1.5 h-8" onClick={() => triggerGate("Sign up to unlock your list")}>
              Sign Up to Keep
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>

      <SignupGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        savedCount={count}
        action={gateAction}
      />
    </>
  );
}
