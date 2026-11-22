import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Search, Check } from "lucide-react";
import { toast } from "sonner";

type Preview = {
  id: string;
  description: string;
  preview: string;
  width?: number;
  height?: number;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brand: string;
  region?: string;
  pageSlug?: string;
  workspaceId?: string;
  onLicensed: (asset: {
    id: string;
    public_url: string;
    alt: string;
    filename: string;
  }) => void;
};

export default function ShutterstockPicker({
  open,
  onOpenChange,
  brand,
  region,
  pageSlug,
  workspaceId,
  onLicensed,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Preview[]>([]);
  const [loading, setLoading] = useState(false);
  const [licensingId, setLicensingId] = useState<string | null>(null);
  const [scene, setScene] = useState("");
  const [selected, setSelected] = useState<Preview | null>(null);

  const runSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("shutterstock-fetch", {
        body: { action: "search", query: query.trim() },
      });
      if (error) throw error;
      setResults(data?.results || []);
    } catch (e: any) {
      toast.error(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const licenseSelected = async () => {
    if (!selected) return;
    const sceneText = scene.trim() || selected.description;
    if (!sceneText) {
      toast.error("Add a scene description for alt text");
      return;
    }
    setLicensingId(selected.id);
    try {
      const { data, error } = await supabase.functions.invoke("shutterstock-fetch", {
        body: {
          action: "license",
          image_id: selected.id,
          brand,
          region,
          scene: sceneText,
          page_slug: pageSlug,
          workspace_id: workspaceId,
          query,
        },
      });
      if (error) throw error;
      if (!data?.asset) throw new Error("No asset returned");
      onLicensed(data.asset);
      toast.success("Image licensed and stored");
      onOpenChange(false);
      setSelected(null);
      setScene("");
      setResults([]);
      setQuery("");
    } catch (e: any) {
      toast.error(e.message || "License failed");
    } finally {
      setLicensingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Shutterstock image picker</DialogTitle>
          <DialogDescription>
            Previews are watermarked. The licensed download is clean and stored
            in Cloud Storage with branded alt text.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Search Shutterstock…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
          />
          <Button onClick={runSearch} disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                selected?.id === r.id ? "border-primary" : "border-transparent"
              }`}
            >
              <img src={r.preview} alt={r.description} className="w-full h-full object-cover" />
              {selected?.id === r.id && (
                <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                  <Check className="w-3 h-3" />
                </div>
              )}
            </button>
          ))}
        </div>

        {selected && (
          <div className="space-y-2 border-t pt-3">
            <Label>Scene description (used in alt text)</Label>
            <Input
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              placeholder={selected.description}
            />
            <p className="text-xs text-muted-foreground">
              Alt preview: <strong>{brand}{region ? `, ${region}` : ""} — {scene || selected.description}</strong>
            </p>
            <Button onClick={licenseSelected} disabled={!!licensingId} className="w-full">
              {licensingId ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Licensing & storing…
                </>
              ) : (
                "License & store image"
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}