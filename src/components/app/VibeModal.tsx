import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, Loader2, Search, Lightbulb, Zap, ArrowRight, X, Users, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface VibeResponse {
  message: string;
  keywords: string[];
  creator_types?: string[];
  pro_tips?: string[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  vibeData?: VibeResponse;
}

interface VibeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearchKeyword: (keyword: string) => void;
  onSearchAll: (keywords: string[]) => void;
}

export function VibeModal({ open, onOpenChange, onSearchKeyword, onSearchAll }: VibeModalProps) {
  const { currentWorkspace } = useWorkspace();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [latestKeywords, setLatestKeywords] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      // Keep conversation so user can return
    }
  }, [open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.role === "assistant" && m.vibeData ? m.vibeData.message : m.content,
      }));

      const { data, error } = await supabase.functions.invoke("vibe-suggest", {
        body: {
          message: text,
          history,
          workspace: currentWorkspace
            ? {
                name: currentWorkspace.name,
                software_name: currentWorkspace.software_name,
                software_url: currentWorkspace.software_url,
                website: currentWorkspace.website,
                business_model: currentWorkspace.business_model,
              }
            : null,
        },
      });

      if (error) throw error;

      const vibeData = data as VibeResponse;
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: vibeData.message,
        vibeData,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (vibeData.keywords?.length) {
        setLatestKeywords(vibeData.keywords);
      }
    } catch (err: any) {
      console.error("Vibe error:", err);
      toast.error(err?.message || "Failed to get suggestions from Vibe");
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeywordClick(keyword: string) {
    onSearchKeyword(keyword);
    onOpenChange(false);
  }

  function handleFindAll() {
    if (latestKeywords.length === 0) return;
    onSearchAll(latestKeywords);
    onOpenChange(false);
  }

  const hasKeywords = latestKeywords.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <span className="text-lg font-bold">Ask Vibe</span>
              <p className="text-xs text-muted-foreground font-normal mt-0.5">
                Your AI-powered creator discovery co-pilot
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Chat area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Tell Vibe what you're looking for</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Describe your brand, product, or the kind of creators you want to find. Vibe will suggest keywords, creator types, and search strategies.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md mt-2">
                {[
                  "I sell a SaaS email tool and want TikTok creators who review apps",
                  "Find me fitness creators who promote supplements",
                  "I need beauty influencers who do product reviews under 100K followers",
                  "Looking for tech creators who make 'apps you need' style videos",
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(suggestion);
                    }}
                    className="text-left text-xs p-3 rounded-xl border border-border bg-card hover:bg-secondary/50 hover:border-primary/20 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-primary text-primary-foreground text-sm">
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[90%] space-y-3">
                  {/* AI message */}
                  <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-secondary/60 text-sm text-foreground leading-relaxed">
                    {msg.vibeData?.message || msg.content}
                  </div>

                  {/* Keywords */}
                  {msg.vibeData?.keywords && msg.vibeData.keywords.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Search className="w-3 h-3" />
                        Suggested keywords — click to search
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.vibeData.keywords.map((kw, ki) => (
                          <motion.button
                            key={ki}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: ki * 0.03 }}
                            onClick={() => handleKeywordClick(kw)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary hover:bg-primary/20 border border-primary/15 hover:border-primary/30 transition-colors cursor-pointer"
                          >
                            <Tag className="w-3 h-3" />
                            {kw}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Creator types */}
                  {msg.vibeData?.creator_types && msg.vibeData.creator_types.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Users className="w-3 h-3" />
                        Creator types to target
                      </div>
                      <div className="space-y-1">
                        {msg.vibeData.creator_types.map((ct, ci) => (
                          <div
                            key={ci}
                            className="text-xs text-muted-foreground pl-3 border-l-2 border-primary/20 py-0.5"
                          >
                            {ct}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pro tips */}
                  {msg.vibeData?.pro_tips && msg.vibeData.pro_tips.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Lightbulb className="w-3 h-3" />
                        Pro tips
                      </div>
                      <div className="space-y-1">
                        {msg.vibeData.pro_tips.map((tip, ti) => (
                          <div
                            key={ti}
                            className="text-xs text-muted-foreground pl-3 border-l-2 border-amber-400/30 py-0.5"
                          >
                            💡 {tip}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-secondary/60 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Vibe is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Find All bar */}
        <AnimatePresence>
          {hasKeywords && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="px-6 py-3 border-t border-border bg-primary/5 shrink-0"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{latestKeywords.length} keywords</span> ready to search
                </div>
                <Button
                  onClick={handleFindAll}
                  className="gap-2 gradient-brand text-primary-foreground"
                  size="sm"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Find them all
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input area */}
        <div className="px-6 py-4 border-t border-border shrink-0">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Describe the creators you're looking for..."
              className="min-h-[44px] max-h-[120px] resize-none text-sm"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="shrink-0 h-[44px] w-[44px] gradient-brand text-primary-foreground"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
