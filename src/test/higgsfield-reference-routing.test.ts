import { describe, expect, it } from "vitest";
import { bindHiggsfieldReferences, type ResolvedProductionReference } from "../lib/production.server";
import type { CreativeCapability, CreativeControl } from "../lib/creative-providers/registry";

const media = (id: string, kind: string, role = "reference"): ResolvedProductionReference => ({ id, source: "file", kind, role, url: `https://cdn.example.com/${id}`, description: id });
const control = (key: string, required = false): CreativeControl => ({ key, label: key, type: key.endsWith("urls") ? "array" : "url", required });
const capability = (controls: CreativeControl[], assetRoles?: Record<string, string>): Pick<CreativeCapability, "provider" | "controls" | "assetRoles"> => ({ provider: "higgsfield", controls, ...(assetRoles ? { assetRoles } : {}) });

describe("catalogued Higgsfield reference binding", () => {
  it("binds declared motion and identity inputs without mixing their roles", () => {
    const route = capability([control("image_url", true), control("video_url", true)], { image_url: "identity", video_url: "motion" });
    expect(bindHiggsfieldReferences(route, { prompt: "Follow the supplied movement" }, [media("person.jpg", "image", "identity"), media("movement.mp4", "video", "motion")])).toEqual({ prompt: "Follow the supplied movement", image_url: "https://cdn.example.com/person.jpg", video_url: "https://cdn.example.com/movement.mp4" });
  });
  it("uses explicit frame roles and does not guess an optional ending frame", () => {
    const route = capability([control("image_url", true), control("end_image_url")]);
    expect(bindHiggsfieldReferences(route, {}, [media("start.jpg", "image", "first_frame"), media("style.jpg", "image", "style")])).toEqual({ image_url: "https://cdn.example.com/start.jpg" });
    expect(bindHiggsfieldReferences(route, {}, [media("start.jpg", "image", "first_frame"), media("end.jpg", "image", "last_frame")])).toMatchObject({ end_image_url: "https://cdn.example.com/end.jpg" });
  });
  it("allows a single unlabelled matching source but rejects an ambiguous choice", () => {
    const route = capability([control("image_url", true)]);
    expect(bindHiggsfieldReferences(route, {}, [media("only.jpg", "image")])).toEqual({ image_url: "https://cdn.example.com/only.jpg" });
    expect(() => bindHiggsfieldReferences(route, {}, [media("a.jpg", "image"), media("b.jpg", "image")])).toThrow("Choose one authorised first frame");
    expect(bindHiggsfieldReferences(capability([control("image_url"), control("image_urls")]), {}, [media("a.jpg", "image"), media("b.jpg", "image")])).toEqual({ image_urls: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"] });
  });
  it("rejects missing or explicitly conflicting source roles", () => {
    const route = capability([control("video_url", true)], { video_url: "motion" });
    expect(() => bindHiggsfieldReferences(route, {}, [media("source.mp4", "video", "source_footage")])).toThrow("authorised motion video reference");
    expect(() => bindHiggsfieldReferences(route, {}, [])).toThrow("authorised motion video reference");
  });
  it("binds plural references in order and avoids duplicating a source in its reference array", () => {
    const route = capability([control("video_urls"), control("image_urls"), control("audio_urls"), control("video_url", true)]);
    const refs = [media("source.mp4", "video", "source_footage"), media("inspiration.mp4", "video"), media("room.jpg", "image"), media("room.jpg", "image", "style"), media("music.mp3", "audio", "audio")];
    expect(bindHiggsfieldReferences(route, {}, refs)).toEqual({ video_url: "https://cdn.example.com/source.mp4", video_urls: ["https://cdn.example.com/inspiration.mp4"], image_urls: ["https://cdn.example.com/room.jpg"], audio_urls: ["https://cdn.example.com/music.mp3"] });
  });
  it("only binds fields present in the model contract and rejects direct media settings", () => {
    const route = capability([control("image_url", true)]);
    expect(bindHiggsfieldReferences(route, {}, [media("image.jpg", "image"), media("music.mp3", "audio")])).not.toHaveProperty("audio_url");
    expect(() => bindHiggsfieldReferences(route, { image_url: "https://other.example.com/image.jpg" }, [media("image.jpg", "image")])).toThrow("authorised reference IDs");
    expect(() => bindHiggsfieldReferences(capability([control("unknown_media_url", true)]), {}, [])).toThrow("dedicated authorised reference binding");
  });
});
