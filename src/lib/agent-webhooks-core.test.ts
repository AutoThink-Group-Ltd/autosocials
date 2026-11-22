import { describe, expect, it } from "vitest";
import {
  createWebhookSubscription,
  listWebhookStatus,
  processOneWebhookDelivery,
} from "./agent-webhooks.server";
const workspace = "00000000-0000-4000-8000-000000000001",
  user = "00000000-0000-4000-8000-000000000002",
  delivery = "00000000-0000-4000-8000-000000000003",
  lease = "00000000-0000-4000-8000-000000000004";
function query(result: any, writes: any[]) {
  const q: any = {};
  for (const name of ["select", "eq", "lt", "order", "limit", "contains"])
    q[name] = () => q;
  q.update = (value: any) => {
    writes.push(value);
    return q;
  };
  q.maybeSingle = async () => result;
  q.single = async () => result;
  q.then = (resolve: any, reject: any) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}
describe("webhook authorization and retry", () => {
  it("rejects non-owner and failed membership lookup before changes", async () => {
    for (const member of [
      { data: { role: "admin" }, error: null },
      { data: null, error: new Error("unavailable") },
    ]) {
      const writes: any[] = [];
      const db = { from: () => query(member, writes) };
      await expect(
        createWebhookSubscription(
          db,
          user,
          workspace,
          "https://hooks.example.com",
          ["post.created"],
        ),
      ).rejects.toThrow("owner");
      await expect(listWebhookStatus(db, user, workspace)).rejects.toThrow(
        "owner",
      );
      expect(writes).toEqual([]);
    }
  });
  it("caps a failed fifth attempt and stores no response or secret", async () => {
    const writes: any[] = [];
    let deliveryQuery = 0;
    const db = {
      from: (table: string) => {
        if (table === "agent_webhook_subscriptions")
          return query({ data: null, error: new Error("missing") }, writes);
        deliveryQuery++;
        return query(
          deliveryQuery === 1
            ? { error: null }
            : { data: { id: delivery }, error: null },
          writes,
        );
      },
      rpc: async () => ({
        data: [
          {
            id: delivery,
            lease_id: lease,
            workspace_id: workspace,
            subscription_id: user,
            attempts: 5,
          },
        ],
        error: null,
      }),
    };
    expect(await processOneWebhookDelivery(db)).toEqual({
      processed: true,
      delivered: false,
    });
    expect(writes.at(-1)).toMatchObject({
      status: "failed",
      last_http_status: null,
      lease_id: null,
    });
    expect(JSON.stringify(writes)).not.toContain("missing");
  });
});
