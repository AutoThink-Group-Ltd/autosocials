import { describe, expect, it } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  isPublicAddress,
  parseWebhookUrl,
  resolveWebhookEndpoint,
  signWebhook,
} from "./agent-webhooks-transport.server";

describe("webhook security", () => {
  it("rejects local, reserved and mapped addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "100.64.1.1",
      "192.0.2.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:8.8.8.8",
      "2001:db8::1",
      "2002::1",
    ])
      expect(isPublicAddress(address), address).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("requires every DNS answer to be safe, even if another is public", async () => {
    const url = parseWebhookUrl("https://hooks.example.com/path");
    await expect(
      resolveWebhookEndpoint(url, async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toThrow();
    expect(
      await resolveWebhookEndpoint(url, async () => [
        { address: "8.8.8.8", family: 4 },
      ]),
    ).toEqual({ address: "8.8.8.8", family: 4 });
  });
  it("rejects non-HTTPS, IP literals, local hosts, auth, query and redirects as destinations", () => {
    for (const url of [
      "http://example.com",
      "https://127.0.0.1",
      "https://[::1]",
      "https://localhost",
      "https://a.localhost",
      "https://u:p@example.com",
      "https://example.com/?token=x",
      "https://example.com:444/",
    ])
      expect(() => parseWebhookUrl(url), url).toThrow();
  });
  it("authenticates ciphertext to the subscription and signs exact bytes", () => {
    process.env["AGENT_WEBHOOK_ENCRYPTION_KEY"] =
      randomBytes(32).toString("base64");
    const encrypted = encryptWebhookSecret(
      "test-only-secret",
      "workspace:subscription",
    );
    expect(decryptWebhookSecret(encrypted, "workspace:subscription")).toBe(
      "test-only-secret",
    );
    expect(() => decryptWebhookSecret(encrypted, "other")).toThrow();
    expect(signWebhook("secret", "123", '{"id":"one"}')).toBe(
      createHmac("sha256", "secret").update('123.{"id":"one"}').digest("hex"),
    );
    delete process.env["AGENT_WEBHOOK_ENCRYPTION_KEY"];
  });
});
