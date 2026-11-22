import { BlockList, isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

const blocked4 = new BlockList();
for (const [network, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked4.addSubnet(network, bits, "ipv4");
const blocked6 = new BlockList();
for (const [network, bits] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  blocked6.addSubnet(network, bits, "ipv6");
const global6 = new BlockList();
global6.addSubnet("2000::", 3, "ipv6");
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? !blocked4.check(address, "ipv4")
    : family === 6
      ? global6.check(address, "ipv6") && !blocked6.check(address, "ipv6")
      : false;
}
export function parseWebhookUrl(input: string): URL {
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.port && url.port !== "443") ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    !url.hostname.includes(".")
  )
    throw new Error(
      "Webhook endpoint must be a public HTTPS hostname on port 443 without credentials, query or fragment",
    );
  return url;
}
type Address = { address: string; family: number };
export async function resolveWebhookEndpoint(
  url: URL,
  resolver: (host: string) => Promise<Address[]> = (host) =>
    lookup(host, { all: true, verbatim: true }),
): Promise<Address> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    resolver(url.hostname),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("DNS lookup timed out")), 5000);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
  if (
    !addresses.length ||
    addresses.some(
      (a) => !isPublicAddress(a.address) || isIP(a.address) !== a.family,
    )
  )
    throw new Error("Webhook endpoint has an unsafe DNS answer");
  const first = addresses[0];
  if (!first) throw new Error("Webhook endpoint has no DNS answer");
  return first;
}
function key(): Buffer {
  const encoded = process.env["AGENT_WEBHOOK_ENCRYPTION_KEY"] ?? "";
  const result = Buffer.from(encoded, "base64");
  if (
    !/^[A-Za-z0-9+/]{43}=$/.test(encoded) ||
    result.length !== 32 ||
    result.toString("base64") !== encoded
  )
    throw new Error("Webhook encryption key is not configured");
  return result;
}
export function encryptWebhookSecret(secret: string, context: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}
export function decryptWebhookSecret(sealed: string, context: string): string {
  const [version, iv, tag, ciphertext, ...extra] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext || extra.length)
    throw new Error("Invalid encrypted webhook secret");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64"),
  );
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    cipher.update(Buffer.from(ciphertext, "base64")),
    cipher.final(),
  ]).toString("utf8");
}
export function signWebhook(
  secret: string,
  timestamp: string,
  body: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}
export type WebhookEvent = {
  id: string;
  type: string;
  occurredAt: string;
  workspaceId: string;
  subjectId: string;
};
/** Caller supplies only the minimal event; response bodies and endpoint errors are discarded. */
export async function sendWebhook(
  endpoint: string,
  secret: string,
  event: WebhookEvent,
): Promise<number> {
  const url = parseWebhookUrl(endpoint),
    target = await resolveWebhookEndpoint(url),
    body = JSON.stringify(event),
    timestamp = Math.floor(Date.now() / 1000).toString();
  return await new Promise((resolve, reject) => {
    const req = request(
      {
        protocol: "https:",
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: "POST",
        servername: url.hostname,
        family: target.family,
        lookup: (_hostname, _options, callback) =>
          callback(null, target.address, target.family as 4 | 6),
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "x-autosocials-timestamp": timestamp,
          "x-autosocials-signature": `v1=${signWebhook(secret, timestamp, body)}`,
          "x-autosocials-event-id": event.id,
        },
      },
      (res) => {
        clearTimeout(timer);
        const status = res.statusCode ?? 0;
        res.destroy();
        resolve(status);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("timeout")), 10_000);
    req.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Webhook delivery failed"));
    });
    req.end(body);
  });
}
