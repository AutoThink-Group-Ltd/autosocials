import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOutreachSenderSettings, saveOutreachSender, setupOutreachDomain } from "@/lib/outreach-sender.functions";
import type { SenderSettings } from "./types";

const control = "w-full rounded-xl border border-border-control bg-surface px-3 py-2.5 text-sm";
const button = "rounded-xl border border-border-control px-4 py-2.5 text-sm font-semibold hover:bg-surface-subtle disabled:opacity-50";

export function SenderSetup({ workspaceId }: { workspaceId: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["outreach-sender", workspaceId], queryFn: async () => await getOutreachSenderSettings({ data: { workspace_id: workspaceId } }) as SenderSettings });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [signature, setSignature] = useState("");
  const [domain, setDomain] = useState("");
  const [editing, setEditing] = useState(false);
  const refresh = () => { void client.invalidateQueries({ queryKey: ["outreach-sender", workspaceId] }); void client.invalidateQueries({ queryKey: ["outreach", workspaceId] }); };
  const save = useMutation({ mutationFn: () => saveOutreachSender({ data: { workspace_id: workspaceId, sender_name: name, ...(email ? { sender_email: email } : {}), signature_text: signature } }), onSuccess: () => { setEditing(false); refresh(); } });
  const authenticate = useMutation({ mutationFn: (input: { domain: string; action: "authenticate" | "verify" }) => setupOutreachDomain({ data: { workspace_id: workspaceId, ...input } }), onSuccess: refresh });
  if (query.isPending) return <p className="text-sm text-text-secondary">Loading sender settings…</p>;
  if (query.isError || !query.data) return <p role="alert" className="text-sm text-danger">Could not load sender settings.</p>;
  const settings = query.data;
  return <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Sender settings</h2><p className="mt-1 text-sm text-text-secondary">Choose who creators hear from. Your signature is included in the final review.</p></div><button type="button" className={button} onClick={() => { setName(settings.platform.name || ""); setEmail(settings.identities[0]?.sender_email || ""); setSignature(settings.signature_text || ""); setEditing(true); }}>Edit sender</button></div>
    <p className="text-sm">Platform sender: <strong>{settings.platform.name} &lt;{settings.platform.email}&gt;</strong> · {settings.platform.ready ? "Ready" : "Not ready"}</p>
    {settings.identities.map((item) => <p key={item.id} className="text-sm">{settings.platform.name} &lt;{item.sender_email}&gt; · {item.is_verified ? "Verified" : "Verification needed"}</p>)}
    {editing && <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}><label className="text-sm font-medium">Sender name<input required maxLength={100} className={control} value={name} onChange={(e) => setName(e.target.value)} /></label><label className="text-sm font-medium">Business email <span className="font-normal text-text-secondary">(optional; leave blank to use platform sender)</span><input type="email" className={control} value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="text-sm font-medium">Signature<textarea className={control} rows={3} value={signature} onChange={(e) => setSignature(e.target.value)} /></label><div className="flex gap-2"><button className={`${button} bg-ink text-inverse`} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save sender"}</button><button type="button" className={button} onClick={() => setEditing(false)}>Cancel</button></div></form>}
    <div className="border-t border-border pt-4"><h3 className="text-sm font-semibold">Use your business domain</h3><p className="mt-1 text-sm text-text-secondary">Authenticate a domain you own, then add its DNS records before verifying.</p><form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); authenticate.mutate({ domain, action: "authenticate" }); }}><label className="sr-only" htmlFor="outreach-domain">Business domain</label><input id="outreach-domain" required placeholder="yourbusiness.com" className={`${control} max-w-xs`} value={domain} onChange={(e) => setDomain(e.target.value)} /><button className={button} disabled={authenticate.isPending}>Authenticate domain</button></form>
      {settings.domains.map((item) => <div key={item.id} className="mt-4 rounded-xl bg-surface-subtle p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{item.domain} · {item.status}</p><button type="button" className={button} disabled={authenticate.isPending} onClick={() => authenticate.mutate({ domain: item.domain, action: "verify" })}>Check verification</button></div><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th>Type</th><th>Host</th><th>Value</th><th>Status</th></tr></thead><tbody>{item.dns_records.map((r, i) => <tr key={`${r.host}-${i}`}><td className="py-2 pr-3">{r.type}</td><td className="break-all pr-3">{r.host}</td><td className="break-all pr-3">{r.data}</td><td>{r.valid ? "Valid" : "Pending"}</td></tr>)}</tbody></table></div></div>)}
    </div>
    {(save.isError || authenticate.isError) && <p role="alert" className="text-sm text-danger">{(save.error || authenticate.error) instanceof Error ? (save.error || authenticate.error)?.message : "Sender settings could not be updated."}</p>}
  </section>;
}


