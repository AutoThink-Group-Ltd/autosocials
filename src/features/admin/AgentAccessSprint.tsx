import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

type SprintStatus =
  "Verified" | "In progress" | "Planned" | "Awaiting approval";

const tasks: {
  title: string;
  status: SprintStatus;
  owner: string;
  evidence: string;
  prompt: string;
}[] = [
  {
    title: "Baseline and scope",
    status: "Verified",
    owner: "Engineering",
    evidence:
      "Production Git branch and public discovery endpoints checked. AGPL-3.0, standing permission, separate Publish now and hold-on-revocation agreed.",
    prompt:
      "Reconfirm the production target and capability matrix before any release.",
  },
  {
    title: "Self-hostable AGPL-3.0 release",
    status: "In progress",
    owner: "Engineering and release owner",
    evidence:
      "AGPL-3.0 and a separate snapshot exporter are in place. The history scan flagged 55 potential findings. Rights and security review remain open.",
    prompt:
      "Prepare the audited public snapshot, license inventory, Docker install, and clean CI smoke workflow.",
  },
  {
    title: "OAuth, scoped keys and first authenticated read",
    status: "In progress",
    owner: "Platform engineering",
    evidence:
      "Local OAuth, REST and MCP paths pass focused transport and isolated database checks. Hosted client sign-in is pending.",
    prompt:
      "Verify read-only workspace consent, credential revocation and channel discovery through REST and MCP.",
  },
  {
    title: "LinkedIn creation and delegated publishing",
    status: "In progress",
    owner: "Publishing engineering",
    evidence:
      "Text-only queue, separate Publish now policy and revocation passed isolated database checks. Provider delivery and media publication remain open.",
    prompt:
      "Reuse post and publisher services to prove a LinkedIn written post and branded tile through creation, scheduling and confirmed delivery.",
  },
  {
    title: "Usage, request logs and signed webhooks",
    status: "In progress",
    owner: "Platform engineering",
    evidence:
      "Local request views and signed publishing event outbox are implemented. Hosted delivery, retention and generation events remain open.",
    prompt:
      "Connect the customer and Super Admin views to measured requests, credits and webhook outcomes.",
  },
  {
    title: "Research and Organic Winners",
    status: "In progress",
    owner: "Research and publishing engineering",
    evidence:
      "Workspace-scoped research reports, metered research, ranking, findings and shortlist are integrated. Provider and authenticated client checks remain open.",
    prompt:
      "Verify profile research and organic winner ranking from a connected agent, including empty, partial and stale results.",
  },
  {
    title: "Developer documentation and search discovery",
    status: "In progress",
    owner: "Developer experience",
    evidence:
      "Searchable developer guides, API references, public facts and sitemap entries are in the branch. Search and AI referral baselines require the live site.",
    prompt:
      "Publish server-rendered guides and matching Markdown from the same content, then baseline search and activation metrics.",
  },
  {
    title: "Self-hosting setup and provider credentials",
    status: "In progress",
    owner: "Developer experience",
    evidence:
      "The public guides cover the first-draft checklist, provider credentials, configuration placement and connection checks. The final source release and first clean install still need verification.",
    prompt:
      "Use a fresh source export and isolated Supabase instance to complete the first-draft checklist. Record the results before marking the install verified.",
  },
  {
    title: "Dot and client compatibility",
    status: "Planned",
    owner: "Integration QA",
    evidence:
      "Client documentation reviewed. Record an actual authenticated read and applicable writes for each supported surface.",
    prompt:
      "Verify Dot, ChatGPT, Codex, Claude, Gemini and Perplexity individually and record their exact tested capabilities.",
  },
  {
    title: "Production and public release",
    status: "In progress",
    owner: "Release owner",
    evidence:
      "The five production migrations are applied and verified. The publisher update is active and the production pilot switches are configured. Verify the live endpoints and client connections. Public source has separate review and installation checks.",
    prompt:
      "Verify target, scope, approval and rollback readiness before deploying or publishing the public repository and registry listings.",
  },
];

export default function AgentAccessSprint() {
  const [includeVerified, setIncludeVerified] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  async function copyPrompt(title: string, prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus(`Copied task prompt for ${title}.`);
    } catch {
      setCopyStatus(
        `Could not copy the prompt for ${title}. Select and copy it below.`,
      );
    }
  }

  return (
    <Card id="open-source-agent-access-sprint" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Open source, AI agent access and search discovery</CardTitle>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={includeVerified}
            onCheckedChange={(value) => setIncludeVerified(value === true)}
          />
          Show verified tasks
        </label>
      </CardHeader>
      <CardContent className="space-y-4">
        <p role="status" className="sr-only">
          {copyStatus}
        </p>
        {tasks
          .filter((task) => includeVerified || task.status !== "Verified")
          .map((task) => (
            <section
              key={task.title}
              className="space-y-2 rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{task.title}</h3>
                <Badge variant="outline">{task.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {task.owner} · {task.evidence}
              </p>
              <p className="text-sm">{task.prompt}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copyPrompt(task.title, task.prompt)}
              >
                Copy task prompt
                <span className="sr-only"> for {task.title}</span>
              </Button>
            </section>
          ))}
      </CardContent>
    </Card>
  );
}
