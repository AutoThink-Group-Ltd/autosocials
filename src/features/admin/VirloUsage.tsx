import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAdminVirloUsage } from "@/lib/admin-virlo.functions";

const uuid = (value: string) =>
  !value ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const money = (value: number | null) =>
  value === null ? "Unknown" : `US$${value.toFixed(4)}`;

export default function VirloUsage() {
  const [workspaceId, setWorkspace] = useState("");
  const [userId, setUser] = useState("");
  const [operation, setOperation] = useState("");
  const [status, setStatus] = useState<
    "" | "started" | "completed" | "failed" | "unknown"
  >("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const valid =
    uuid(workspaceId) &&
    uuid(userId) &&
    operation.length <= 100 &&
    (!from || !to || from <= to);
  const query = useQuery({
    queryKey: [
      "admin-virlo-usage",
      workspaceId,
      userId,
      operation,
      status,
      from,
      to,
      page,
    ],
    enabled: valid,
    queryFn: () =>
      listAdminVirloUsage({
        data: {
          workspaceId: workspaceId || undefined,
          userId: userId || undefined,
          operation: operation.trim() || undefined,
          status: status || undefined,
          from: from || undefined,
          to: to || undefined,
          page,
        },
      }),
  });
  const data = query.data;
  return (
    <section className="space-y-5 p-6 text-foreground">
      <header>
        <h1 className="text-xl font-semibold">Virlo usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recorded provider activity across workspaces. Research is free to
          users; these are provider costs.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-72"
          aria-label="Workspace ID"
          placeholder="Workspace UUID"
          value={workspaceId}
          onChange={(e) => {
            setWorkspace(e.target.value);
            setPage(0);
          }}
        />
        <Input
          className="max-w-72"
          aria-label="User ID"
          placeholder="User UUID"
          value={userId}
          onChange={(e) => {
            setUser(e.target.value);
            setPage(0);
          }}
        />
        <Input
          className="max-w-56"
          aria-label="Operation"
          placeholder="Exact operation"
          value={operation}
          onChange={(e) => {
            setOperation(e.target.value);
            setPage(0);
          }}
        />
        <label className="text-sm">
          Status{" "}
          <select
            className="rounded border border-border bg-surface p-2"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(0);
            }}
          >
            <option value="">All</option>
            <option value="started">Started</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label className="text-sm">
          From (UTC){" "}
          <input
            className="rounded border border-border bg-surface p-2"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="text-sm">
          To (UTC){" "}
          <input
            className="rounded border border-border bg-surface p-2"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <Button
          variant="outline"
          onClick={() => void query.refetch()}
          disabled={!valid}
        >
          Refresh
        </Button>
      </div>
      {!valid && <p role="alert">Enter valid UUIDs and a valid date range.</p>}
      {query.isPending && valid && <p>Loading Virlo usage…</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {data && (
        <>
          <div className="rounded-lg border border-border bg-surface-subtle p-4 text-sm">
            <p>
              {data.total.toLocaleString()} matching records ·{" "}
              {data.rows.length} shown
            </p>
            <p className="mt-1">
              All matching records: {money(data.summary.reportedUsd)} in gross
              provider-reported costs across {data.summary.reportedCount}{" "}
              records. Estimated costs without a receipt:{" "}
              {money(data.summary.estimatedUsd)}
              across {data.summary.estimatedCount} records.{" "}
              {data.summary.unknownCount} have neither a receipt nor an
              estimate; {data.summary.unresolvedCount} are started or
              unresolved.
            </p>
            <p className="mt-1">
              {data.summary.noResponseCount} records have{" "}
              {money(data.summary.noResponseUsd)} stored without a provider
              response; these are not included as provider-reported charges.
            </p>
            <p className="mt-1 text-muted-foreground">
              Totals cover the matching recorded requests, not necessarily the
              full Virlo bill. Provider-reported amounts are gross and estimates
              are separate, never added to reported amounts for the same
              request. Refunds and recurring charges outside recorded requests
              are not captured and require reconciliation with Virlo.
            </p>
            <p className="mt-1 text-muted-foreground">
              For unknown or unlinked tracking requests, inspect the resource ID
              and details below. Check the Virlo dashboard for scheduled checks
              and pause them there if needed. Do not retry an uncertain request
              until it has been reconciled. Turning off the AutoSocials
              integration does not stop checks already scheduled with Virlo.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  {[
                    "Time",
                    "Workspace",
                    "User",
                    "Operation",
                    "Status",
                    "Provider response",
                    "Provider resource / details",
                    "Stored / estimated cost",
                    "Credits",
                  ].map((label) => (
                    <th className="p-3" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr className="border-t border-border align-top" key={row.id}>
                    <td className="p-3">
                      {new Date(row.createdAt).toLocaleString("en-GB", {
                        timeZone: "UTC",
                      })}{" "}
                      UTC
                    </td>
                    <td className="p-3">
                      {row.workspaceName}
                      <p className="text-xs text-muted-foreground">
                        {row.workspaceId}
                      </p>
                    </td>
                    <td className="p-3">
                      {row.userName}
                      <p className="text-xs text-muted-foreground">
                        {row.userId}
                      </p>
                    </td>
                    <td className="p-3">{row.operation}</td>
                    <td className="p-3">{row.status}</td>
                    <td className="p-3">{row.providerStatus ?? "Unknown"}</td>
                    <td className="p-3">
                      <span className="break-all">
                        {row.providerResourceId ?? "No resource ID recorded"}
                      </span>
                      {Object.entries(row.operationMeta).map(([key, value]) => (
                        <p
                          key={key}
                          className="break-all text-xs text-muted-foreground"
                        >
                          {key.replaceAll("_", " ")}: {value}
                        </p>
                      ))}
                    </td>
                    <td className="p-3">
                      {money(row.costUsd)}
                      {row.costUsd !== null && row.providerStatus === null && (
                        <p className="text-xs text-muted-foreground">
                          No provider response
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Estimate: {money(row.estimatedCostUsd)}
                      </p>
                    </td>
                    <td className="p-3">{row.creditsUsed ?? "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.rows.length && (
              <p className="p-4 text-sm text-muted-foreground">
                No recorded usage matches these filters.
              </p>
            )}
          </div>
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
              disabled={(page + 1) * 25 >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
