import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Mail, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createShare, previewShareEmail, revokeShare, sendShareEmail } from "@/lib/share.functions";
import { shareTargets } from "@/lib/share";
import { cn } from "@/lib/utils";
import { errMsg, field, ghost, primary } from "./shared";

/** One-click share for one or more finished videos: link, socials, native share, or a branded email. */
export function ShareDialog({ ws, variantIds, title, open, onOpenChange }: { ws: string; variantIds: string[]; title: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useServerFn(createShare);
  const preview = useServerFn(previewShareEmail);
  const send = useServerFn(sendShareEmail);
  const revoke = useServerFn(revokeShare);
  const [link, setLink] = useState<{ token: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"links" | "email">("links");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [html, setHtml] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const key = variantIds.join();

  useEffect(() => {
    if (!open) return;
    setLink(null); setMode("links"); setHtml(null);
    create({ data: { workspace_id: ws, variant_ids: variantIds } }).then(setLink).catch((e) => toast.error(errMsg(e, "Couldn't create a share link")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, ws]);

  useEffect(() => {
    if (mode !== "email" || !link) return;
    const t = setTimeout(() => { preview({ data: { token: link.token, to, note } }).then((r) => { setHtml(r.html); setSubject(r.subject); }).catch(() => undefined); }, 350);
    return () => clearTimeout(t);
  }, [mode, link, note, to, preview]);

  const copy = async () => { if (!link) return; await navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const native = async () => { if (link && navigator.share) await navigator.share({ title, url: link.url }).catch(() => undefined); };
  const doSend = async () => {
    if (!link) return;
    setBusy(true);
    try { await send({ data: { token: link.token, to, note } }); toast.success(`Sent to ${to}`); onOpenChange(false); }
    catch (e) { toast.error(errMsg(e, "Couldn't send the email")); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90dvh] gap-0 overflow-y-auto rounded-[18px] border-2 border-ink p-0", mode === "email" ? "max-w-4xl" : "max-w-md")}>
        <header className="flex items-center gap-3 border-b-2 border-ink px-5 py-4">
          <Share2 className="h-5 w-5" />
          <DialogTitle className="min-w-0 flex-1 truncate font-display text-[17px] font-bold">Share {variantIds.length > 1 ? `${variantIds.length} videos` : "video"}</DialogTitle>
        </header>
        {mode === "links" ? (
          <div className="space-y-4 p-5">
            <div className="flex gap-2">
              <input readOnly value={link?.url ?? "Creating link…"} aria-label="Share link" className={cn(field, "min-w-0 flex-1 text-[13px]")} />
              <button type="button" className={primary} disabled={!link} onClick={() => void copy()}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {link && shareTargets(link.url, title).map((t) => (
                <a key={t.id} href={t.href} target="_blank" rel="noopener noreferrer" className={cn(ghost, "justify-center py-2.5 font-semibold")}>{t.label}</a>
              ))}
              <button type="button" className={cn(ghost, "justify-center py-2.5 font-semibold")} disabled={!link} onClick={() => setMode("email")}><Mail className="h-4 w-4" />Email a colleague</button>
              {typeof navigator !== "undefined" && "share" in navigator && <button type="button" className={cn(ghost, "justify-center py-2.5 font-semibold")} disabled={!link} onClick={() => void native()}>More…</button>}
            </div>
            <p className="text-[12px] text-muted-foreground">Anyone with the link can watch and download {variantIds.length > 1 ? "these videos" : "this video"} — nothing else in your workspace.
              {link && <> <button type="button" className="underline underline-offset-2" onClick={() => void revoke({ data: { token: link.token } }).then(() => { toast.success("Link turned off"); onOpenChange(false); })}>Turn this link off</button></>}
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-[320px_1fr]">
            <form className="space-y-3 border-b-2 border-ink p-5 md:border-b-0 md:border-r-2" onSubmit={(e) => { e.preventDefault(); void doSend(); }}>
              <label className="block text-[13px] font-semibold">Colleague's email
                <input type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" className={cn(field, "mt-1")} />
              </label>
              <label className="block text-[13px] font-semibold">Note <span className="font-normal text-muted-foreground">(optional)</span>
                <textarea rows={4} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Have a look — which one should we post first?" className={cn(field, "mt-1 resize-none")} />
              </label>
              <div className="flex gap-2 pt-1">
                <button type="button" className={ghost} onClick={() => setMode("links")}>Back</button>
                <button type="submit" className={cn(primary, "flex-1")} disabled={busy || !/.+@.+\..+/.test(to)}>{busy ? "Sending…" : "Send email"}</button>
              </div>
            </form>
            <div className="flex min-h-[460px] flex-col bg-surface-subtle">
              <p className="border-b border-border px-4 py-2 text-[12px] text-muted-foreground"><b className="text-foreground">Subject:</b> {subject || "…"}</p>
              {html ? <iframe title="Email preview" srcDoc={html} sandbox="" className="h-full min-h-[420px] w-full flex-1 bg-surface" /> : <div className="grid flex-1 place-items-center text-[13px] text-muted-foreground">Preparing preview…</div>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
