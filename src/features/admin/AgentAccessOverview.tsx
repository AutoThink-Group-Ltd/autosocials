import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAgentAdminOverview } from "@/lib/agent-access.functions";

type Filters = { workspaceId?: string; requestId?: string; outcome?: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export default function AgentAccessOverview() {
  const read = useServerFn(getAgentAdminOverview);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<Filters>({});
  const [invalid, setInvalid] = useState("");
  const query = useQuery({
    queryKey: ["agent-access-admin", filters, page],
    queryFn: () => read({ data: { ...filters, page } }),
    retry: false,
  });

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const workspaceId = String(values.get("workspaceId") ?? "").trim();
    const requestId = String(values.get("requestId") ?? "").trim();
    const outcome = String(values.get("outcome") ?? "")
      .trim()
      .toUpperCase();
    if (
      (workspaceId && !uuid.test(workspaceId)) ||
      (requestId && !uuid.test(requestId)) ||
      (outcome && !/^[A-Z_]{1,64}$/.test(outcome))
    ) {
      setInvalid("Enter a workspace or request UUID and a valid outcome code.");
      return;
    }
    setInvalid("");
    setPage(0);
    setFilters({
      ...(workspaceId && { workspaceId }),
      ...(requestId && { requestId }),
      ...(outcome && { outcome }),
    });
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 md:px-6">
      <h1 className="text-2xl font-semibold">API and AI agent activity</h1>
      <p className="text-sm text-muted-foreground">
        Requests shown here reached an authenticated REST or MCP operation.
        Older activity and pre-authentication requests have no attribution.
      </p>
      <form
        onSubmit={search}
        className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <label className="space-y-1 text-sm">
          Workspace ID
          <Input name="workspaceId" />
        </label>
        <label className="space-y-1 text-sm">
          Request ID
          <Input name="requestId" />
        </label>
        <label className="space-y-1 text-sm">
          Outcome
          <Input name="outcome" />
        </label>
        <Button type="submit">Search</Button>
      </form>
      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          {invalid}
        </p>
      )}
      {query.isPending && <p role="status">Loading activity…</p>}
      {query.isError && <p role="alert">Agent activity is unavailable.</p>}
      {query.data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Requests</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {query.data.requests.length ? (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      {[
                        "Request ID",
                        "Time (UTC)",
                        "Operation",
                        "Transport",
                        "Outcome",
                        "Duration",
                        "Settled credits",
                      ].map((label) => (
                        <th key={label} scope="col" className="p-2">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.requests.map((row) => (
                      <tr key={row.id} className="border-b">
                        <td className="p-2 font-mono">{row.id}</td>
                        <td className="p-2">
                          {new Date(row.occurred_at).toISOString()}
                        </td>
                        <td className="p-2">{row.operation}</td>
                        <td className="p-2">{row.transport}</td>
                        <td className="p-2">{row.outcome}</td>
                        <td className="p-2">
                          {row.duration_ms === null
                            ? "Unknown"
                            : row.duration_ms + " ms"}
                        </td>
                        <td className="p-2">
                          {row.settled_credits ?? "Unknown"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No requests match.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Connections</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {query.data.connections.length ? (
                query.data.connections.map((connection) => (
                  <article
                    key={connection.id}
                    className="space-y-1 border-b pb-2 text-sm"
                  >
                    <h2 className="font-medium">
                      {connection.label} ·{" "}
                      {connection.kind === "oauth" ? "OAuth" : "API key"}
                    </h2>
                    <p className="break-all text-muted-foreground">
                      Workspace {connection.workspace_id} · Account{" "}
                      {connection.user_id}
                    </p>
                    <p>
                      {connection.scopes.join(", ")} ·{" "}
                      {connection.revoked_at
                        ? "Revoked"
                        : "Expires " +
                          new Date(connection.expires_at).toISOString()}
                    </p>
                    <p className="text-muted-foreground">
                      Last used{" "}
                      {connection.last_used_at
                        ? new Date(connection.last_used_at).toISOString()
                        : "Unknown"}
                    </p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No connections match.
                </p>
              )}
            </CardContent>
          </Card>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm">Page {page + 1}</span>
            <Button
              variant="outline"
              disabled={!query.data.hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
