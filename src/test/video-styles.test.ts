import { describe, expect, it } from "vitest";
import { listCreativeCapabilities } from "../lib/creative-providers/registry";
import { VIDEO_STYLES, listVideoStyles, readVideoStyle, selectVideoStyle, selectedVideoStyleForNarrative, styleEngineLabel, videoStyleForNarrative } from "../lib/video-styles";
import { buildNarrativeLibrary } from "../lib/narrative-library";

describe("video style intent", () => {
  it("names every supported production API without advertising the unavailable presenter", () => {
    expect(VIDEO_STYLES.map((style) => style.capability_id).sort()).toEqual(listCreativeCapabilities().filter((capability) => capability.status === "supported").map((capability) => capability.id).sort());
    expect(new Set(VIDEO_STYLES.map((style) => style.name)).size).toBe(VIDEO_STYLES.length);
    expect(listVideoStyles(new Set(["golpo-canvas"])).find((style) => style.id === "illustrated-explainer")).toMatchObject({ availability: "configured_unverified" });
    expect(listVideoStyles(new Set()).every((style) => style.availability === "unavailable")).toBe(true);
  });
  it("retains actual engine identity and validates the selected style against the route", () => {
    const route = { steps: [{ capability_id: "higgsfield-seedance-text-video", role: "scene" }] };
    const style = selectVideoStyle("cinematic-scene", route, new Set(["higgsfield-seedance-text-video"]));
    expect(style.engine_ids).toEqual(["higgsfield-seedance-text-video"]);
    expect(styleEngineLabel(style)).toContain("Seedance 2.0");
    expect(() => selectVideoStyle("drawn-explainer", route, new Set())).toThrow(/does not match/);
    expect(readVideoStyle({ ...style, name: "Invented name", engine_labels: ["Invented engine"] })).toMatchObject({ name: "Cinematic Scene", engine_labels: style.engine_labels });
  });
  it("leaves unknown ideas undecided and distinguishes inferred legacy routes", () => {
    expect(videoStyleForNarrative({})).toBeNull();
    expect(styleEngineLabel(null)).toBe("Engine selected during planning");
    expect(videoStyleForNarrative({ production: { steps: [] } })).toMatchObject({ name: "Branded Motion", availability: "legacy_inferred" });
    expect(videoStyleForNarrative({ production: { steps: [{ capability_id: "invented-engine" }] } })).toBeNull();
  });
  it("keeps inferred styles advisory while preserving an explicit saved selection", () => {
    const legacy = { production: { steps: [] } };
    const inferred = videoStyleForNarrative(legacy)!;
    expect(selectedVideoStyleForNarrative(legacy)).toBeNull();
    expect(selectedVideoStyleForNarrative({ video_style: inferred })).toBeNull();
    const explicit = selectVideoStyle("brand-motion", { steps: [] }, new Set(["autotoast-hyperframes"]));
    expect(selectedVideoStyleForNarrative({ video_style: explicit })).toEqual(explicit);
    expect(selectedVideoStyleForNarrative({ production: { video_style: explicit } })).toEqual(explicit);
  });
  it("carries Sam's style and expected engine into the narrative library", () => {
    const video_style = selectVideoStyle("drawn-explainer", { steps: [{ capability_id: "golpo-sketch", role: "finished_video" }] }, new Set(["golpo-sketch"]));
    const narrative = { id: "idea", title: "Why it works", message: "Explain the process", why: "Brand evidence", selected: false, video_style };
    const library = buildNarrativeLibrary([{ id: "batch", goal: "", created_at: "2026-11-02T00:00:00Z", narratives: [narrative] }], []);
    expect(library[0]!.video_style).toEqual(video_style);
  });
});
