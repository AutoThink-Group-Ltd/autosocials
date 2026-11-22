import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  position: number;
  workspace_id: string;
}

export interface KanbanCard {
  id: string;
  column_id: string;
  creator_name: string;
  creator_handle: string | null;
  creator_avatar_url: string | null;
  creator_list: string | null;
  notes: string | null;
  deal_value: number | null;
  position: number;
  workspace_id: string;
  created_at: string | null;
}

const DEFAULT_COLUMNS = [
  { title: "Contacted", color: "blue", position: 0 },
  { title: "Replied", color: "yellow", position: 1 },
  { title: "Interested", color: "purple", position: 2 },
  { title: "Content in Progress", color: "orange", position: 3 },
  { title: "Delivered", color: "green", position: 4 },
];

export function useKanban() {
  const { currentWorkspace } = useWorkspace();
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(true);

  const workspaceId = currentWorkspace?.id;

  const fetchData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [colRes, cardRes] = await Promise.all([
        supabase
          .from("collaboration_columns")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("position"),
        supabase
          .from("collaboration_cards")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("position"),
      ]);

      let cols = colRes.data as KanbanColumn[] | null;

      // Seed default columns if none exist
      if (!cols || cols.length === 0) {
        const toInsert = DEFAULT_COLUMNS.map((c) => ({ ...c, workspace_id: workspaceId }));
        const { data: seeded } = await supabase
          .from("collaboration_columns")
          .insert(toInsert)
          .select();
        cols = (seeded as KanbanColumn[]) ?? [];
      }

      setColumns(cols ?? []);
      setCards((cardRes.data as KanbanCard[]) ?? []);
    } catch {
      toast.error("Failed to load board");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Column CRUD
  const addColumn = async (title: string) => {
    if (!workspaceId) return;
    const position = columns.length;
    const { data, error } = await supabase
      .from("collaboration_columns")
      .insert({ title, color: "gray", position, workspace_id: workspaceId })
      .select()
      .single();
    if (error) { toast.error("Failed to add column"); return; }
    setColumns((prev) => [...prev, data as KanbanColumn]);
  };

  const updateColumn = async (id: string, updates: Partial<Pick<KanbanColumn, "title" | "color">>) => {
    const { error } = await supabase
      .from("collaboration_columns")
      .update(updates)
      .eq("id", id);
    if (error) { toast.error("Failed to update column"); return; }
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const deleteColumn = async (id: string) => {
    const { error } = await supabase
      .from("collaboration_columns")
      .delete()
      .eq("id", id);
    if (error) { toast.error("Failed to delete column"); return; }
    setColumns((prev) => prev.filter((c) => c.id !== id));
    setCards((prev) => prev.filter((c) => c.column_id !== id));
  };

  const reorderColumns = async (newOrder: KanbanColumn[]) => {
    setColumns(newOrder);
    const updates = newOrder.map((col, i) => ({ id: col.id, position: i, workspace_id: col.workspace_id, title: col.title, color: col.color }));
    await supabase.from("collaboration_columns").upsert(updates);
  };

  // Card CRUD
  const addCard = async (columnId: string, data: { creator_name: string; creator_handle?: string; creator_list?: string; notes?: string; deal_value?: number }) => {
    if (!workspaceId) return;
    const colCards = cards.filter((c) => c.column_id === columnId);
    const position = colCards.length;
    const { data: inserted, error } = await supabase
      .from("collaboration_cards")
      .insert({ ...data, column_id: columnId, workspace_id: workspaceId, position })
      .select()
      .single();
    if (error) { toast.error("Failed to add card"); return; }
    setCards((prev) => [...prev, inserted as KanbanCard]);
  };

  const updateCard = async (id: string, updates: Partial<KanbanCard>) => {
    const { error } = await supabase.from("collaboration_cards").update(updates).eq("id", id);
    if (error) { toast.error("Failed to update card"); return; }
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const deleteCard = async (id: string) => {
    const { error } = await supabase.from("collaboration_cards").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    setCards((prev) => prev.filter((c) => c.id !== id));
  };

  const moveCard = async (cardId: string, newColumnId: string, newPosition: number) => {
    // Optimistic update
    setCards((prev) => {
      const updated = prev.map((c) => {
        if (c.id === cardId) return { ...c, column_id: newColumnId, position: newPosition };
        return c;
      });
      // Reindex positions in the target column
      const targetCards = updated
        .filter((c) => c.column_id === newColumnId && c.id !== cardId)
        .sort((a, b) => a.position - b.position);
      targetCards.splice(newPosition, 0, updated.find((c) => c.id === cardId)!);
      return updated.map((c) => {
        if (c.column_id === newColumnId) {
          const idx = targetCards.findIndex((tc) => tc.id === c.id);
          return idx >= 0 ? { ...c, position: idx } : c;
        }
        return c;
      });
    });
    await supabase.from("collaboration_cards").update({ column_id: newColumnId, position: newPosition }).eq("id", cardId);
  };

  return {
    columns, cards, loading,
    addColumn, updateColumn, deleteColumn, reorderColumns,
    addCard, updateCard, deleteCard, moveCard,
    refetch: fetchData,
  };
}
