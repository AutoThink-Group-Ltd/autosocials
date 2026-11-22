import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  createAgentWebhook,
  disableAgentWebhook,
  listAgentWebhooks,
} from "@/lib/agent-webhooks.functions";

type Subscription = {
  id: string;
  endpoint: string;
  event_types: string[];
  enabled: boolean;
};
type Delivery = {
  id: string;
  subscription_id: string;
  event_type: string;
  status: string;
  attempts: number;
  last_http_status: number | null;
  created_at: string;
};
export function AgentWebhookSettings({ workspaceId }: { workspaceId: string }) {
  const list = useServerFn(listAgentWebhooks),
    create = useServerFn(createAgentWebhook),
    disable = useServerFn(disableAgentWebhook);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]),
    [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [endpoint, setEndpoint] = useState(""),
    [events, setEvents] = useState(""),
    [secret, setSecret] = useState(""),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = await list({ data: { workspaceId } });
      setSubscriptions(result.subscriptions);
      setDeliveries(result.deliveries);
      setError("");
    } catch {
      setError("Webhook settings are unavailable.");
    } finally {
      setLoading(false);
    }
  }, [list, workspaceId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">Webhook subscriptions</h2>
      <p className="mt-2 text-sm">
        Register a public HTTPS endpoint for selected event types. Event
        production and delivery are not yet verified; registration does not
        guarantee notifications.
      </p>
      {error && (
        <p role="alert" className="mt-3">
          {error}
        </p>
      )}
      {secret && (
        <div
          className="mt-4 rounded border border-border p-4"
          aria-live="polite"
        >
          <strong>Copy your signing secret now</strong>
          <p className="mt-2 text-sm">
            It will not be shown again. Store it securely.
          </p>
          <code className="mt-2 block break-all">{secret}</code>
          <button
            className="mt-2 underline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy secret"}
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
        </div>
      )}
      {loading ? (
        <p className="mt-3">Loading subscriptions…</p>
      ) : (
        <>
          {subscriptions.length === 0 ? (
            <p className="mt-3">No subscriptions.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {subscriptions.map((sub) => (
                <li key={sub.id} className="rounded border border-border p-3">
                  <p className="break-all">{sub.endpoint}</p>
                  <p className="text-sm">
                    {sub.enabled ? "Enabled" : "Disabled"} ·{" "}
                    {sub.event_types.join(", ")}
                  </p>
                  {sub.enabled && (
                    <button
                      disabled={busy}
                      className="mt-2 underline"
                      onClick={async () => {
                        if (
                          !window.confirm("Disable this webhook subscription?")
                        )
                          return;
                        setBusy(true);
                        try {
                          await disable({
                            data: { workspaceId, subscriptionId: sub.id },
                          });
                          await refresh();
                        } catch {
                          setError("Could not disable subscription.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Disable
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-5 space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const eventTypes = events
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
              if (!eventTypes.length) {
                setError("Enter at least one event type.");
                return;
              }
              if (!window.confirm("Create this webhook subscription?")) return;
              setBusy(true);
              try {
                const result = await create({
                  data: { workspaceId, endpoint, eventTypes },
                });
                setSecret(result.secret);
                setCopied(false);
                setEndpoint("");
                setEvents("");
                await refresh();
              } catch {
                setError(
                  "Could not create subscription. Check the URL and event types.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block">
              HTTPS endpoint
              <input
                type="url"
                required
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                className="mt-1 block w-full rounded border border-input bg-background p-2"
              />
            </label>
            <label className="block">
              Event types, comma separated
              <input
                required
                value={events}
                onChange={(event) => setEvents(event.target.value)}
                placeholder="example.created"
                className="mt-1 block w-full rounded border border-input bg-background p-2"
              />
            </label>
            <button
              disabled={busy}
              className="rounded border border-input px-4 py-2"
            >
              Create subscription
            </button>
          </form>
          <h3 className="mt-6 font-semibold">Recent deliveries</h3>
          {deliveries.length === 0 ? (
            <p className="mt-2">No deliveries recorded.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {deliveries.map((delivery) => (
                <li key={delivery.id} className="text-sm">
                  {delivery.event_type} · {delivery.status} ·{" "}
                  {delivery.attempts} attempts
                  {delivery.last_http_status != null &&
                    ` · HTTP ${delivery.last_http_status}`}{" "}
                  · {new Date(delivery.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
