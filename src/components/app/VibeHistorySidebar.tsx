import { useState, useRef, useEffect } from "react";
import { Clock, Trash2, ChevronLeft, ChevronRight, Loader2, Search, Plus, MessageSquare, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { VibeSearch } from "@/pages/app/AskVibePage";

interface Props {
  open: boolean;
  onToggle: () => void;
  searches: VibeSearch[];
  loading: boolean;
  onRerun: (search: VibeSearch) => void;
  onDelete: (id: string) => void;
  onRename?: (id: string, newTitle: string) => void;
  onNewConversation?: () => void;
  activeConversationId?: string | null;
}

export function VibeHistorySidebar({ open, onToggle, searches, loading, onRerun, onDelete, onRename, onNewConversation, activeConversationId }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  function startRename(id: string, currentTitle: string) {
    setEditingId(id);
    setEditValue(currentTitle);
  }

  function commitRename() {
    if (editingId && editValue.trim() && onRename) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  }

  return (
    <div className={cn(
      "relative border-r border-border bg-muted/30 transition-all duration-300 flex flex-col",
      open ? "w-80" : "w-0"
    )}>
      <button
        onClick={onToggle}
        className={cn(
          "absolute top-4 z-20 w-8 h-8 rounded-full border border-border bg-background shadow-xs flex items-center justify-center hover:bg-muted transition-colors",
          open ? "-right-4" : "-right-10"
        )}
      >
        {open ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col h-full overflow-hidden"
        >
          <div className="p-4 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Conversations
              </h3>
              {onNewConversation && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={onNewConversation}
                  title="New conversation"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : searches.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <Search className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    No conversations yet. Start chatting with Vibe to plan your first search.
                  </p>
                </div>
              ) : (
                searches.map((search) => (
                  <div
                    key={search.id}
                    className={cn(
                      "rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer overflow-hidden",
                      activeConversationId === search.id && "bg-muted/60 border border-border"
                    )}
                    onClick={() => { if (editingId !== search.id) onRerun(search); }}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <MessageSquare className="w-3 h-3 text-muted-foreground flex-shrink-0" />

                      <div className="min-w-0 flex-1 pr-1">
                        {editingId === search.id ? (
                          <Input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="h-6 w-full text-sm px-1 py-0"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <p className="block w-full truncate text-sm font-medium text-foreground">
                            {search.query}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {onRename && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              startRename(search.id, search.query);
                            }}
                            title="Rename"
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(search.id);
                          }}
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mt-1 ml-5 pr-1">
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(search.created_at), "MMM d, h:mm a")}
                      </span>
                      {search.results_count > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          · {search.results_count} msgs
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </div>
  );
}
