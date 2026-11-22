import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  DragDropContext, Droppable, Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  MoreHorizontal, Plus, GripVertical, Trash2, Pencil,
  X, Check, Loader2, Users, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useKanban, type KanbanColumn, type KanbanCard } from "@/hooks/useKanban";

const COLUMN_COLORS: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  purple: "bg-violet-500",
  pink: "bg-pink-500",
  gray: "bg-muted-foreground",
};

const COLOR_OPTIONS = Object.keys(COLUMN_COLORS);

/* ─── Add-card inline form ─── */
const AddCardForm = ({ onAdd, onCancel }: { onAdd: (name: string, handle: string) => void; onCancel: () => void }) => {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-2">
      <Input ref={ref} autoFocus placeholder="Creator name" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
      <Input placeholder="@handle (optional)" value={handle} onChange={(e) => setHandle(e.target.value)} className="h-8 text-sm" />
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs flex-1" disabled={!name.trim()} onClick={() => { onAdd(name.trim(), handle.trim()); setName(""); setHandle(""); }}>
          <Check className="w-3 h-3 mr-1" /> Add
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};

/* ─── Add from List popover ─── */
interface ListCreator {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  niches: string[] | null;
}

interface CreatorList {
  id: string;
  name: string;
}

const AddFromListPopover = ({ columnId, onAdd }: {
  columnId: string;
  onAdd: (columnId: string, data: { creator_name: string; creator_handle?: string; creator_list?: string; creator_avatar_url?: string }) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<CreatorList[]>([]);
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [creators, setCreators] = useState<ListCreator[]>([]);
  const [search, setSearch] = useState("");
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingCreators, setLoadingCreators] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingLists(true);
    supabase.from("creator_lists").select("id, name").order("created_at", { ascending: false })
      .then(({ data }) => { setLists((data as CreatorList[]) ?? []); setLoadingLists(false); });
  }, [open]);

  useEffect(() => {
    if (!selectedList) { setCreators([]); return; }
    setLoadingCreators(true);
    supabase
      .from("list_members")
      .select("creator_id, creator_profiles:creator_id(id, username, display_name, avatar_url, follower_count, niches)")
      .eq("list_id", selectedList)
      .limit(500)
      .then(({ data }) => {
        const mapped = (data ?? [])
          .map((d: any) => d.creator_profiles)
          .filter(Boolean) as ListCreator[];
        setCreators(mapped);
        setLoadingCreators(false);
      });
  }, [selectedList]);

  const filtered = creators.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.username.toLowerCase().includes(q) || (c.display_name?.toLowerCase().includes(q));
  });

  const selectedListName = lists.find((l) => l.id === selectedList)?.name;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSelectedList(null); setSearch(""); } }}>
      <PopoverTrigger asChild>
        <button className="mt-1 w-full py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center justify-center gap-1">
          <Users className="w-3 h-3" /> Add from list
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {!selectedList ? (
          <div className="p-2">
            <p className="text-xs font-semibold text-foreground px-2 py-1.5">Select a list</p>
            {loadingLists ? (
              <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : lists.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3">No lists yet. Save creators to a list first.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto pr-1">
                {lists.map((l) => (
                  <button key={l.id} onClick={() => setSelectedList(l.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-secondary rounded-lg transition-colors flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-2">
            <div className="flex items-center gap-2 px-1">
              <button onClick={() => setSelectedList(null)} className="text-xs text-primary hover:underline">← Lists</button>
              <span className="text-xs font-semibold text-foreground truncate">{selectedListName}</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Search creators..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs pl-8" />
            </div>
            {loadingCreators ? (
              <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3">No creators found.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto pr-1">
                <div className="space-y-0.5">
                  {filtered.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onAdd(columnId, {
                          creator_name: c.display_name || c.username,
                          creator_handle: `@${c.username}`,
                          ...(selectedListName !== undefined ? { creator_list: selectedListName } : {}),
                          ...(c.avatar_url ? { creator_avatar_url: c.avatar_url } : {}),
                        });
                        setOpen(false);
                        setSelectedList(null);
                        setSearch("");
                      }}
                      className="w-full flex items-center gap-2.5 px-2 py-2 hover:bg-secondary rounded-lg transition-colors text-left"
                    >
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarImage src={c.avatar_url || ""} alt={c.display_name || c.username} />
                        <AvatarFallback>
                          <span className="text-[10px] font-bold">{(c.display_name || c.username)[0]?.toUpperCase()}</span>
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{c.display_name || c.username}</p>
                        <p className="text-[10px] text-muted-foreground">@{c.username}</p>
                      </div>
                      {typeof c.follower_count === "number" ? (
                        <span className="text-[10px] text-muted-foreground shrink-0 font-medium">
                          {c.follower_count >= 1000000
                            ? `${(c.follower_count / 1000000).toFixed(1)}M`
                            : c.follower_count >= 1000
                              ? `${(c.follower_count / 1000).toFixed(0)}K`
                              : c.follower_count}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

/* ─── Card component ─── */
const CardItem = ({ card, index, onDelete, onEdit }: {
  card: KanbanCard; index: number;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<KanbanCard>) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(card.creator_name);

  return (
    <Draggable draggableId={card.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`bg-card rounded-xl border border-border p-3.5 transition-shadow group ${snapshot.isDragging ? "shadow-xl ring-2 ring-primary/20" : "hover:shadow-card"}`}
        >
          <div className="flex items-start justify-between mb-1.5">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/60 to-primary flex items-center justify-center shrink-0">
                <span className="text-primary-foreground text-[10px] font-bold">{card.creator_name[0]?.toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                {editing ? (
                  <form onSubmit={(e) => { e.preventDefault(); onEdit(card.id, { creator_name: editName }); setEditing(false); }}>
                    <Input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className="h-6 text-sm px-1" onBlur={() => { onEdit(card.id, { creator_name: editName }); setEditing(false); }} />
                  </form>
                ) : (
                  <p className="text-sm font-semibold text-foreground truncate">{card.creator_name}</p>
                )}
                {card.creator_handle && <p className="text-[11px] text-muted-foreground truncate">{card.creator_handle}</p>}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setEditName(card.creator_name); setEditing(true); }}>
                  <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(card.id)}>
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {card.creator_list && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium truncate">
                {card.creator_list}
              </span>
            )}
            {card.deal_value != null && card.deal_value > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                £{card.deal_value.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
};

/* ─── Column header ─── */
const ColumnHeader = ({ column, cardCount, onUpdate, onDelete }: {
  column: KanbanColumn; cardCount: number;
  onUpdate: (id: string, updates: Partial<Pick<KanbanColumn, "title" | "color">>) => void;
  onDelete: (id: string) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(column.title);

  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${COLUMN_COLORS[column.color] || COLUMN_COLORS["gray"]}`} />
      {editing ? (
        <form className="flex-1" onSubmit={(e) => { e.preventDefault(); onUpdate(column.id, { title }); setEditing(false); }}>
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="h-6 text-sm font-semibold px-1" onBlur={() => { onUpdate(column.id, { title }); setEditing(false); }} />
        </form>
      ) : (
        <h3 className="text-sm font-semibold text-foreground truncate flex-1">{column.title}</h3>
      )}
      <span className="text-xs text-muted-foreground bg-secondary rounded-full w-5 h-5 flex items-center justify-center shrink-0">
        {cardCount}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground shrink-0">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => { setTitle(column.title); setEditing(true); }}>
            <Pencil className="w-3.5 h-3.5 mr-2" /> Rename
          </DropdownMenuItem>
          {COLOR_OPTIONS.map((c) => (
            <DropdownMenuItem key={c} onClick={() => onUpdate(column.id, { color: c })}>
              <div className={`w-3 h-3 rounded-full mr-2 ${COLUMN_COLORS[c]}`} />
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem className="text-destructive" onClick={() => onDelete(column.id)}>
            <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

/* ─── Main page ─── */
const CollaborationsPage = () => {
  const {
    columns, cards, loading,
    addColumn, updateColumn, deleteColumn, reorderColumns,
    addCard, updateCard, deleteCard, moveCard,
  } = useKanban();

  const [addingCardCol, setAddingCardCol] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColTitle, setNewColTitle] = useState("");

  const onDragEnd = (result: DropResult) => {
    const { source, destination, type } = result;
    if (!destination) return;

    if (type === "COLUMN") {
      const reordered = Array.from(columns);
      const [moved] = reordered.splice(source.index, 1);
      if (moved) reordered.splice(destination.index, 0, moved);
      reorderColumns(reordered);
      return;
    }

    // Card moved
    const cardId = result.draggableId;
    moveCard(cardId, destination.droppableId, destination.index);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Collaborations</h1>
          <p className="text-muted-foreground text-sm">Track creator collaborations from outreach to delivery</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddingColumn(true)}
        >
          <Plus className="w-4 h-4 mr-1" /> Add Column
        </Button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="board" direction="horizontal" type="COLUMN">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0"
            >
              {columns.map((col, colIdx) => {
                const colCards = cards
                  .filter((c) => c.column_id === col.id)
                  .sort((a, b) => a.position - b.position);

                return (
                  <Draggable key={col.id} draggableId={`col-${col.id}`} index={colIdx}>
                    {(colProvided) => (
                      <div
                        ref={colProvided.innerRef}
                        {...colProvided.draggableProps}
                        className="min-w-[272px] w-[272px] flex-shrink-0 flex flex-col bg-secondary/30 rounded-xl p-2 max-h-full"
                      >
                        <div {...colProvided.dragHandleProps} className="shrink-0">
                          <ColumnHeader
                            column={col}
                            cardCount={colCards.length}
                            onUpdate={updateColumn}
                            onDelete={deleteColumn}
                          />
                        </div>

                        <Droppable droppableId={col.id} type="CARD">
                          {(dropProvided, dropSnapshot) => (
                            <div
                              ref={dropProvided.innerRef}
                              {...dropProvided.droppableProps}
                              className={`flex-1 space-y-2 min-h-[60px] overflow-y-auto rounded-lg transition-colors ${dropSnapshot.isDraggingOver ? "bg-primary/5" : ""}`}
                            >
                              {colCards.map((card, cardIdx) => (
                                <CardItem
                                  key={card.id}
                                  card={card}
                                  index={cardIdx}
                                  onDelete={deleteCard}
                                  onEdit={updateCard}
                                />
                              ))}
                              {dropProvided.placeholder}
                            </div>
                          )}
                        </Droppable>

                        <div className="shrink-0">
                          {addingCardCol === col.id ? (
                            <div className="mt-2">
                              <AddCardForm
                                onAdd={(name, handle) => {
                                  addCard(col.id, { creator_name: name, ...(handle ? { creator_handle: handle } : {}) });
                                  setAddingCardCol(null);
                                }}
                                onCancel={() => setAddingCardCol(null)}
                              />
                            </div>
                          ) : (
                            <div className="mt-2 space-y-0.5">
                              <button
                                onClick={() => setAddingCardCol(col.id)}
                                className="w-full py-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors flex items-center justify-center gap-1"
                              >
                                <Plus className="w-3 h-3" /> Add creator
                              </button>
                              <AddFromListPopover columnId={col.id} onAdd={(cId, data) => addCard(cId, data)} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}

              {/* Add column form */}
              {addingColumn ? (
                <div className="min-w-[272px] w-[272px] flex-shrink-0 bg-secondary/30 rounded-xl p-3 space-y-2">
                  <Input
                    autoFocus
                    placeholder="Column title"
                    value={newColTitle}
                    onChange={(e) => setNewColTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newColTitle.trim()) {
                        addColumn(newColTitle.trim());
                        setNewColTitle("");
                        setAddingColumn(false);
                      }
                      if (e.key === "Escape") setAddingColumn(false);
                    }}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs flex-1" disabled={!newColTitle.trim()} onClick={() => { addColumn(newColTitle.trim()); setNewColTitle(""); setAddingColumn(false); }}>
                      <Check className="w-3 h-3 mr-1" /> Add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingColumn(false)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
};

export default CollaborationsPage;
