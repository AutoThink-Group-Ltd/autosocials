import { describe, expect, it } from "vitest";
import { directVideoOptions, parseDirectVideoBrief } from "../lib/direct-video";
import { getCreativeCapability, listCreativeCapabilities } from "../lib/creative-providers/registry";
const available = new Set(["higgsfield-seedance-reference-video", "higgsfield-wan-reference-video"]);
describe("direct reference video", () => {
  it("maps the Canada Water acceptance brief without treating eight as the upload count", () => {
    const production = "Create a polished, photorealistic 30-second film for Living in London celebrating Canada Water and Rotherhithe. Use the uploaded photographs as strict visual references. Preserve the actual buildings, skyline, dock, boardwalk, landscaping and office shown. Do not invent property interiors, features or views.\n\nOpen with a gentle glide along the curved red boardwalk, then reveal the elevated London skyline. Move to the riverside promenade with its anchor, followed by the calm dock and waterfront buildings. Transition to the landscaped residential courtyard and homes beside the pond. Finish inside the Living in London office, slowly approaching the reception desk and holding on a clean closing frame.\n\nUse elegant editorial cuts between distinct locations, not morphing transitions. Natural daylight, realistic water movement, subtle foliage, stable architecture and smooth camera motion. The result should feel premium, contemporary and welcoming, like a professionally produced London estate agency film. No presenter, invented people, distorted buildings, flicker, added text or generated logos. Preserve the office’s existing signage.";
    const voice = "From waterside living to a connected London neighbourhood, discover Canada Water and Rotherhithe. Local knowledge, personal service and a place to call home. Living in London: more than an estate agent.";
    const message = `I’ve checked all eight. For this pack, upload all eight images into **Kling 4.0 Reference-to-Video**, select **30 seconds, 9:16, 1080p**, and paste:\n“${production}”\n**Voiceover:** “${voice}”\nAdd the logo and voiceover in editing. If the one-pass result mixes locations or distorts buildings, animate the photos separately and assemble them into a 30-second film.`;
    const brief = parseDirectVideoBrief(message);
    expect(brief.prompt).toBe(production);
    expect(brief.voiceover).toBe(voice);
    const result = directVideoOptions(brief, 10, available);
    expect(result.missing).toEqual([]);
    expect(result.matchedCapabilityId).toBeNull();
    expect(result.options.some((option) => option.capabilityId === "higgsfield-wan-reference-video")).toBe(true);
  });
  it("preserves the actual production quote and keeps voiceover for editing", () => {
    const brief = parseDirectVideoBrief('I checked eight. Use Kling 4.0 Reference-to-Video, 30 seconds, 9:16, 1080p. “Create a film. Preserve actual buildings.” Voiceover: “Living in London.” Add the logo and voiceover in editing.');
    expect(brief).toMatchObject({ prompt: "Create a film. Preserve actual buildings.", voiceover: "Living in London.", duration: 30, aspectRatio: "9:16", resolution: "1080p", requestedModel: "Kling 4.0" });
    const result = directVideoOptions(brief, 10, available);
    expect(result.matchedCapabilityId).toBeNull();
    expect(result.reason).toContain("not an exact compatible");
    expect(result.options.map((o) => o.capabilityId)).toContain("higgsfield-seedance-reference-video");
    expect(result.options.every((o) => !Object.keys(o.settings).some((key) => /url/.test(key)))).toBe(true);
  });
  it("uses the real image count and rejects over-limit routes", () => {
    const brief = parseDirectVideoBrief("Create a film using 30 seconds, 9:16, 1080p");
    expect(directVideoOptions(brief, 11, available).options.map((o) => o.capabilityId)).not.toContain("higgsfield-wan-reference-video");
    expect(directVideoOptions(brief, 21, available).options).toEqual([]);
  });
  it("offers provisional settings without auto-starting an incomplete request", () => {
    const result = directVideoOptions(parseDirectVideoBrief("Animate these photographs"), 10, available);
    expect(result.missing).toEqual(["duration", "aspect ratio", "resolution"]);
    expect(result.options.length).toBeGreaterThan(0);
    expect(result.matchedCapabilityId).toBeNull();
    expect(directVideoOptions(parseDirectVideoBrief("30 seconds, 9:16, 1080p"), 10, new Set()).options).toEqual([]);
  });
  it("matches an exact Seedance family and deduplicates registered endpoints", () => {
    const connected = new Set(listCreativeCapabilities().filter((capability) => capability.provider === "higgsfield").map((capability) => capability.id));
    const result = directVideoOptions(parseDirectVideoBrief("Create a 30-second film using Seedance 2.5, 9:16, 1080p."), 10, connected);
    expect(result.matchedCapabilityId).toBe("higgsfield-seedance-reference-video");
    const endpoints = result.options.map((option) => getCreativeCapability(option.capabilityId).endpoint);
    expect(new Set(endpoints).size).toBe(endpoints.length);
    expect(directVideoOptions(parseDirectVideoBrief("Create a 30-second film, 4:5, 1080p"), 10, connected).options).toEqual([]);
  });
  it("rejects lengths the deployed film storage constraint cannot save", () => {
    for (const duration of [5, 60]) {
      const result = directVideoOptions(parseDirectVideoBrief(`Create a ${duration}-second film using Seedance 2.5, 9:16, 1080p.`), 10, available);
      expect(result.options).toEqual([]);
      expect(result.matchedCapabilityId).toBeNull();
      expect(result.reason).toContain("Choose 15 or 30 seconds");
    }
  });
});
