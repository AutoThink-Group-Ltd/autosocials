import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  activateAgentPublishingPolicy,
  disableAgentPublishingPolicy,
  getAgentPublishingSettings,
} from "@/lib/agent-access.functions";
import { validatePublishingGrant } from "./publishingGrant";

type Connection = {
  id: string;
  label: string;
  kind: string;
  scopes: string[];
  revoked_at: string | null;
  expires_at: string | null;
};
type PublishingRequest = {
  requestId: string;
  postId: string;
  action: string;
  scheduledAt: string;
  createdAt: string;
  status: string;
  publishedAt: string | null;
};
type PublishingSettings = Awaited<
  ReturnType<typeof getAgentPublishingSettings>
> & { requests?: PublishingRequest[] };
export function AgentPublishingSettings({
  workspaceId,
  connections,
}: {
  workspaceId: string;
  connections: Connection[];
}) {
  const get = useServerFn(getAgentPublishingSettings);
  const activate = useServerFn(activateAgentPublishingPolicy);
  const disable = useServerFn(disableAgentPublishingPolicy);
  const [settings, setSettings] = useState<PublishingSettings | null>(null);
  const [connectionId, setConnectionId] = useState("");
  const [accounts, setAccounts] = useState<string[]>([]);
  const [immediateAccounts, setImmediateAccounts] = useState<string[]>([]);
  const [immediate, setImmediate] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [maxCount, setMaxCount] = useState(10);
  const [maxNow, setMaxNow] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const eligible = connections.filter(
    (c) =>
      c.kind === "oauth" &&
      !c.revoked_at &&
      !!c.expires_at &&
      Date.parse(c.expires_at) > Date.now() &&
      c.scopes.includes("posts:schedule"),
  );
  const selected = eligible.find(
    (connection) => connection.id === connectionId,
  );
  const canPublishNow = !!selected?.scopes.includes("posts:publish");
  const refresh = useCallback(async () => {
    try {
      setSettings(await get({ data: { workspaceId } }));
      setError("");
    } catch {
      setSettings(null);
      setError(
        "Publishing settings are unavailable. Owner access may be required.",
      );
    }
  }, [get, workspaceId]);
  useEffect(() => {
    setSettings(null);
    void refresh();
  }, [refresh]);
  const submit = async () => {
    const date = new Date(expiry);
    const grant = {
      connectionId,
      accountIds: accounts,
      expiresAt: Number.isFinite(date.getTime()) ? date.toISOString() : "",
      maxCount,
      publishNowAccountIds: immediate ? immediateAccounts : [],
      publishNowMaxCount: immediate ? maxNow : 0,
    };
    const problem =
      validatePublishingGrant(grant) ||
      (!selected?.expires_at ||
      Date.parse(grant.expiresAt) > Date.parse(selected.expires_at)
        ? "Grant must expire no later than the active connection."
        : null) ||
      (immediate && !canPublishNow
        ? "This connection cannot publish immediately."
        : null);
    if (problem) {
      setError(problem);
      return;
    }
    if (
      !confirmed ||
      !window.confirm(
        "Allow this agent connection to use the selected LinkedIn accounts under these limits?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await activate({ data: { workspaceId, ...grant, confirmed: true } });
      setConfirmed(false);
      setAccounts([]);
      setImmediateAccounts([]);
      setImmediate(false);
      await refresh();
    } catch {
      setError(
        "Could not activate the grant. Confirm owner access and the connection permissions.",
      );
    } finally {
      setBusy(false);
    }
  };
  const toggle = (current: string[], id: string, checked: boolean) =>
    checked ? [...current, id] : current.filter((item) => item !== id);
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">
        LinkedIn standing publishing grants
      </h2>
      <p className="mt-2 text-sm">
        This gated pilot is text-only. A standing grant lets the selected OAuth
        client schedule posts without asking each time, within the selected
        accounts, expiry and lifetime count. Immediate publishing is a separate
        opt-in. Only the workspace owner can create or disable grants.
      </p>
      {error && (
        <p role="alert" className="mt-3">
          {error}
        </p>
      )}
      {!settings ? (
        <p className="mt-3">
          {error
            ? "Grant settings could not be loaded."
            : "Loading publishing settings…"}
        </p>
      ) : (
        <>
          {!settings.enabled && (
            <p className="mt-3">
              The publishing pilot is unavailable for this workspace.
            </p>
          )}
          <h3 className="mt-5 font-semibold">Recent publishing requests</h3>
          <p className="mt-2 text-sm">
            Held posts require review in the scheduler. They are not
            automatically released here.
          </p>
          <a href="/app/schedule" className="mt-2 inline-block underline">
            Open scheduler
          </a>
          {!settings.requests ? (
            <p className="mt-2">Request status is unavailable.</p>
          ) : settings.requests.length === 0 ? (
            <p className="mt-2">No publishing requests yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {settings.requests.map((request) => (
                <li
                  key={request.requestId}
                  className="rounded border border-border p-3 text-sm"
                >
                  <strong>{request.status}</strong> ·{" "}
                  {request.action.replaceAll("_", " ")} · scheduled{" "}
                  {new Date(request.scheduledAt).toLocaleString()}
                  <p>
                    Request {request.requestId} · Post {request.postId}
                  </p>
                  {request.publishedAt && (
                    <p>
                      Published {new Date(request.publishedAt).toLocaleString()}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-5 font-semibold">Existing grants</h3>
          {settings.policies.length === 0 ? (
            <p className="mt-2">No standing grants.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {settings.policies.map((policy) => (
                <li
                  key={policy.id}
                  className="rounded border border-border p-3 text-sm"
                >
                  <strong>
                    {connections.find((c) => c.id === policy.connection_id)
                      ?.label ?? "Connection"}
                  </strong>{" "}
                  ·{" "}
                  {policy.revoked_at
                    ? "Disabled"
                    : Date.parse(policy.expires_at) <= Date.now()
                      ? "Expired"
                      : "Active"}
                  <p>
                    Accounts:{" "}
                    {policy.account_ids
                      .map(
                        (id) =>
                          settings.accounts.find((a) => a.id === id)
                            ?.display_name ||
                          settings.accounts.find((a) => a.id === id)?.handle ||
                          id,
                      )
                      .join(", ")}
                  </p>
                  <p>
                    Expires: {new Date(policy.expires_at).toLocaleString()} ·
                    Total limit: {policy.max_count} · Immediate limit:{" "}
                    {policy.publish_now_max_count}
                  </p>
                  {!policy.revoked_at && (
                    <button
                      disabled={busy}
                      className="mt-2 underline"
                      onClick={async () => {
                        if (!window.confirm("Disable this standing grant?"))
                          return;
                        setBusy(true);
                        try {
                          await disable({
                            data: { workspaceId, policyId: policy.id },
                          });
                          await refresh();
                        } catch {
                          setError("Could not disable this grant.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Disable grant
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {settings.enabled && (
            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <h3 className="font-semibold">Create a standing grant</h3>
              <label className="block">
                OAuth connection
                <select
                  value={connectionId}
                  onChange={(event) => {
                    setConnectionId(event.target.value);
                    setImmediate(false);
                    setImmediateAccounts([]);
                    setConfirmed(false);
                  }}
                  className="mt-1 block w-full rounded border border-input bg-background p-2"
                >
                  <option value="">Select a connection</option>
                  {eligible.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.label}
                    </option>
                  ))}
                </select>
              </label>
              {eligible.length === 0 && (
                <p className="text-sm">
                  No active OAuth connection with scheduling scope is available.
                  The connection must belong to the workspace owner.
                </p>
              )}
              <fieldset>
                <legend>LinkedIn accounts allowed</legend>
                {settings.accounts.length === 0 && (
                  <p>No eligible connected LinkedIn accounts.</p>
                )}
                {settings.accounts.map((account) => (
                  <label className="mt-2 block" key={account.id}>
                    <input
                      type="checkbox"
                      checked={accounts.includes(account.id)}
                      onChange={(event) => {
                        setAccounts((current) =>
                          toggle(current, account.id, event.target.checked),
                        );
                        if (!event.target.checked)
                          setImmediateAccounts((current) =>
                            current.filter((id) => id !== account.id),
                          );
                      }}
                    />{" "}
                    {account.display_name || account.handle || account.id}
                  </label>
                ))}
              </fieldset>
              <label className="block">
                Expires at (local time)
                <input
                  type="datetime-local"
                  required
                  value={expiry}
                  onChange={(event) => setExpiry(event.target.value)}
                  className="mt-1 block rounded border border-input bg-background p-2"
                />
              </label>
              <label className="block">
                Maximum total posts over this grant’s lifetime
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={maxCount}
                  onChange={(event) => setMaxCount(Number(event.target.value))}
                  className="mt-1 block rounded border border-input bg-background p-2"
                />
              </label>
              <label className="block">
                <input
                  type="checkbox"
                  checked={immediate}
                  disabled={!canPublishNow}
                  onChange={(event) => {
                    setImmediate(event.target.checked);
                    if (!event.target.checked) setImmediateAccounts([]);
                  }}
                />{" "}
                Also allow immediate publishing
              </label>
              {immediate && (
                <fieldset>
                  <legend>Accounts allowed to publish immediately</legend>
                  {settings.accounts
                    .filter((account) => accounts.includes(account.id))
                    .map((account) => (
                      <label className="mt-2 block" key={account.id}>
                        <input
                          type="checkbox"
                          checked={immediateAccounts.includes(account.id)}
                          onChange={(event) =>
                            setImmediateAccounts((current) =>
                              toggle(current, account.id, event.target.checked),
                            )
                          }
                        />{" "}
                        {account.display_name || account.handle || account.id}
                      </label>
                    ))}
                  <label className="mt-3 block">
                    Maximum immediate posts
                    <input
                      type="number"
                      min={1}
                      max={maxCount}
                      value={maxNow}
                      onChange={(event) =>
                        setMaxNow(Number(event.target.value))
                      }
                      className="mt-1 block rounded border border-input bg-background p-2"
                    />
                  </label>
                </fieldset>
              )}
              <label className="block">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />{" "}
                I understand this grants standing permission within these
                limits.
              </label>
              <button
                disabled={busy || !confirmed}
                className="rounded bg-primary px-4 py-2 text-primary-foreground"
              >
                Review and activate grant
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
