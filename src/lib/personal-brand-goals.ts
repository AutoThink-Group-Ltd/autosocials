import { z } from "zod";

export const PERSONAL_GOALS_TITLE = "Personal brand goals (user supplied)";
export const GOALS_BRIEF_LIMIT = 12_000;
export const guidedGoalsSchema = z.object({
  knownFor: z.string().trim().max(1000),
  audience: z.string().trim().max(1000),
  goal: z.string().trim().max(1000),
});
export const goalsBriefSchema = z.string().trim().max(GOALS_BRIEF_LIMIT).refine((text) => !text.includes("\0"), "Use plain text or Markdown.");
const personalGoalsSchema = guidedGoalsSchema.extend({ brief: goalsBriefSchema.default("") });
export type GuidedGoals = z.infer<typeof guidedGoalsSchema>;
export type PersonalGoalsUpdate = GuidedGoals | { brief: string };
export const emptyPersonalGoals = { knownFor: "", audience: "", goal: "", brief: "" };

export function parsePersonalGoals(content?: string | null) {
  try { return personalGoalsSchema.parse(JSON.parse(content ?? "")); }
  catch { return emptyPersonalGoals; }
}

export function hasPersonalGoals(goals: typeof emptyPersonalGoals) {
  return Object.values(goals).some(Boolean);
}
