import { useMemo, useState } from "react";
import { BlockRenderer, useActionDispatcher, type RichResponse } from "@/components/ai-chat";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@/lib/router-compat";
import { useToast } from "@/components/ui/use-toast";
import { demoScenarios } from "@/components/ai-chat/demo/demoScenarios";

export default function AgentChatDemoPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [active, setActive] = useState(0);
  const { onAction, ConfirmDialog, register, actionStates } = useActionDispatcher({
    notify: ({ title, description, tone }) =>
      toast({ title, description, variant: tone === "error" ? "destructive" : "default" }),
    navigate,
    disablePersistence: true, // demo only — no audit traces
  });

  // Demo handlers — all benign log-only.
  useMemo(() => {
    const ids = ["demo.run", "demo.save", "demo.send", "demo.delete", "demo.publish", "demo.charge"];
    ids.forEach((id) =>
      register(id, {
        label: id,
        riskLevel: id.endsWith("delete") ? "destructive" : id.endsWith("send") || id.endsWith("publish") || id.endsWith("charge") ? "high" : "low",
        handler: (payload) => {
          // eslint-disable-next-line no-console
          console.log("[demo]", id, payload);
        },
      }),
    );
  }, [register]);

  const scenario = demoScenarios[active];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Agent Chat Demo Harness</h1>
        <p className="text-sm text-muted-foreground">
          Visual gallery of every block type in every state. Internal admin tool.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {demoScenarios.map((s, i) => (
          <Button
            key={s.id}
            size="sm"
            variant={i === active ? "default" : "outline"}
            onClick={() => setActive(i)}
          >
            {s.title}
          </Button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <p className="text-xs text-muted-foreground">{scenario?.description}</p>
        {scenario?.response ? (
          <BlockRenderer response={scenario.response as RichResponse} onAction={onAction} />
        ) : (
          <p className="text-sm italic text-muted-foreground">
            Invalid envelope — falls back to plain text in production.
          </p>
        )}
      </div>

      {Object.keys(actionStates).length > 0 && (
        <pre className="text-[11px] bg-muted p-3 rounded overflow-x-auto">
          {JSON.stringify(actionStates, null, 2)}
        </pre>
      )}

      <ConfirmDialog />
    </div>
  );
}