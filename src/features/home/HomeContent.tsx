import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CarouselLibrary } from "@/features/create/CarouselLibrary";
import { useSafeScheduleAdd, PublishingHistory } from "./useSafeScheduleAdd";
import { HomeVideoGallery } from "./HomeVideoGallery";
import { contentTrashKey, listContentTrash, setContentTrashed } from "@/lib/content-trash";
import { HomeSocialTiles } from "./HomeSocialTiles";

const action = "inline-flex size-10 items-center justify-center rounded-xl border border-border-control hover:bg-surface-subtle disabled:opacity-50";

export async function fetchHomeWrittenPosts(workspaceId: string) {
  // Historic text drafts lack a source marker and may have been written manually.
  const { data, error } = await supabase.from("posts")
    .select("id,caption,created_at,status,created_via,post_media(id)")
    .eq("workspace_id", workspaceId).is("variant_id", null)
    .or("created_via.like.personal-idea-batch:%,created_via.eq.written_posts,created_via.is.null")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).filter(post => post.caption.trim() && (post.created_via !== null || !post.post_media.length));
}

export function HomeContent({ workspaceId, writtenOnly = false }: { workspaceId: string; writtenOnly?: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [trashBusy, setTrashBusy] = useState(false);
  const [confirmPost, setConfirmPost] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const trash = useQuery({ queryKey: contentTrashKey(workspaceId, "written"), queryFn: () => listContentTrash(workspaceId, "written") });
  const changeTrash = async (id: string, trashed: boolean) => {
    if (trashBusy) return;
    setTrashBusy(true);
    try {
      await setContentTrashed(workspaceId, "written", id, trashed);
      await queryClient.invalidateQueries({ queryKey: contentTrashKey(workspaceId, "written") });
      setSelected(current => current.filter(item => item !== id));
      toast.success(trashed ? "Post moved to Trash" : "Post restored");
    } catch {
      toast.error("Could not update Trash. Please try again.");
    } finally { setTrashBusy(false); }
  };
  const posts = useQuery({ queryKey: ["home-written-posts", workspaceId], queryFn: () => fetchHomeWrittenPosts(workspaceId) });
  const categories = useQuery({ queryKey: ["home-content-categories", workspaceId], enabled: !writtenOnly, queryFn: async () => {
    const [videos, tiles] = await Promise.all([
      supabase.from("render_jobs").select("id").eq("workspace_id", workspaceId).eq("status", "done").not("storage_path", "is", null).limit(1),
      supabase.from("brand_files").select("id").eq("workspace_id", workspaceId).eq("source", "social_tile").like("storage_path", workspaceId + "/%").limit(1),
    ]);
    if (videos.error || tiles.error) throw new Error("Could not check content types.");
    return { video: !!videos.data?.length, tiles: !!tiles.data?.length };
  } });
  const allWritten = posts.data ?? [];
  const trashIds = new Set(trash.data ?? []);
  const written = allWritten.filter(post => !trashIds.has(post.id));
  const safe = useSafeScheduleAdd(workspaceId, { writtenIds: written.map(post => post.id) }, Object.fromEntries(written.map(post => [post.id, post.caption.slice(0, 80)])));
  const available = written.filter(post => ["draft", "scheduled", "published", "partially_published"].includes(post.status) && post.post_media.length === 0);
  const chosen = available.filter(post => selected.includes(post.id));
  const toggle = (id: string, checked: boolean) => setSelected(current => checked ? [...current, id] : current.filter(item => item !== id));
  const copy = async (text: string, multiple = false) => {
    try { await navigator.clipboard.writeText(text); toast.success(multiple ? "Selected posts copied" : "Post copied"); }
    catch { toast.error("Could not copy. Check your clipboard permissions and try again."); }
  };
  if (posts.isPending || (!writtenOnly && categories.isPending) || trash.isPending) return <p role="status" className="text-sm text-muted-foreground">Loading content…</p>;
  const initialType = writtenOnly ? "written" : categories.data?.video ? "video" : categories.data?.tiles ? "tiles" : allWritten.length ? "written" : "video";
  return <Tabs defaultValue={initialType} className="space-y-5">
    {!writtenOnly && <>
      <h2 className="font-display text-2xl font-bold">Content</h2>
      <TabsList aria-label="Content type" className="h-auto max-w-full flex-wrap justify-start">
        <TabsTrigger value="video">Video</TabsTrigger>
        <TabsTrigger value="tiles">Social tiles</TabsTrigger>
        <TabsTrigger value="written">Written</TabsTrigger>
        <TabsTrigger value="carousels">LinkedIn Carousels</TabsTrigger>
      </TabsList>
      <TabsContent value="carousels"><CarouselLibrary workspaceId={workspaceId} /></TabsContent>
    </>}
    <TabsContent value="video">{categories.isSuccess && !categories.data.video ? <p className="text-sm text-muted-foreground">No finished videos yet.</p> : <HomeVideoGallery workspaceId={workspaceId} />}</TabsContent>
    <TabsContent value="tiles"><HomeSocialTiles workspaceId={workspaceId} showEmpty /></TabsContent>
    <TabsContent value="written" className="space-y-4">
      {trash.isError ? <p role="alert">Could not load Trash. <button type="button" className="underline" onClick={() => void trash.refetch()}>Try again</button></p> : posts.isPending ? <p role="status">Loading written posts…</p> : posts.isError ? <p role="alert">Could not load written posts. <button type="button" className="underline" onClick={() => void posts.refetch()}>Try again</button></p> : !written.length ? <p className="text-sm text-muted-foreground">No written posts yet.</p> : <>
        <p className="text-sm text-muted-foreground">Includes older text-only posts, which may have been written manually.</p>
        {<div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-subtle p-3"><label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={available.length > 0 && chosen.length === available.length} disabled={!available.length} onChange={event => setSelected(event.target.checked ? available.slice(0, 20).map(post => post.id) : [])} className="size-4 accent-ink" />Select all</label><button type="button" disabled={!chosen.length} onClick={() => void copy(chosen.map(post => post.caption).join("\n\n---\n\n"), true)} className="rounded-lg border border-border-control px-3 py-2 text-sm font-semibold disabled:opacity-50">Copy selected{chosen.length ? ` (${chosen.length})` : ""}</button><button type="button" disabled={!chosen.length || chosen.length > 20} onClick={() => void safe.add({ writtenIds: chosen.map(post => post.id), knownPreviouslyPublished: chosen.some(post => post.status !== "draft") })} className="rounded-lg border border-border-control px-3 py-2 text-sm font-semibold disabled:opacity-50">Add to Schedule{chosen.length ? ` (${chosen.length})` : ""}</button></div>}
        {written.map(post => <article key={post.id} className="rounded-2xl border border-border-control bg-surface p-5">{<label className="mb-3 inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={selected.includes(post.id)} disabled={!available.some(item => item.id === post.id) || (!selected.includes(post.id) && chosen.length >= 20)} onChange={event => toggle(post.id, event.target.checked)} className="size-4 accent-ink" />Select post</label>}<PublishingHistory statuses={safe.history.data?.[post.id] ?? []} />{post.status !== "draft" && <p className="text-xs font-semibold text-muted-foreground">{post.status === "published" ? "Published" : post.status === "scheduled" ? "Scheduled" : post.status.replaceAll("_", " ")}</p>}<p className="whitespace-pre-wrap text-sm">{post.caption}</p><div className="mt-4 flex gap-2">{<><button type="button" title="Copy post" aria-label="Copy post" className={action} onClick={() => void copy(post.caption)}><Copy className="size-4" /></button><button type="button" aria-label="Add post to Schedule" className={action} title={available.some(item => item.id === post.id) ? "Add to Schedule" : "This post is not available to schedule"} disabled={!available.some(item => item.id === post.id)} onClick={() => void safe.add({ writtenIds: [post.id], knownPreviouslyPublished: post.status !== "draft" })}><CalendarDays className="size-4" /></button></>}<button type="button" className={action} disabled={trashBusy} aria-label="Move post to Trash" title="Move post to Trash" onClick={() => setConfirmPost(post.id)}><Trash2 className="size-4" /></button></div></article>)}
      </>}
    </TabsContent>
    {safe.history.isError && <p role="alert" className="text-sm text-destructive">Publishing history unavailable. Try again before adding written posts.</p>}<AlertDialog open={!!confirmPost} onOpenChange={open => { if (!open) setConfirmPost(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Move post to Trash?</AlertDialogTitle><AlertDialogDescription>You can restore it later. Scheduled publishing continues.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirmPost) void changeTrash(confirmPost, true); }}>Move to Trash</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {safe.confirmation}
  </Tabs>;
}
