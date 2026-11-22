import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AgentPublishingSettings } from "./AgentPublishingSettings";
import { AgentWebhookSettings } from "./AgentWebhookSettings";
import { AgentCreditUsage } from "./AgentCreditUsage";
import {
  getAgentAccessSettings,
  createAgentApiKey,
  revokeAgentConnection,
  rotateAgentApiKey,
} from "@/lib/agent-access.functions";

type Settings = Awaited<ReturnType<typeof getAgentAccessSettings>>;
export function AgentAccessSettingsPage() {
  const { currentWorkspace } = useWorkspace();
  return (
    <AgentAccessWorkspaceSettings
      key={currentWorkspace?.id ?? "no-workspace"}
      workspaceId={currentWorkspace?.id}
      workspaceName={currentWorkspace?.name}
    />
  );
}

function AgentAccessWorkspaceSettings({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string | undefined;
  workspaceName: string | undefined;
}) {
  const getSettings = useServerFn(getAgentAccessSettings);
  const createKey = useServerFn(createAgentApiKey);
  const revoke = useServerFn(revokeAgentConnection);
  const rotate = useServerFn(rotateAgentApiKey);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState(30);
  const [scopes, setScopes] = useState<string[]>(["channels:read"]);
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setSettings(await getSettings({ data: { workspaceId } }));
      setError("");
    } catch {
      setSettings(null);
      setError("Agent access settings are unavailable. Please try again.");
    }
  }, [workspaceId, getSettings]);
  useEffect(() => {
    setSettings(null);
    setSecret("");
    void refresh();
  }, [refresh]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch {
      setError("The action could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const requests =
    settings?.requests.filter(
      (request) =>
        (outcome === "all" || request.outcome === outcome) &&
        `${request.id} ${request.operation} ${request.transport} ${request.outcome} ${request.connection_id ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) ?? [];
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <a href="/app/settings" className="text-sm underline">
        Back to settings
      </a>
      <h1 className="mt-4 text-3xl font-semibold">Agent access</h1>
      <p className="mt-3 text-muted-foreground">
        Manage connections and review agent requests for{" "}
        {workspaceName ?? "your workspace"}.
      </p>
      {error && (
        <p role="alert" className="mt-4">
          {error}
        </p>
      )}
      {!workspaceId ? (
        <p className="mt-6">Select a workspace to manage agent access.</p>
      ) : !settings ? (
        <p className="mt-6">
          {error ? "Settings could not be loaded." : "Loading settings…"}
        </p>
      ) : (
        <>
          {settings.enabled && <AgentCreditUsage workspaceId={workspaceId} />}
          {!settings.enabled && (
            <p className="mt-6 rounded border border-border p-4">
              Agent access is unavailable for this workspace.
            </p>
          )}
          {secret && (
            <section
              className="mt-6 rounded border border-border p-4"
              aria-live="polite"
            >
              <h2 className="font-semibold">Copy your key now</h2>
              <p className="mt-2 text-sm">
                This secret is shown once. Store it securely; it will not appear
                in the connection list.
              </p>
              <code className="mt-2 block break-all">{secret}</code>
              <button
                className="mt-3 underline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(secret);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "Copied" : "Copy key"}
              </button>
              <button
                className="ml-4 underline"
                onClick={() => {
                  setSecret("");
                  setCopied(false);
                }}
              >
                Dismiss
              </button>
            </section>
          )}
          {settings.enabled && settings.canManageAll && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold">Create an API key</h2>
              <p className="mt-2 text-sm">
                Choose only the permissions this client needs. Draft access can
                save supplied copy and previews; it cannot schedule or publish.
                Keys expire after 1–90 days.
              </p>
              <form
                className="mt-4 flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!workspaceId || !label.trim() || days < 1 || days > 90)
                    return;
                  void run(async () => {
                    const result = await createKey({
                      data: {
                        workspaceId,
                        label: label.trim(),
                        days,
                        scopes: scopes as (
                          | "channels:read"
                          | "brand:read"
                          | "drafts:write"
                          | "posts:read"
                        )[],
                      },
                    });
                    setSecret(result.secret);
                    setCopied(false);
                    setLabel("");
                  });
                }}
              >
                <label>
                  Key name
                  <input
                    required
                    maxLength={100}
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    className="mt-1 block rounded border border-input bg-background p-2"
                  />
                </label>
                <label>
                  Expires in days
                  <input
                    type="number"
                    min={1}
                    max={90}
                    required
                    value={days}
                    onChange={(event) => setDays(Number(event.target.value))}
                    className="mt-1 block w-28 rounded border border-input bg-background p-2"
                  />
                </label>
                <fieldset className="w-full">
                  <legend className="font-medium">Permissions</legend>
                  {settings.availableScopes.map((scope) => (
                    <label
                      key={scope}
                      className="mr-4 inline-flex items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        checked={scopes.includes(scope)}
                        onChange={(event) =>
                          setScopes((current) =>
                            event.target.checked
                              ? [...current, scope]
                              : current.filter((item) => item !== scope),
                          )
                        }
                      />
                      {scope}
                    </label>
                  ))}
                </fieldset>
                <button
                  disabled={busy || scopes.length === 0}
                  className="rounded bg-primary px-4 py-2 text-primary-foreground"
                >
                  Create key
                </button>
              </form>
            </section>
          )}
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Connections</h2>
            {settings.connections.length === 0 ? (
              <p className="mt-3">No agent connections yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {settings.connections.map((connection) => (
                  <li
                    key={connection.id}
                    className="rounded border border-border p-4"
                  >
                    <h3 className="font-semibold">{connection.label}</h3>
                    <p className="mt-1 text-sm">
                      {connection.kind} ·{" "}
                      {connection.key_prefix
                        ? `${connection.key_prefix}••••`
                        : "No API key"}{" "}
                      · {connection.revoked_at ? "Revoked" : "Active"}
                    </p>
                    <p className="mt-1 text-sm">
                      Scopes: {connection.scopes.join(", ") || "None"} ·
                      Expires:{" "}
                      {connection.expires_at
                        ? new Date(connection.expires_at).toLocaleDateString()
                        : "Not specified"}
                    </p>
                    {settings.canManageAll && !connection.revoked_at && (
                      <div className="mt-3 flex gap-4">
                        <button
                          disabled={busy}
                          className="underline"
                          onClick={() => {
                            if (window.confirm(`Revoke ${connection.label}?`))
                              void run(async () => {
                                await revoke({
                                  data: {
                                    workspaceId,
                                    connectionId: connection.id,
                                  },
                                });
                              });
                          }}
                        >
                          Revoke
                        </button>
                        {connection.kind === "api_key" && (
                          <button
                            disabled={busy}
                            className="underline"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Rotate the key for ${connection.label}? The previous key will stop working.`,
                                )
                              )
                                void run(async () => {
                                  const result = await rotate({
                                    data: {
                                      workspaceId,
                                      connectionId: connection.id,
                                    },
                                  });
                                  setSecret(result.secret);
                                  setCopied(false);
                                });
                            }}
                          >
                            Rotate key
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {settings.canManageAll && (
            <AgentPublishingSettings
              key={workspaceId}
              workspaceId={workspaceId}
              connections={settings.connections}
            />
          )}
          {settings.canManageAll && (
            <AgentWebhookSettings
              key={`webhooks-${workspaceId}`}
              workspaceId={workspaceId}
            />
          )}
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Request log</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <label>
                Search requests
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="mt-1 block rounded border border-input bg-background p-2"
                />
              </label>
              <label>
                Outcome
                <select
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value)}
                  className="mt-1 block rounded border border-input bg-background p-2"
                >
                  <option value="all">All outcomes</option>
                  {Array.from(
                    new Set(
                      settings.requests.map((request) => request.outcome),
                    ),
                  ).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {requests.length === 0 ? (
              <p className="mt-4">No matching requests.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {requests.map((request) => (
                  <li
                    key={request.id}
                    className="rounded border border-border p-3 text-sm"
                  >
                    <strong>{request.operation}</strong> · {request.outcome} ·{" "}
                    {request.transport}
                    <br />
                    {new Date(request.occurred_at).toLocaleString()}
                    {request.duration_ms != null &&
                      ` · ${request.duration_ms} ms`}
                    {request.settled_credits != null &&
                      ` · ${request.settled_credits} credits`}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
