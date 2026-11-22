import { z } from "zod";

export const creationContextModeSchema = z.enum(["goals", "idea", "standalone"]);
export type CreationContextMode = z.infer<typeof creationContextModeSchema>;

export function hasCreationBrief(input: { brief: string; context_mode?: CreationContextMode | undefined }) {
  return !input.context_mode || input.context_mode === "goals" || !!input.brief.trim();
}

export const GOALS_DIRECTION = "Choose an original idea that advances the saved Goals. Use relevant Profile DNA and Brand DNA as supporting context. If no Goals are saved, use the most relevant DNA and available evidence to choose a direction.";

export const NEW_IDEA_DIRECTION = "Make the current brief the main creative direction. Use saved Goals and DNA only where they support this specific idea.";
