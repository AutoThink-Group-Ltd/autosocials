/** Keep only a hash of the input in session storage, never a topic, URL or handle. */
export type PendingRequest = { key: string; id: string };

export async function acquirePendingRequest(
  workspaceId: string,
  action: unknown,
): Promise<PendingRequest> {
  if (!crypto.subtle || typeof crypto.randomUUID !== "function")
    throw new Error(
      "Research cannot safely record this request in this browser.",
    );
  const input = new TextEncoder().encode(JSON.stringify(action));
  const digest = await crypto.subtle.digest("SHA-256", input);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const key = `as:virlo-pending:${workspaceId}:${hash}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (
      existing &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        existing,
      )
    )
      return { key, id: existing };
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return { key, id };
  } catch {
    throw new Error(
      "Research cannot safely record this request in this browser. Enable session storage and try again.",
    );
  }
}

export function completePendingRequest(pending: PendingRequest) {
  try {
    if (sessionStorage.getItem(pending.key) === pending.id)
      sessionStorage.removeItem(pending.key);
  } catch {
    /* A retained ID only prevents duplicate work; it cannot create another charge. */
  }
}
