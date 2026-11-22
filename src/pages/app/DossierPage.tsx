import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Upload, FileText, Trash2, Plus, Save, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type DossierDoc = {
  id: string;
  title: string;
  content: string;
  source: "paste" | "upload";
  updated_at: string;
};

export default function DossierPage() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [docs, setDocs] = useState<DossierDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DossierDoc | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!currentWorkspace?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("dossier_documents")
      .select("id,title,content,source,updated_at")
      .eq("workspace_id", currentWorkspace.id)
      .order("updated_at", { ascending: false });
    if (error) toast({ title: "Failed to load dossier", description: error.message, variant: "destructive" });
    setDocs((data || []) as DossierDoc[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentWorkspace?.id]);

  const startNew = () => {
    setEditing({ id: "", title: "", content: "", source: "paste", updated_at: "" });
    setTitle("");
    setContent("");
  };

  const startEdit = (d: DossierDoc) => {
    setEditing(d);
    setTitle(d.title);
    setContent(d.content);
  };

  const cancel = () => { setEditing(null); setTitle(""); setContent(""); };

  const save = async (source: "paste" | "upload" = "paste") => {
    if (!currentWorkspace?.id || !title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      workspace_id: currentWorkspace.id,
      title: title.trim(),
      content,
      source: editing?.id ? editing.source : source,
      ...(user?.id !== undefined ? { created_by: user.id } : {}),
    };
    const { error } = editing?.id
      ? await supabase.from("dossier_documents").update(payload).eq("id", editing.id)
      : await supabase.from("dossier_documents").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Saved to dossier" });
    cancel();
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    const { error } = await supabase.from("dossier_documents").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setEditing({ id: "", title: file.name.replace(/\.md$/i, ""), content: text, source: "upload", updated_at: "" });
    setTitle(file.name.replace(/\.md$/i, ""));
    setContent(text);
    e.target.value = "";
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-semibold">Dossier</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            The workspace's source of truth. Add brand context, business model, ICP, tone, offers, and any
            knowledge Vibe should treat as authoritative. Vibe reads the dossier on every plan, draft and action.
          </p>
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            <label className="cursor-pointer">
              <input type="file" accept=".md,.markdown,.txt" className="hidden" onChange={handleUpload} />
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-secondary">
                <Upload className="w-4 h-4" /> Upload .md
              </span>
            </label>
            <Button onClick={startNew} className="gap-2"><Plus className="w-4 h-4" /> New document</Button>
          </div>
        )}
      </div>

      {editing && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Input
              placeholder="Document title (e.g. Brand voice, ICP, Business model)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base font-medium"
            />
            <div className="flex items-center gap-2 ml-3">
              <Button variant="ghost" size="sm" onClick={cancel} className="gap-1"><X className="w-4 h-4" /> Cancel</Button>
              <Button size="sm" onClick={() => save(editing.source)} disabled={saving} className="gap-1">
                <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
          <Textarea
            placeholder="Paste markdown or freeform text. Anything in here becomes ground truth for Vibe."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="font-mono text-sm min-h-[420px]"
          />
          <div className="text-xs text-muted-foreground">{content.length.toLocaleString()} characters</div>
        </Card>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : docs.length === 0 && !editing ? (
          <Card className="p-10 text-center">
            <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <div className="text-sm text-muted-foreground">No documents yet. Add your first piece of brand context.</div>
          </Card>
        ) : (
          docs.map((d) => (
            <Card key={d.id} className="p-4 flex items-start gap-4 hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => startEdit(d)}>
              <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium truncate">{d.title}</div>
                  <Badge variant="outline" className="text-[10px]">{d.source}</Badge>
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {d.content.slice(0, 240) || "(empty)"}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); remove(d.id); }}>
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}