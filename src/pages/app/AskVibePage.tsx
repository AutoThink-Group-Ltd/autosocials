import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { VibeChatPanel, type Msg } from "@/components/app/VibeChatPanel";
import { VibeHistorySidebar } from "@/components/app/VibeHistorySidebar";
import { UpgradeDialog } from "@/components/app/UpgradeDialog";
import { useUsageGate } from "@/hooks/useUsageGate";
import { useUsageCounts } from "@/hooks/useUsageCounts";

export interface VibeSearch {
  id: string;
  query: string;
  platform: string;
  message: string | null;
  keywords: string[];
  creator_types: string[];
  pro_tips: string[];
  results_count: number;
  created_at: string;
}

interface VibeConversation {
  id: string;
  title: string;
  messages: Msg[];
  created_at: string;
  updated_at: string;
}

const AskVibePage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searches, setSearches] = useState<VibeSearch[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { checkLimit, upgradeDialogProps } = useUsageGate();
  const { counts: usageCounts } = useUsageCounts();

  useEffect(() => {
    if (currentWorkspace?.id) loadSearches();
  }, [currentWorkspace?.id]);

  // Seed a first user message from ?seed= (Home command bar)
  useEffect(() => {
    const seed = searchParams.get("seed");
    if (seed && messages.length === 0) {
      setMessages([{ role: "user", content: seed }]);
      const next = new URLSearchParams(searchParams);
      next.delete("seed");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced save of messages to the database
  const saveConversation = useCallback(async (msgs: Msg[], convId: string | null) => {
    if (!currentWorkspace?.id || !user?.id || msgs.length === 0) return;

    // Derive title from first user message
    const firstUserMsg = msgs.find(m => m.role === "user");
    const title = firstUserMsg
      ? firstUserMsg.content.slice(0, 80) + (firstUserMsg.content.length > 80 ? "…" : "")
      : "New conversation";

    if (convId) {
      // Update existing conversation
      await supabase
        .from("vibe_conversations")
        .update({ messages: JSON.parse(JSON.stringify(msgs)), title, updated_at: new Date().toISOString() })
        .eq("id", convId);
    } else {
      // Create new conversation
      const { data } = await supabase
        .from("vibe_conversations")
        .insert({
          workspace_id: currentWorkspace.id,
          user_id: user.id,
          title,
          messages: JSON.parse(JSON.stringify(msgs)),
        })
        .select("id")
        .single();
      if (data) {
        setConversationId(data.id);
        // Refresh sidebar
        loadSearches();
      }
    }
  }, [currentWorkspace?.id, user?.id]);

  const handleMessagesChange = useCallback((newMsgs: Msg[]) => {
    setMessages(newMsgs);

    // Debounce save by 1.5s so we don't save on every streaming chunk
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveConversation(newMsgs, conversationId);
    }, 1500);
  }, [conversationId, saveConversation]);

  // Also save immediately when component unmounts or user navigates away
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Fire final save
      if (messages.length > 0) {
        saveConversation(messages, conversationId);
      }
    };
  }, [messages, conversationId, saveConversation]);

  async function loadSearches() {
    setLoadingHistory(true);
    // Load conversations instead of searches
    const { data, error } = await supabase
      .from("vibe_conversations")
      .select("*")
      .eq("workspace_id", currentWorkspace!.id)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      // Map conversations to VibeSearch format for the sidebar
      setSearches(data.map((d: any) => ({
        id: d.id,
        query: d.title || "Untitled",
        platform: "tiktok",
        message: null,
        keywords: [],
        creator_types: [],
        pro_tips: [],
        results_count: ((d.messages as any[]) || []).length,
        created_at: d.updated_at || d.created_at,
      })));
    }
    setLoadingHistory(false);
  }

  async function handleDelete(id: string) {
    await supabase.from("vibe_conversations").delete().eq("id", id);
    setSearches((prev) => prev.filter((s) => s.id !== id));
    if (id === conversationId) {
      setConversationId(null);
      setMessages([]);
    }
    toast({ title: "Conversation deleted" });
  }

  async function handleRename(id: string, newTitle: string) {
    await supabase.from("vibe_conversations").update({ title: newTitle }).eq("id", id);
    setSearches((prev) => prev.map((s) => s.id === id ? { ...s, query: newTitle } : s));
    toast({ title: "Conversation renamed" });
  }

  async function handleRerun(search: VibeSearch) {
    // Load the full conversation from the database
    const { data } = await supabase
      .from("vibe_conversations")
      .select("*")
      .eq("id", search.id)
      .single();

    if (data) {
      setConversationId(data.id);
      setMessages((data.messages as any as Msg[]) || []);
    }
  }

  function handleNewConversation() {
    // Check vibe conversation limit
    if (!checkLimit("vibe_conversations", usageCounts.vibe_conversations)) return;
    // Save current before starting new
    if (messages.length > 0 && conversationId) {
      saveConversation(messages, conversationId);
    }
    setConversationId(null);
    setMessages([]);
  }

  function handleTriggerSearch(keywords: string[], platform: string, message: string, creatorTypes: string[], proTips: string[]) {
    // Save the search to vibe_searches
    if (currentWorkspace?.id && user?.id) {
      const query = keywords.slice(0, 3).join(", ");
      supabase.from("vibe_searches").insert({
        workspace_id: currentWorkspace.id,
        user_id: user.id,
        query,
        platform,
        message,
        keywords,
        creator_types: creatorTypes,
        pro_tips: proTips,
        results_count: 0,
      }).then(() => {});
    }

    // Navigate to discover with vibe mode
    const q = keywords.join("|");
    // If "both", default to tiktok tab but pass both flag so discover can run both
    const navPlatform = platform === "both" ? "tiktok" : platform;
    navigate(`/app?q=${encodeURIComponent(q)}&mode=vibe&platform=${navPlatform}${platform === "both" ? "&multi=1" : ""}`);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* History Sidebar */}
      <VibeHistorySidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        searches={searches}
        loading={loadingHistory}
        onRerun={handleRerun}
        onDelete={handleDelete}
        onRename={handleRename}
        onNewConversation={handleNewConversation}
        activeConversationId={conversationId}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <VibeChatPanel
          workspace={currentWorkspace}
          onTriggerSearch={handleTriggerSearch}
          messages={messages}
          onMessagesChange={handleMessagesChange}
        />
      </div>
      <UpgradeDialog
        open={upgradeDialogProps.open}
        onOpenChange={upgradeDialogProps.onOpenChange}
        limitType={upgradeDialogProps.limitType}
        {...(upgradeDialogProps.currentUsage !== undefined ? { currentUsage: upgradeDialogProps.currentUsage } : {})}
        {...(upgradeDialogProps.currentLimit !== undefined ? { currentLimit: upgradeDialogProps.currentLimit } : {})}
      />
    </div>
  );
};

export default AskVibePage;
