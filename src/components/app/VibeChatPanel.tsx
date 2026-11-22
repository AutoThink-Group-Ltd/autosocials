import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Send, Loader2, Rocket, ArrowRight, RefreshCw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "@/lib/router-compat";
import { useToast } from "@/components/ui/use-toast";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import {
  BlockRenderer,
  parsePartialRich,
  useActionDispatcher,
  applyCompositionGuardrails,
} from "@/components/ai-chat";

export type Msg = { role: "user" | "assistant"; content: string };

interface Props {
  workspace: any;
  onTriggerSearch: (keywords: string[], platform: string, message: string, creatorTypes: string[], proTips: string[]) => void;
  messages: Msg[];
  onMessagesChange: (msgs: Msg[]) => void;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vibe-chat`;

const SUGGESTIONS = [
  "Find fitness creators who review supplements on TikTok",
  "I sell a project management SaaS — who should I partner with?",
  "Help me find beauty influencers on Instagram for a skincare launch",
  "I need UGC creators for a new coffee brand — search TikTok and Instagram",
];

export function VibeChatPanel({ workspace, onTriggerSearch, messages, onMessagesChange }: Props) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingSearch, setPendingSearch] = useState<{
    keywords: string[];
    platform: string;
    message: string;
    creator_types: string[];
    pro_tips: string[];
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [richEnabled, setRichEnabled] = useFeatureFlag("vibe_rich_chat", false);

  // Action dispatcher — registers default host handlers for Vibe's
  // emitted action ids. Confirmation gating is handled by the dispatcher.
  const { onAction, ConfirmDialog, register } = useActionDispatcher({
    notify: ({ title, description, tone }) =>
      toast({ title, description, variant: tone === "error" ? "destructive" : "default" }),
    navigate,
    workspaceId: workspace?.id ?? null,
  });
  useEffect(() => {
    register("discovery.run", {
      label: "Run discovery",
      handler: (payload) => {
        const kws = (payload?.["keywords"] as string[]) || [];
        const platform = (payload?.["platform"] as string) || "tiktok";
        if (kws.length) navigate(`/app?q=${encodeURIComponent(kws.join("|"))}&platform=${platform}`);
      },
    });
    register("lists.open", {
      label: "Open creator lists",
      handler: () => navigate("/app/lists"),
    });
    register("outreach.draft", {
      label: "Open outreach templates",
      handler: () => navigate("/app/templates"),
    });
    register("messages.open", {
      label: "Open messages",
      handler: () => navigate("/app/messages"),
    });
  }, [register, navigate]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const parseSearchAction = useCallback((fullContent: string) => {
    const jsonMatch = fullContent.match(/```json\s*\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1] ?? "");
        if (parsed.action === "trigger_search" && parsed.keywords?.length) {
          return {
            keywords: parsed.keywords,
            platform: parsed.platform || "tiktok",
            message: parsed.message || "",
            creator_types: parsed.creator_types || [],
            pro_tips: parsed.pro_tips || [],
          };
        }
      } catch { /* ignore parse errors */ }
    }
    return null;
  }, []);

  // Extract the last search action from all messages (for rerun button)
  const lastSearchAction = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && m.role === "assistant") {
        const action = parseSearchAction(m.content);
        if (action) return action;
      }
    }
    return null;
  })();

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Msg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    onMessagesChange(newMessages);
    setInput("");
    setIsLoading(true);
    setPendingSearch(null);

    let assistantSoFar = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          rich: richEnabled,
          workspace: workspace ? {
            name: workspace.name,
            software_name: workspace.software_name,
            software_url: workspace.software_url,
            website: workspace.website,
            business_model: workspace.business_model,
          } : null,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Failed to connect" }));
        throw new Error(err.error || "Failed to get response");
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              onMessagesChange([...newMessages, { role: "assistant", content: assistantSoFar }]);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Check if the final message contains a search action
      const result = parseSearchAction(assistantSoFar);
      if (result) setPendingSearch(result);
    } catch (e: any) {
      console.error("Vibe chat error:", e);
      onMessagesChange([
        ...newMessages,
        { role: "assistant", content: `Sorry, I ran into an issue: ${e.message}. Please try again!` },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleConfirmSearch = () => {
    if (pendingSearch) {
      onTriggerSearch(
        pendingSearch.keywords,
        pendingSearch.platform,
        pendingSearch.message,
        pendingSearch.creator_types,
        pendingSearch.pro_tips
      );
    }
  };

  // Clean display content (remove JSON action + vibe-rich envelopes from visible text).
  // Strips both closed and still-streaming open vibe-rich fences so the markdown
  // bubble never shows raw JSON.
  const cleanContent = (content: string) => {
    return content
      .replace(/```json\s*\n[\s\S]*?\n```/g, "")
      .replace(/```vibe-rich\s*[\s\S]*?```/gi, "")
      .replace(/```vibe-rich[\s\S]*$/i, "")
      .trim();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-xs">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Ask Vibe</h1>
            <p className="text-xs text-muted-foreground">Plan your creator discovery strategy with AI</p>
          </div>
          <button
            onClick={() => setRichEnabled(!richEnabled)}
            title={richEnabled ? "Disable rich blocks (beta)" : "Enable rich blocks (beta)"}
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-medium transition-colors",
              richEnabled
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
            )}
          >
            <Wand2 className="w-3 h-3" />
            Rich blocks {richEnabled ? "on" : "off"}
          </button>
        </div>
      </div>

      {/* Chat Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Hey! I'm Vibe 👋
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Tell me about your brand, product, or campaign — and I'll help you plan the perfect creator search strategy.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="text-left text-sm p-3 rounded-lg border border-border hover:bg-muted/50 hover:border-primary/30 transition-all text-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            <AnimatePresence>
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1;
                const isStreamingAssistant =
                  msg.role === "assistant" && isLast && isLoading;
                const partial =
                  msg.role === "assistant" ? parsePartialRich(msg.content) : null;
                const guarded = partial?.response
                  ? applyCompositionGuardrails(partial.response).response
                  : null;
                return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-xl px-4 py-3 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-foreground border border-border"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div className="space-y-3">
                        <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>p:empty]:hidden [&>br]:hidden [&>ol]:my-1 [&>ul]:my-1 prose-p:leading-relaxed [&_p+p]:mt-2 [&>*+*]:mt-2">
                          <ReactMarkdown>{cleanContent(msg.content)}</ReactMarkdown>
                        </div>
                        {guarded ? (
                          <BlockRenderer
                            response={guarded}
                            onAction={onAction}
                            isStreaming={isStreamingAssistant && !partial?.complete}
                          />
                        ) : null}
                      </div>
                    ) : msg.content}
                  </div>
                </motion.div>
                );
              })}
            </AnimatePresence>

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="bg-muted/60 border border-border rounded-xl px-4 py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </motion.div>
            )}

            {/* Search confirmation card */}
            {pendingSearch && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="ml-11"
              >
                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm text-foreground">Search Plan Ready</span>
                    <Badge variant="outline" className="text-[10px] capitalize border-primary/30 text-primary">
                      {pendingSearch.platform === "both" ? "TikTok + Instagram" : pendingSearch.platform}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pendingSearch.keywords.map((kw, i) => (
                      <Badge key={i} variant="outline" className="text-xs text-primary border-primary/30 bg-primary/5">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    onClick={handleConfirmSearch}
                    className="gap-2 w-full"
                    variant="brand"
                  >
                    <Rocket className="w-4 h-4" />
                    Launch Search
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Rerun previous search button (when loading a past conversation with search data) */}
            {!pendingSearch && !isLoading && lastSearchAction && messages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="ml-11"
              >
                <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm text-foreground">Previous Search</span>
                    <Badge variant="outline" className="text-[10px] capitalize border-border text-muted-foreground">
                      {lastSearchAction.platform === "both" ? "TikTok + Instagram" : lastSearchAction.platform}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {lastSearchAction.keywords.slice(0, 8).map((kw: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs text-muted-foreground border-border">
                        {kw}
                      </Badge>
                    ))}
                    {lastSearchAction.keywords.length > 8 && (
                      <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                        +{lastSearchAction.keywords.length - 8} more
                      </Badge>
                    )}
                  </div>
                  <Button
                    onClick={() => onTriggerSearch(
                      lastSearchAction.keywords,
                      lastSearchAction.platform,
                      lastSearchAction.message,
                      lastSearchAction.creator_types,
                      lastSearchAction.pro_tips
                    )}
                    className="gap-2 w-full"
                    variant="outline"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Rerun This Search
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-border p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 bg-muted/30 rounded-xl border border-border p-2 focus-within:border-primary/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell Vibe about your brand, product, or who you're looking for..."
              rows={1}
              className="flex-1 resize-none bg-transparent border-0 outline-hidden text-sm text-foreground placeholder:text-muted-foreground px-2 py-1.5 max-h-32"
              style={{ minHeight: "36px" }}
              disabled={isLoading}
            />
            <Button
              size="sm"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="h-8 w-8 p-0 rounded-lg flex-shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Vibe uses AI to help plan your search strategy. Results depend on available creator data.
          </p>
        </div>
      </div>
      <ConfirmDialog />
    </div>
  );
}
