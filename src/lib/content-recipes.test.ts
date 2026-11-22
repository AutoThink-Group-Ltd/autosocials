import { describe, expect, it } from "vitest";
import { CONTENT_RECIPES, agentAssetBrief, creationRequirements, recommendContentRecipe } from "./content-recipes";
describe("finished content recipes", () => {
  it("reuses Sam's chosen route and falls back to a connected treatment", () => {
    expect(recommendContentRecipe("A feature walkthrough").id).toBe("reaction-demo");
    expect(recommendContentRecipe("A bold Since 2002 headline").id).toBe("branded-motion");
    expect(recommendContentRecipe("A brand story", "illustrated-explainer").id).toBe("illustrated-explainer");
    expect(recommendContentRecipe("A cinematic film", undefined, (style) => style === "brand-motion").id).toBe("branded-motion");
    expect(recommendContentRecipe("A cinematic film", "cinematic-scene")?.id).toBe("branded-motion");
    expect(recommendContentRecipe("A cinematic film", undefined, () => false)).toBeUndefined();
  });
  it("curates four distinct production routes without exposing the raw catalogue", () => {
    expect(CONTENT_RECIPES.map((r) => r.id)).toEqual(["branded-motion", "illustrated-explainer", "cinematic-ad", "reaction-demo"]);
    expect(new Set(CONTENT_RECIPES.map((r) => r.styleId)).size).toBe(4);
  });
  it("requires real demonstration assets for reaction ads", () => {
    expect(creationRequirements("reaction-demo", [], [], "Show my app")).toHaveLength(1);
    expect(creationRequirements("reaction-demo", [{ id: "demo", name: "Feature recording", kind: "video" }], ["demo"], "Show my app")).toEqual([]);
    expect(creationRequirements("reaction-demo", [{ id: "screen", name: "Dashboard screenshot", kind: "image" }], ["screen"], "Show my app")).toHaveLength(1);
    expect(creationRequirements("reaction-demo", [{ id: "packshot", name: "Product bottle", kind: "image" }], ["packshot"], "Show a real demo")).toHaveLength(1);
  });
  it("does not count unselected assets, stock or logos as factual proof", () => {
    const files = [{ id: "actual", name: "Product", kind: "image" }, { id: "stock", name: "Stock", kind: "image", source: "shutterstock" }, { id: "logo", name: "Brand logo", kind: "logo" }];
    expect(creationRequirements("cinematic-ad", files, ["stock", "logo"], "Show this property")).toHaveLength(1);
    expect(creationRequirements("cinematic-ad", files, ["actual"], "Show this property")).toEqual([]);
  });
  it("allows graphics and illustrated explanation without demanding fictitious media", () => {
    expect(creationRequirements("branded-motion", [], [], "Product benefit")).toEqual([]);
    expect(creationRequirements("illustrated-explainer", [], [], "Explain the app")).toEqual([]);
  });
  it("creates business-specific agent instructions without asking for secrets", () => {
    const property = agentAssetBrief({ business: "Property Co", idea: "A real home tour", recipeId: "cinematic-ad", needs: ["Original photos of this property"] });
    expect(property).toContain("Original photos of this property"); expect(property).toContain("/images"); expect(property).not.toContain("/screenshots");
    const demo = agentAssetBrief({ business: "SaaS Co", idea: "Show the booking flow", recipeId: "reaction-demo", needs: ["Booking workflow"] });
    expect(demo).toContain("/screenshots"); expect(demo).toContain("/recordings"); expect(demo).toContain("exclude customer records, passwords"); expect(demo).toContain("/manifest.json");
  });
});
