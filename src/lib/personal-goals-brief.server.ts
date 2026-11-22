import { z } from "zod";
import prompt from "../../prompts/personal-goals-brief.txt?raw";
import { aiChat } from "./dossier.server";
import { GOALS_BRIEF_LIMIT } from "./personal-brand-goals";

const sectionsSchema = z.object({ sections: z.array(z.object({
  line: z.number().int().positive(),
  heading: z.string().trim().min(1).max(64).regex(/^[\p{L}\p{N}][\p{L}\p{N} ,&/’'—-]*$/u),
})).max(12) });

export async function organizeGoalsBrief(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const candidates: { line: number; excerpt: string }[] = [];
  let fence = "", existingHeadings = 0;
  if (lines[0]?.trim() === "---") return text;
  for (const [index, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = "";
      continue;
    }
    if (fence) continue;
    if (/^ {0,3}#{1,6} +\S/.test(line) || (index > 0 && line.match(/^ {0,3}(?:=+|-{2,})\s*$/) && lines[index - 1]?.trim())) {
      existingHeadings++;
      continue;
    }
    if (/^[\p{L}\p{N}“"(]/u.test(line) && !/^\d+[.)]\s/.test(line) && !lines[index - 1]?.trim() && !/^ {0,3}(?:=+|-{2,})\s*$/.test(lines[index + 1] ?? "")) {
      candidates.push({ line: index + 1, excerpt: line.slice(0, 160) });
    }
  }
  if (existingHeadings > 1 || !candidates.length || (existingHeadings && candidates.length === 1)) return text;
  if (candidates.length === 1) {
    const heading = "## Goals brief\n\n";
    return text.length + heading.length <= GOALS_BRIEF_LIMIT ? heading + text : text;
  }
  const response = await aiChat({ model: "gpt-5.4-mini", reasoning_effort: "low", response_format: { type: "json_object" }, messages: [
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify({ document: text, candidates }) },
  ] });
  const { sections } = sectionsSchema.parse(JSON.parse(response.choices?.[0]?.message?.content ?? ""));
  const permitted = new Set(candidates.map(({ line }) => line));
  const headings = new Map(sections.filter(({ line }) => permitted.has(line)).map(({ line, heading }) => [line, heading]));
  if (!headings.size) return text;
  const result = lines.map((line, index) => {
    const heading = headings.get(index + 1);
    return heading ? `## ${heading}\n\n${line}` : line;
  }).join("\n");
  return result.length <= GOALS_BRIEF_LIMIT ? result : text;
}
