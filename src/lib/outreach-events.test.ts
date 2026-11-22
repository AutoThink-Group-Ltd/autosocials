import { createSign, generateKeyPairSync, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { derToRaw } from "../../supabase/functions/outreach-events/signature";

describe("signed delivery events", () => {
  it("accepts a genuine provider signature and rejects altered payloads", async () => {
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const payload = "1700000000[{\"event\":\"delivered\"}]";
    const signer = createSign("SHA256"); signer.update(payload); signer.end();
    const signature = derToRaw(signer.sign(keys.privateKey));
    const publicKey = await webcrypto.subtle.importKey("spki", keys.publicKey.export({ type: "spki", format: "der" }), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const verify = (text: string) => webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature, new TextEncoder().encode(text));
    expect(await verify(payload)).toBe(true);
    expect(await verify(payload + " ")).toBe(false);
  });
  it("rejects malformed signatures", () => expect(() => derToRaw(new Uint8Array([1,2,3]))).toThrow());
});
