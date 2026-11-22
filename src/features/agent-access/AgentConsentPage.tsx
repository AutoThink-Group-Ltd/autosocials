import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  getAgentConsent,
  resolveAgentConsent,
} from "@/lib/agent-access.functions";

type Consent = Awaited<ReturnType<typeof getAgentConsent>>;
export function AgentConsentPage({ requestId }: { requestId: string }) {
  const { user, loading: authLoading } = useAuth();
  const { workspaces, loading: workspaceLoading } = useWorkspace();
  const getConsent = useServerFn(getAgentConsent);
  const resolve = useServerFn(resolveAgentConsent);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user || !requestId) return;
    let active = true;
    getConsent({ data: { requestId } })
      .then((result) => {
        if (active) setConsent(result);
      })
      .catch(() => {
        if (active)
          setError(
            "This request is unavailable or has expired. Start again in your client.",
          );
      });
    return () => {
      active = false;
    };
  }, [user, requestId, getConsent]);
  const decide = async (allow: boolean) => {
    if (!consent || (allow && !workspaceId)) return;
    setBusy(true);
    setError("");
    try {
      const result = await resolve({
        data: { requestId, ...(allow ? { workspaceId } : {}), allow },
      });
      const destination = new URL(result.redirectUri);
      const loopback =
        destination.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(destination.hostname);
      if (
        (destination.protocol !== "https:" && !loopback) ||
        destination.hostname !== consent.redirectHost
      )
        throw new Error("Unexpected redirect destination");
      window.location.assign(destination.href);
    } catch {
      setError(
        "The request could not be completed safely. Return to your client and try again.",
      );
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Connect an agent</h1>
      {authLoading ? (
        <p className="mt-5">Checking sign-in…</p>
      ) : !user ? (
        <p className="mt-5">
          Sign in to review this request.{" "}
          <a
            href="/auth"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Open sign in
          </a>
          , then return to this tab and reload it.
        </p>
      ) : !requestId ? (
        <p className="mt-5" role="alert">
          No request was supplied. Start again in your client.
        </p>
      ) : (
        <>
          {error && (
            <p className="mt-5" role="alert">
              {error}
            </p>
          )}
          {consent && (
            <>
              <p className="mt-5">
                <strong>{consent.label}</strong> is requesting access to one
                workspace.
              </p>
              <p className="mt-3">
                Return destination: <strong>{consent.redirectHost}</strong>
              </p>
              <p className="mt-3">
                Request expires: {new Date(consent.expiresAt).toLocaleString()}
              </p>
              <h2 className="mt-6 text-lg font-semibold">
                Requested permissions
              </h2>
              <ul className="mt-2 list-disc pl-6">
                {consent.scopes.map((scope) => (
                  <li key={scope}>{scope}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted-foreground">
                These requested permissions do not grant standing permission to
                publish. Review any publishing action separately.
              </p>
              <label
                className="mt-6 block font-medium"
                htmlFor="agent-workspace"
              >
                Workspace
              </label>
              <select
                id="agent-workspace"
                className="mt-2 w-full rounded border border-input bg-background p-2"
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
              >
                <option value="">Select a workspace</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              {!workspaceLoading && workspaces.length === 0 && (
                <p className="mt-2">No accessible workspace found.</p>
              )}
              <div className="mt-6 flex gap-3">
                <button
                  className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
                  disabled={busy || !workspaceId}
                  onClick={() => void decide(true)}
                >
                  Allow access
                </button>
                <button
                  className="rounded border border-input px-4 py-2"
                  disabled={busy}
                  onClick={() => void decide(false)}
                >
                  Deny
                </button>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
