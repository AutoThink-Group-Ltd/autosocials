import { useState, useRef, useCallback, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SignatureEditorToolbar } from "./SignatureEditorToolbar";
import { persistAllImages, uploadFileAsImage, isPersistentUrl } from "./useSignatureImages";

interface Props {
  initialHtml: string;
  workspaceId: string;
  onSave: (html: string) => Promise<void>;
  saving: boolean;
}

export function SignatureEditor({ initialHtml, workspaceId, onSave, saving }: Props) {
  const [rawHtml, setRawHtml] = useState(initialHtml);
  const [activeTab, setActiveTab] = useState("richtext");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [imgSize, setImgSize] = useState(100);

  const editorRef = useRef<HTMLDivElement>(null);
  const editorInitRef = useRef(false);

  // Initialize editor content — also convert <a>-wrapped images to data-href
  useEffect(() => {
    if (editorRef.current && !editorInitRef.current) {
      // Convert <a><img></a> patterns to data-href for editing
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = rawHtml || '<div><br></div>';
      tempDiv.querySelectorAll("a > img").forEach((img) => {
        const anchor = img.parentElement as HTMLAnchorElement;
        if (anchor?.href) {
          img.setAttribute("data-href", anchor.href);
          (img as HTMLElement).style.cursor = "pointer";
          (img as HTMLElement).style.outline = "2px solid #6366f1";
          anchor.parentNode?.insertBefore(img, anchor);
          anchor.remove();
        }
      });
      editorRef.current.innerHTML = tempDiv.innerHTML;
      editorInitRef.current = true;
    }
  }, [rawHtml]);

  const syncFromEditor = useCallback(() => {
    if (editorRef.current) {
      setRawHtml(editorRef.current.innerHTML);
    }
  }, []);

  const handleTabChange = (tab: string) => {
    if (activeTab === "richtext") {
      syncFromEditor();
    }
    setActiveTab(tab);
    if (tab === "richtext") {
      editorInitRef.current = false;
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = rawHtml || '<div><br></div>';
          editorInitRef.current = true;
        }
      }, 0);
    }
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Check for image files (screenshots)
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const url = await uploadFileAsImage(file, workspaceId);
        if (url) {
          document.execCommand("insertHTML", false, `<img src="${url}" style="max-width:100%;" />`);
        }
        return;
      }
    }

    // For HTML paste, let it happen then persist images
    setTimeout(async () => {
      if (editorRef.current) {
        await persistAllImages(editorRef.current, workspaceId);
      }
    }, 200);
  }, [workspaceId]);

  const handleInsertImage = useCallback(async (file: File) => {
    const url = await uploadFileAsImage(file, workspaceId);
    if (url && editorRef.current) {
      editorRef.current.focus();
      document.execCommand("insertHTML", false, `<img src="${url}" style="max-width:200px;" />`);
    }
  }, [workspaceId]);

  const handleInsertLink = useCallback(() => {
    if (selectedImg) {
      // Pre-fill with existing link if image already has one
      setLinkUrl(selectedImg.getAttribute("data-href") || "");
      setLinkText("");
      setLinkDialogOpen(true);
      return;
    }
    const sel = window.getSelection();
    const text = sel?.toString() || "";
    setLinkText(text);
    setLinkUrl("");
    setLinkDialogOpen(true);
  }, [selectedImg]);

  const confirmInsertLink = useCallback(() => {
    if (!linkUrl) return;

    if (selectedImg) {
      // Store link URL as data attribute — contentEditable strips <a> wrappers
      // around images, so we persist via data-href and reconstruct on save
      selectedImg.setAttribute("data-href", linkUrl);
      selectedImg.style.cursor = "pointer";
      selectedImg.style.outline = "2px solid #6366f1";
      setSelectedImg(null);
    } else {
      const html = `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">${linkText || linkUrl}</a>`;
      editorRef.current?.focus();
      document.execCommand("insertHTML", false, html);
    }
    setLinkDialogOpen(false);
    setLinkUrl("");
    setLinkText("");
  }, [linkUrl, linkText, selectedImg]);

  const handleEditorClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      const img = target as HTMLImageElement;
      setSelectedImg(img);
      const w = img.width;
      const editorW = editorRef.current?.clientWidth || 600;
      setImgSize(Math.round((w / editorW) * 100));
    } else {
      setSelectedImg(null);
    }
  }, []);

  const handleImgResize = useCallback((pct: number) => {
    if (!selectedImg || !editorRef.current) return;
    const editorW = editorRef.current.clientWidth;
    const px = Math.round((pct / 100) * editorW);
    selectedImg.style.width = `${px}px`;
    selectedImg.style.height = "auto";
    setImgSize(pct);
  }, [selectedImg]);

  const handleSave = useCallback(async () => {
    // Sync from editor
    let html = activeTab === "richtext" ? editorRef.current?.innerHTML || "" : rawHtml;

    // Persist any remaining images
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    await persistAllImages(tempDiv, workspaceId);

    // Convert % widths to px
    const imgs = tempDiv.querySelectorAll("img");
    imgs.forEach((img) => {
      const style = img.getAttribute("style") || "";
      if (style.includes("%")) {
        const computed = img.width || 200;
        img.style.width = `${computed}px`;
        img.style.height = "auto";
      }
    });

    // Convert data-href images to <a>-wrapped images
    tempDiv.querySelectorAll("img[data-href]").forEach((el) => {
      const img = el as HTMLImageElement;
      const href = img.getAttribute("data-href");
      if (!href) return;
      img.removeAttribute("data-href");
      img.style.removeProperty("cursor");
      img.style.removeProperty("outline");
      // Check if already wrapped in <a>
      if (img.parentElement?.tagName === "A") {
        (img.parentElement as HTMLAnchorElement).href = href;
        return;
      }
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.textDecoration = "none";
      a.style.border = "none";
      img.parentNode?.insertBefore(a, img);
      a.appendChild(img);
    });

    // Strip trailing empty div
    const tail = tempDiv.querySelector('[data-ae-editor-tail="true"]');
    if (tail && !tail.textContent?.trim()) {
      tail.remove();
    }

    // Strip Missive attrs
    tempDiv.querySelectorAll("img").forEach((img) => {
      img.removeAttribute("data-missive-attachment-attributes");
    });

    await onSave(tempDiv.innerHTML);
  }, [activeTab, rawHtml, workspaceId, onSave]);

  return (
    <div className="space-y-3">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-8">
          <TabsTrigger value="richtext" className="text-xs px-3 h-6">Rich Text</TabsTrigger>
          <TabsTrigger value="html" className="text-xs px-3 h-6">HTML</TabsTrigger>
        </TabsList>

        <TabsContent value="richtext" className="mt-2">
          <div className="rounded-lg border border-border overflow-hidden">
            <SignatureEditorToolbar
              onInsertImage={handleInsertImage}
              onInsertLink={handleInsertLink}
            />

            {selectedImg && (
              <div className="flex items-center gap-3 px-3 py-1.5 bg-primary/5 border-b border-border text-xs">
                <span className="text-muted-foreground">Image size:</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={imgSize}
                  onChange={(e) => handleImgResize(Number(e.target.value))}
                  className="w-32"
                />
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={imgSize}
                  onChange={(e) => handleImgResize(Number(e.target.value))}
                  className="w-14 h-6 text-xs border rounded px-1 bg-background"
                />
                <span className="text-muted-foreground">%</span>
              </div>
            )}

            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="min-h-[300px] max-h-[52vh] overflow-y-auto p-6 bg-white text-black focus:outline-hidden"
              style={{
                lineHeight: 1.5,
                fontFamily: "Arial, sans-serif",
                fontSize: "14px",
                wordBreak: "break-word",
              }}
              onPaste={handlePaste}
              onClick={handleEditorClick}
            />
          </div>
        </TabsContent>

        <TabsContent value="html" className="mt-2">
          <Textarea
            value={rawHtml}
            onChange={(e) => setRawHtml(e.target.value)}
            className="min-h-[300px] max-h-[52vh] font-mono text-xs"
            placeholder="Paste or write your HTML signature here..."
          />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button variant="brand" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Signature"}
        </Button>
      </div>

      {/* Insert Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{selectedImg ? "Link Image" : "Insert Link"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">URL</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                autoFocus
              />
            </div>
            {!selectedImg && (
              <div className="space-y-1.5">
                <Label className="text-xs">Display Text</Label>
                <Input
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Click here"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={confirmInsertLink} disabled={!linkUrl}>Insert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
