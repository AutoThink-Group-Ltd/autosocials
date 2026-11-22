import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { sendGscDigestNow } from "@/lib/gsc-digest.functions";
import { Panel } from "./analytics-ui";

type Result = Awaited<ReturnType<typeof sendGscDigestNow>>;

export function GscDigestPanel() {
  const send = useServerFn(sendGscDigestNow);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setError(null); setResult(null);
    try { setResult(await send({ data: { force } })); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  return (
    <Panel title="Daily intent email">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Every day at 08:00 UTC, a private email lists new and growing search intents for yesterday.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={run} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send digest now
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={force} onCheckedChange={(v) => setForce(v === true)} />
            Send again even if today's was already sent
          </label>
        </div>
        {busy && <p className="text-sm text-muted-foreground">Reading Search Console and grouping intents — this can take a minute.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p className="font-medium text-foreground">
              {result.status === "sent" ? "Sent" : result.status === "skipped" ? "Already sent" : result.subject ? (result.status === "no_data" ? "Sent · no comparison today" : "Sent · failure notice") : "Failed"}
            </p>
            {result.subject && <p className="mt-1 text-foreground">{result.subject}</p>}
            {result.status === "sent" && (
              <p className="mt-1 text-muted-foreground">{result.newCount} new · {result.growingCount} growing</p>
            )}
            {result.reason && <p className="mt-1 text-muted-foreground">{result.reason}</p>}
          </div>
        )}
      </div>
    </Panel>
  );
}
