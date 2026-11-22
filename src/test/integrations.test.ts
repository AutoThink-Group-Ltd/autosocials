import { describe, it, expect } from "vitest";
import { pickKeySource, normaliseVoices, VIDEO_SIZES } from "@/lib/integrations";

describe("ElevenLabs key resolution", () => {
  it("uses the workspace key over the platform key when the workspace chose its own", () => {
    expect(pickKeySource({ useOwnKey: true, hasWorkspaceKey: true, hasPlatformKey: true })).toBe("workspace");
  });
  it("falls back to the platform key by default", () => {
    expect(pickKeySource({ useOwnKey: false, hasWorkspaceKey: true, hasPlatformKey: true })).toBe("platform");
  });
  it("never silently uses the platform key when the workspace chose its own but has none", () => {
    expect(pickKeySource({ useOwnKey: true, hasWorkspaceKey: false, hasPlatformKey: true })).toBeNull();
  });
});

describe("voices", () => {
  it("keeps exactly one brand voice and includes it in allowed", () => {
    const r = normaliseVoices({ id: "a", name: "Sarah" }, [{ id: "b", name: "Roger" }]);
    expect(r.brand?.id).toBe("a");
    expect(r.allowed.map((v) => v.id).sort()).toEqual(["a", "b"]);
  });
});

it("video sizes match the render server", () => {
  expect([...VIDEO_SIZES]).toEqual(["1080x1920", "1920x1080", "1080x1080", "1080x1350", "1000x1000"]);
});

describe("voice source", () => {
  it("built-in voices are spoken by AutoSocials, everything else by ElevenLabs", async () => {
    const { voiceSource, BUILTIN_PREFIX } = await import("@/lib/integrations");
    expect(voiceSource(BUILTIN_PREFIX + "Kore")).toBe("builtin");
    expect(voiceSource("21m00Tcm4TlvDq8ikWAM")).toBe("elevenlabs");
  });
});

describe("Sam's voice choice", () => {
  it("prefers card voice, then starred voice, then Sam's pick, then Kore", async () => {
    const { resolveVoice } = await import("@/lib/integrations");
    expect(resolveVoice("builtin:Puck", { brand_voice_id: "el1" }, "builtin:Orus")).toBe("builtin:Puck");
    expect(resolveVoice(null, { brand_voice_id: "el1" }, "builtin:Orus")).toBe("el1");
    expect(resolveVoice(null, { brand_voice_id: "el1", auto_pick: true }, "builtin:Orus")).toBe("builtin:Orus");
    expect(resolveVoice(null, null, "builtin:Orus")).toBe("builtin:Orus");
    expect(resolveVoice(null, null, null)).toBe("builtin:Kore");
  });
  it("only accepts voices on the free list", async () => {
    const { toBuiltinId, resolveVoice } = await import("@/lib/integrations");
    expect(toBuiltinId("Charon")).toBe("builtin:Charon");
    expect(toBuiltinId("Morgan")).toBeNull();
    expect(resolveVoice(null, null, "Morgan")).toBe("builtin:Kore");
  });
});
