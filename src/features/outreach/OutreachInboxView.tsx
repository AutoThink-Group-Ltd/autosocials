import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { markOutreachReplyRead, updateOutreachInterest } from "@/lib/outreach.functions";
import type { OutreachInbox, OutreachCampaignRow, OutreachInterest, OutreachJobRow, OutreachReplyRow } from "@/lib/outreach";

type Event = { kind: "outgoing"; date: string; job: OutreachJobRow } | { kind: "incoming"; date: string; reply: OutreachReplyRow };
const dateValue = (date: string) => { const value = Date.parse(date); return Number.isFinite(value) ? value : 0; };
const dateText = (date: string) => dateValue(date) ? new Date(date).toLocaleString("en-GB") : "Date unavailable";
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Please try again.";

export function OutreachInboxView({ workspaceId, data, campaigns, refresh, renderReply }: { workspaceId: string; data: OutreachInbox; campaigns: OutreachCampaignRow[]; refresh: () => void; renderReply: (replyId: string) => ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const interest = useMutation({ mutationFn: (input: {creatorId:string; interest:OutreachInterest}) => updateOutreachInterest({data:{workspaceId,...input}}), onSuccess: refresh });
  const markRead = useMutation({ mutationFn: async (ids: string[]) => { await Promise.all(ids.map(replyId => markOutreachReplyRead({data:{workspaceId,replyId}}))); }, onSettled: refresh });
  const conversations = data.creators.flatMap(creator => {
    const jobs = data.jobs.filter(job => job.creator_id === creator.id);
    const jobIds = new Set(jobs.map(job => job.id));
    const replies = data.replies.filter(reply => reply.outreach_job_id && jobIds.has(reply.outreach_job_id));
    if (!jobs.length && !replies.length) return [];
    const events: Event[] = [...jobs.map(job => ({kind:"outgoing" as const, date:job.created_at, job})), ...replies.map(reply => ({kind:"incoming" as const, date:reply.received_at || "", reply}))];
    events.sort((a,b) => dateValue(a.date) - dateValue(b.date));
    return [{creator, events, replies, last: events.at(-1)?.date || "", unread: replies.filter(reply => !reply.is_read).length}];
  }).sort((a,b) => dateValue(b.last) - dateValue(a.last));
  const selected = conversations.find(c => c.creator.id === selectedId);
  const latestReply = selected?.replies.reduce<OutreachReplyRow | null>((last, reply) => !last || dateValue(reply.received_at || "") > dateValue(last.received_at || "") ? reply : last, null);
  const open = (id: string, unread: OutreachReplyRow[]) => { setSelectedId(id); if (unread.length) markRead.mutate(unread.map(reply => reply.id)); };
  if (!conversations.length) return <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-text-secondary"><Mail className="mb-4" size={22}/><p>No conversations yet. Messages and replies will appear here.</p></div>;
  return <div className="grid overflow-hidden rounded-2xl border border-border bg-surface md:grid-cols-[minmax(220px,0.8fr)_minmax(0,2fr)]">
    <nav aria-label="Conversations" className="max-h-80 overflow-y-auto border-b border-border md:max-h-[70vh] md:border-b-0 md:border-r">{conversations.map(c => <button key={c.creator.id} type="button" aria-current={selectedId===c.creator.id ? "true" : undefined} onClick={()=>open(c.creator.id,c.replies.filter(r=>!r.is_read))} className={`block w-full border-b border-border p-4 text-left hover:bg-surface-subtle ${selectedId===c.creator.id ? "bg-surface-subtle" : ""}`}><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{c.creator.name}</span>{c.unread > 0 && <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-inverse">{c.unread} unread</span>}</span><span className="mt-1 block truncate text-xs text-text-secondary">{campaigns.find(campaign=>campaign.id===c.creator.campaign_id)?.name || "Campaign"} · {dateText(c.last)}</span></button>)}</nav>
    <section aria-label="Selected conversation" className="min-w-0 p-4 sm:p-5">{!selected ? <p className="py-8 text-sm text-text-secondary">Select a conversation to see its messages.</p> : <><div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4"><div><h3 className="font-semibold">{selected.creator.name}</h3><p className="mt-1 text-xs text-text-secondary">{campaigns.find(c=>c.id===selected.creator.campaign_id)?.name || "Campaign"} · {selected.creator.email || "No email"}</p></div><label className="text-xs font-semibold">Interest<select className="ml-2 rounded-lg border border-border-control bg-surface px-2 py-2 text-sm" value={selected.creator.interest} onChange={e=>interest.mutate({creatorId:selected.creator.id,interest:e.target.value as OutreachInterest})}><option value="unknown">Not reviewed</option><option value="interested">Interested</option><option value="not_interested">Not interested</option></select></label></div>{(markRead.isError || interest.isError) && <p role="alert" className="mt-3 text-sm text-danger">{errorMessage(markRead.error || interest.error)}</p>}<div className="max-h-[55vh] space-y-3 overflow-y-auto py-4">{selected.events.map(event => event.kind === "outgoing" ? <article key={`out-${event.job.id}`} className="rounded-xl bg-surface-subtle p-4 text-sm"><div className="flex flex-wrap justify-between gap-2 text-xs text-text-secondary"><span>Your message · {event.job.status}</span><time>{dateText(event.date)}</time></div><p className="mt-2 font-semibold">{event.job.subject}</p><p className="mt-2 whitespace-pre-wrap">{event.job.body}</p></article> : <article key={`in-${event.reply.id}`} className="rounded-xl border border-border p-4 text-sm"><div className="flex flex-wrap justify-between gap-2 text-xs text-text-secondary"><span>{event.reply.from_name || event.reply.from_email}</span><time>{dateText(event.date)}</time></div><p className="mt-2 font-semibold">{event.reply.subject}</p><p className="mt-2 whitespace-pre-wrap">{event.reply.body_text || "No text content available."}</p></article>)}</div>{latestReply && renderReply(latestReply.id)}</>}</section>
  </div>;
}
