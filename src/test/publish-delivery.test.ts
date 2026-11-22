import { describe, expect, it } from "vitest";
import { aggregateDeliveryStatus, providerError, safeDeliveryError, validateMetaDelivery } from "../../supabase/functions/publish-scheduled-posts/delivery";

describe("destination delivery outcomes", () => {
  it("keeps partial success distinct from full publication", () => {
    expect(aggregateDeliveryStatus(["published", "failed"])).toBe("partially_published");
    expect(aggregateDeliveryStatus(["published", "published"])).toBe("published");
    expect(aggregateDeliveryStatus(["published", "retrying"])).toBe("scheduled");
    expect(aggregateDeliveryStatus(["failed"])).toBe("needs_attention");
  });
  it("does not describe in-flight work as published", () => {
    expect(aggregateDeliveryStatus(["published", "publishing"])).toBe("publishing");
  });
  it("distinguishes definitive rate-limit rejection from uncertain server errors", () => {
    expect(providerError(new Response(null, { status: 429 }), { error: { code: 4 } }, "Meta")).toMatchObject({ retryable: true, definitive: true });
    expect(providerError(new Response(null, { status: 503 }), {}, "Meta")).toMatchObject({ definitive: false });
    expect(providerError(new Response(null, { status: 400 }), { error: { code: 190 } }, "Meta")).toMatchObject({ retryable: false, definitive: true });
  });
  it("redacts credentials from error output", () => {
    const error = safeDeliveryError(new Error("GET ?access_token=secret&fields=id Bearer private"));
    expect(error).not.toContain("secret");
    expect(error).not.toContain("private");
  });
  it("blocks incompatible Instagram assets and preserves valid horizontal Facebook videos", () => {
    expect(() => validateMetaDelivery("instagram", "x".repeat(2201), [{kind:"image"}])).toThrow("2,200");
    expect(() => validateMetaDelivery("instagram", "", [])).toThrow("requires");
    expect(() => validateMetaDelivery("instagram", "", [{kind:"image",mime:"image/png"}])).toThrow("JPEG");
    expect(() => validateMetaDelivery("facebook", "Approved wording", [{kind:"video",width:1920,height:1080}])).not.toThrow();
  });
});
