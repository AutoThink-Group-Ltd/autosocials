import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, Loader2, FileText } from "lucide-react";

/**
 * Expected CSV headers (in order, header row required):
 *   scheduled_at, post_type, caption, first_comment
 * scheduled_at: ISO datetime, e.g. 2026-05-12T14:00:00Z
 * post_type:    feed | reel | story | photo
 */
export default function PublishingBulkImportPage() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const parseCsv = (raw: string) => {
    const lines = raw.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = (lines[0] ?? "").split(",").map((h) => h.trim().toLowerCase());
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i] ?? "");
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = (cells[idx] ?? "").trim(); });
      rows.push(row);
    }
    return rows;
  };

  const splitCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuotes = !inQuotes; continue; }
      if (c === "," && !inQuotes) { out.push(cur); cur = ""; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  };

  const importCsv = async () => {
    if (!currentWorkspace?.id) return;
    const rows = parseCsv(csv);
    if (rows.length === 0) { toast.error("No rows detected. Check your CSV."); return; }
    setImporting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const inserts = rows.map((r) => ({
        workspace_id: currentWorkspace.id,
        created_by: u.user!.id,
        caption: r["caption"] ?? "",
        first_comment: r["first_comment"] || null,
        post_type: r["post_type"] || "feed",
        scheduled_at: r["scheduled_at"] ? new Date(r["scheduled_at"]).toISOString() : null,
        status: (r["scheduled_at"] ? "scheduled" : "draft") as "scheduled" | "draft",
      }));
      const { error } = await supabase.from("posts").insert(inserts);
      if (error) throw error;
      toast.success(`Imported ${inserts.length} draft${inserts.length === 1 ? "" : "s"}`);
      navigate("/app/publishing");
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally { setImporting(false); }
  };

  const sample = `scheduled_at,post_type,caption,first_comment
2026-05-12T14:00:00Z,feed,"Spring drop is live ✨",#newdrop
2026-05-13T09:00:00Z,reel,"How we shot the campaign in 24h",`;

  return (
    <div className="container mx-auto px-6 py-8 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1">Bulk import posts</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Paste or upload a CSV to create many drafts at once. Each row becomes one post.
      </p>

      <Card className="mb-4">
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> CSV</CardTitle>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <span className="inline-flex items-center text-sm text-primary hover:underline">
              <Upload className="h-4 w-4 mr-1" /> Upload file
            </span>
          </label>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={10}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={sample}
            className="font-mono text-xs"
          />
          <div className="text-xs text-muted-foreground">
            Required header: <code>scheduled_at,post_type,caption,first_comment</code>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCsv(sample)}>Insert sample</Button>
            <Button onClick={importCsv} disabled={importing || !csv.trim()}>
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Import drafts
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}