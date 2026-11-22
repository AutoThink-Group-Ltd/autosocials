import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Save, Sparkles, ShieldAlert } from "lucide-react";

interface BrandGuidelinesRow {
  id: string;
  name: string;
  version: number;
  is_active: boolean;
  tokens: Record<string, unknown>;
  voice: Record<string, unknown>;
  ux_principles: Record<string, unknown>;
  notes: string | null;
  updated_at: string;
}

/**
 * Super-admin editor for the AutoSocials brand & UX design system.
 * Source of truth for /ux/* docs and runtime tokens. Edits are
 * gated server-side via RLS (super_admin role only).
 */
export default function BrandGuidelinesPage() {
  const { isSuperAdmin, isLoading: roleLoading } = useSuperAdmin();
  const [row, setRow] = useState<BrandGuidelinesRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tokens, setTokens] = useState("");
  const [voice, setVoice] = useState("");
  const [principles, setPrinciples] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      const { data, error } = await supabase
        .from("brand_guidelines")
        .select("*")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) toast.error(error.message);
      if (data) {
        setRow(data as BrandGuidelinesRow);
        setTokens(JSON.stringify(data.tokens, null, 2));
        setVoice(JSON.stringify(data.voice, null, 2));
        setPrinciples(JSON.stringify(data.ux_principles, null, 2));
        setNotes(data.notes ?? "");
      }
      setLoading(false);
    })();
  }, [isSuperAdmin]);

  const palette = useMemo(() => {
    try {
      const t = JSON.parse(tokens) as { palette?: Record<string, string> };
      return t.palette ?? {};
    } catch { return {}; }
  }, [tokens]);

  if (roleLoading || loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-12">
        <Card>
          <CardHeader>
            <ShieldAlert className="h-6 w-6 text-destructive" />
            <CardTitle>Restricted</CardTitle>
            <CardDescription>
              Brand guidelines are editable by super-admins only.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const save = async () => {
    if (!row) return;
    let parsedTokens: Record<string, unknown>;
    let parsedVoice: Record<string, unknown>;
    let parsedPrinciples: Record<string, unknown>;
    try {
      parsedTokens = JSON.parse(tokens);
      parsedVoice = JSON.parse(voice);
      parsedPrinciples = JSON.parse(principles);
    } catch (e) {
      toast.error("Invalid JSON: " + (e as Error).message);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("brand_guidelines")
      .update({
        tokens: parsedTokens as never,
        voice: parsedVoice as never,
        ux_principles: parsedPrinciples as never,
        notes: notes || null,
        version: row.version + 1,
      })
      .eq("id", row.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Saved · v${row.version + 1}`);
    setRow({ ...row, version: row.version + 1 });
  };

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Brand Guidelines</h1>
            {row && <Badge variant="secondary">v{row.version}</Badge>}
            {row?.is_active && <Badge>Active</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Single source of truth for AutoSocials' palette, voice and UX principles. Drives <code>/ux/*</code> docs and runtime tokens.
          </p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save new version
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Palette preview</CardTitle>
          <CardDescription>HSL values from <code>tokens.palette</code>. Edit the JSON below to change.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {Object.entries(palette).map(([name, hsl]) => (
              <div key={name} className="space-y-1">
                <div
                  className="h-12 w-full rounded-md border"
                  style={{ background: `hsl(${hsl})` }}
                  title={`hsl(${hsl})`}
                />
                <div className="text-xs font-medium">{name}</div>
                <div className="text-[10px] text-muted-foreground">{hsl}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tokens (JSON)</CardTitle>
            <CardDescription>Palette, typography, spacing, radius, motion.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={tokens} onChange={(e) => setTokens(e.target.value)} className="min-h-[320px] font-mono text-xs" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Voice (JSON)</CardTitle>
            <CardDescription>Tone, forbidden/preferred terms, year reference.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={voice} onChange={(e) => setVoice(e.target.value)} className="min-h-[320px] font-mono text-xs" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">UX principles (JSON)</CardTitle>
          <CardDescription>The 7 layers and the rules every screen must respect.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea value={principles} onChange={(e) => setPrinciples(e.target.value)} className="min-h-[200px] font-mono text-xs" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="notes" className="sr-only">Notes</Label>
          <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why this version exists…" />
        </CardContent>
      </Card>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Snapshot to <code>brand/guidelines.json</code>: <code>bun run scripts/sync-brand-guidelines.ts</code>
      </p>
    </div>
  );
}
