import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CREATIVE_DIRECTION_SCHEMA, parseCreativeDirection, directionDiversityProblems, scopedCreativeHistory, type CreativeDirection } from "@/lib/creative-direction";
import { checkBuildPrompt, type BuildPrompt } from "@/lib/build-prompt";

const direction: CreativeDirection = {
  audience: "Independent consultants", objective: "Start a trial", insight: "Forgotten follow-ups damage confidence",
  argument: "Automate manual work and save hours", hook: "Your follow-up vanished again",
  story_mechanism: "Before after comparison demonstration", composition: "Split screen dashboard comparison",
  typography: "Restrained headline hierarchy", motion: "Cursor reveal then zoom",
  imagery: "Real interface screenshots", sound: "Calm narration", pacing: "Quick setup then slow proof",
  ending: "Logo end card pill CTA", evidence: "Approved workflow", asset_strategy: "Authorised screenshots only",
};
describe("creative direction", () => {
  it("requires all meaningful direction axes", () => {
    expect(parseCreativeDirection(direction)).toEqual(direction);
    expect(parseCreativeDirection({ ...direction, evidence: " " })).toBeNull();
    expect(CREATIVE_DIRECTION_SCHEMA.required).toContain("story_mechanism");
  });
  it("catches paraphrased hooks and structural repetition despite new copy", () => {
    const a = { hook: direction.hook, direction };
    const b = { hook: "No more chasing people", direction: { ...direction, hook: "No more chasing people", argument: "Save minutes with automated busywork", typography: "New typeface" } };
    expect(directionDiversityProblems([a, b]).join(" ")).toMatch(/creative mechanism/);
    expect(directionDiversityProblems([a, { ...a, direction: { ...direction, hook: "Again your follow-up vanished" } }]).join(" ")).toMatch(/repeats the hook/);
  });
  it("allows genuinely different mechanisms with a shared commercial CTA", () => {
    const other = { ...direction, argument: "Know who needs a response", hook: "A customer waiting at the window", story_mechanism: "Human observational miniature", composition: "Single full bleed portrait", motion: "Static patient hold", imagery: "Owned live action actor footage", pacing: "Unhurried continuous take", ending: "Spoken invitation over continuing activity" };
    expect(directionDiversityProblems([{ hook: direction.hook, cta: "Try it", direction }, { hook: other.hook, cta: "Try it", direction: other }])).toEqual([]);
  });
  it("scopes history before limiting and checks a single new concept", () => {
    const history = [{ workspace_id: "other", hook: direction.hook, direction }, { workspace_id: "ours", brand_profile_id: "b", hook: direction.hook, direction }];
    const scoped = scopedCreativeHistory(history, { workspaceId: "ours", brandProfileId: "b" });
    expect(scoped).toHaveLength(1);
    expect(directionDiversityProblems([{ hook: direction.hook, direction }], scoped).join()).toMatch(/recent asset/);
    expect(scopedCreativeHistory(history, { workspaceId: "ours", brandProfileId: "different" })).toEqual([]);
  });
});

describe("adaptive production prompt safeguards", () => {
  it("feeds sourced principles into actual build and composition prompts without Ghosts anchoring", () => {
    const planner = readFileSync("src/lib/playbook.server.ts", "utf8");
    const designer = readFileSync("src/lib/composition.server.ts", "utf8");
    const rules = readFileSync("prompts/playbook/house-rules.md", "utf8");
    expect(planner).toContain("creativePrinciples}");
    expect(planner).not.toContain("exGhosts");
    expect(designer).toContain("CREATIVE_PLAYBOOK}");
    expect(rules).toContain("technical pass is not creative approval");
    expect(rules).toContain("identified as illustrative");
    expect(planner).not.toContain("never labelled as examples");
  });
  it("permits a purposeful continuous scene while preserving invalid timing rejection", () => {
    const prompt: BuildPrompt = { different: "Continuous observation", opening_visual: "Actual chef plating", dont_open_on: ["A dashboard"], story: "A dish prepared", feel: "Calm", sample_data: [], scenes: [{ name: "Preparation", start: 0, end: 15, on_screen: [], action: "Chef plates", files: [], sound: "Kitchen" }], vo: [], trust_beat: "Actual dish footage", sfx: [], music: "", guardrails: [], checklist: [], review_times: [0, 7, 14] };
    expect(checkBuildPrompt(prompt, { duration: 15 })).toEqual([]);
    expect(checkBuildPrompt({ ...prompt, scenes: [{ ...prompt.scenes[0]!, start: 16 }] }, { duration: 15 }).join()).toMatch(/Invalid timing/);
  });
});
