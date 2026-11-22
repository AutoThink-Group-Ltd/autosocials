import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  FolderPlus, Upload, Trash2, Pencil, ChevronRight, Folder, ArrowLeft,
  Loader2, File, Image, Download, MoreVertical,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type AssetFolder = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

type StorageFile = {
  name: string;
  id: string;
  metadata: { size: number; mimetype: string } | null;
  created_at: string;
};

const BUCKET = "brand-assets";

export default function BrandAssetsTab() {
  const qc = useQueryClient();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: "Root" },
  ]);

  // Dialogs
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameTarget, setRenameTarget] = useState<{ type: "folder" | "file"; id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "folder" | "file"; id: string; name: string; storagePath?: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  // ─── Queries ───
  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ["brand-asset-folders", currentFolderId],
    queryFn: async () => {
      const q = supabase
        .from("brand_asset_folders" as any)
        .select("*")
        .order("name");
      const built = currentFolderId
        ? q.eq("parent_id", currentFolderId)
        : q.is("parent_id", null);
      const { data, error } = await built;
      if (error) throw error;
      return (data || []) as unknown as AssetFolder[];
    },
  });

  const storagePath = buildStoragePath(breadcrumb);

  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["brand-asset-files", storagePath],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(storagePath || "", { limit: 200, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      // filter out placeholders, folder-like entries (no metadata), and dot-prefixed files
      return (data || []).filter((f) => f.name && !f.name.startsWith(".") && f.metadata) as StorageFile[];
    },
  });

  // ─── Mutations ───
  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from("brand_asset_folders" as any)
        .insert({ name, parent_id: currentFolderId } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-asset-folders"] });
      setNewFolderOpen(false);
      setNewFolderName("");
      toast.success("Folder created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const renameFolder = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from("brand_asset_folders" as any)
        .update({ name, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-asset-folders"] });
      setRenameTarget(null);
      toast.success("Renamed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("brand_asset_folders" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-asset-folders"] });
      setDeleteTarget(null);
      toast.success("Folder deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ─── File operations ───
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const path = storagePath ? `${storagePath}/${file.name}` : file.name;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["brand-asset-files"] });
      toast.success(`${fileList.length} file(s) uploaded`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, [storagePath, qc]);

  const handleRenameFile = async (oldName: string, newName: string) => {
    const oldPath = storagePath ? `${storagePath}/${oldName}` : oldName;
    const newPath = storagePath ? `${storagePath}/${newName}` : newName;
    const { error: moveErr } = await supabase.storage.from(BUCKET).move(oldPath, newPath);
    if (moveErr) { toast.error(moveErr.message); return; }
    qc.invalidateQueries({ queryKey: ["brand-asset-files"] });
    setRenameTarget(null);
    toast.success("File renamed");
  };

  const handleDeleteFile = async (fileName: string) => {
    const path = storagePath ? `${storagePath}/${fileName}` : fileName;
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["brand-asset-files"] });
    setDeleteTarget(null);
    toast.success("File deleted");
  };

  const handleDownload = async (fileName: string) => {
    const path = storagePath ? `${storagePath}/${fileName}` : fileName;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    window.open(data.publicUrl, "_blank");
  };

  // ─── Navigation ───
  const navigateToFolder = (folder: AssetFolder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const navigateToBreadcrumb = (index: number) => {
    const item = breadcrumb[index];
    if (!item) return;
    setCurrentFolderId(item.id);
    setBreadcrumb((prev) => prev.slice(0, index + 1));
  };

  const isLoading = foldersLoading || filesLoading;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {breadcrumb.length > 1 && (
          <Button variant="ghost" size="sm" onClick={() => navigateToBreadcrumb(breadcrumb.length - 2)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        )}
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-1 min-w-0">
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3" />}
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className={`hover:text-foreground transition-colors truncate max-w-[120px] ${i === breadcrumb.length - 1 ? "text-foreground font-medium" : ""}`}
              >
                {b.name}
              </button>
            </span>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)} className="gap-1.5">
          <FolderPlus className="w-3.5 h-3.5" /> New Folder
        </Button>
        <Button variant="default" size="sm" className="gap-1.5 relative" disabled={uploading}>
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload Files
          <input
            type="file"
            multiple
            onChange={handleUpload}
            className="absolute inset-0 opacity-0 cursor-pointer"
            disabled={uploading}
          />
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : folders.length === 0 && files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Folder className="w-10 h-10 opacity-40" />
          <p className="text-sm">This folder is empty</p>
          <p className="text-xs">Create a folder or upload files to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="group relative bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-xs transition-all cursor-pointer"
              onDoubleClick={() => navigateToFolder(folder)}
              onClick={() => navigateToFolder(folder)}
            >
              <div className="flex flex-col items-center gap-2">
                <Folder className="w-10 h-10 text-primary/70" />
                <span className="text-xs font-medium text-foreground text-center truncate w-full">{folder.name}</span>
              </div>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => e.stopPropagation()}>
                      <MoreVertical className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRenameTarget({ type: "folder", id: folder.id, name: folder.name }); setRenameValue(folder.name); }}>
                      <Pencil className="w-3.5 h-3.5 mr-2" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "folder", id: folder.id, name: folder.name }); }}>
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}

          {files.map((file) => {
            const isImage = file.metadata?.mimetype?.startsWith("image/");
            const filePath = storagePath ? `${storagePath}/${file.name}` : file.name;
            const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;

            return (
              <div
                key={file.id}
                className="group relative bg-card border border-border rounded-xl p-3 hover:border-primary/40 hover:shadow-xs transition-all"
              >
                <div className="flex flex-col items-center gap-2">
                  {isImage ? (
                    <div className="w-full aspect-square rounded-lg overflow-hidden bg-secondary">
                      <img src={publicUrl} alt={file.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-full aspect-square rounded-lg bg-secondary flex items-center justify-center">
                      <File className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <span className="text-[11px] font-medium text-foreground text-center truncate w-full" title={file.name}>
                    {file.name}
                  </span>
                  {file.metadata?.size && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatBytes(file.metadata.size)}
                    </span>
                  )}
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 bg-background/80 backdrop-blur-sm">
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleDownload(file.name)}>
                        <Download className="w-3.5 h-3.5 mr-2" /> Download
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setRenameTarget({ type: "file", id: file.id, name: file.name }); setRenameValue(file.name); }}>
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget({ type: "file", id: file.id, name: file.name })}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Folder Dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Enter a name for the new folder.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newFolderName.trim() && createFolder.mutate(newFolderName.trim())}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createFolder.mutate(newFolderName.trim())}
              disabled={!newFolderName.trim() || createFolder.isPending}
            >
              {createFolder.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={() => setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {renameTarget?.type === "folder" ? "Folder" : "File"}</DialogTitle>
            <DialogDescription>Enter a new name.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim()) {
                if (renameTarget?.type === "folder") {
                  renameFolder.mutate({ id: renameTarget.id, name: renameValue.trim() });
                } else if (renameTarget) {
                  handleRenameFile(renameTarget.name, renameValue.trim());
                }
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (renameTarget?.type === "folder") {
                  renameFolder.mutate({ id: renameTarget.id, name: renameValue.trim() });
                } else if (renameTarget) {
                  handleRenameFile(renameTarget.name, renameValue.trim());
                }
              }}
              disabled={!renameValue.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.type === "folder" ? "Folder" : "File"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
              {deleteTarget?.type === "folder" && " All subfolders will also be deleted."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget?.type === "folder") {
                  deleteFolder.mutate(deleteTarget.id);
                } else if (deleteTarget) {
                  handleDeleteFile(deleteTarget.name);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helpers ───
function buildStoragePath(breadcrumb: { id: string | null; name: string }[]): string {
  if (breadcrumb.length <= 1) return "";
  return breadcrumb
    .slice(1)
    .map((b) => b.name)
    .join("/");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
