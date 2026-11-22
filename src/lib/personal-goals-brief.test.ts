import { expect, it, vi } from "vitest";
import { organizeGoalsBrief } from "./personal-goals-brief.server";

const { aiChat } = vi.hoisted(() => ({ aiChat: vi.fn() }));
vi.mock("./dossier.server", () => ({ aiChat }));

it("inserts headings only at paragraph boundaries and preserves the original wording and lists", async () => {
  const brief = "Teach owners a useful check.\n\nMy audience is company owners.\n\n- Explain where the product fits.\n\n~~~\n\nExample code\n~~~";
  aiChat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ sections: [
    { line: 1, heading: "Content goals" }, { line: 3, heading: "Audience and voice" },
    { line: 5, heading: "Invalid list boundary" }, { line: 9, heading: "Invalid code boundary" },
  ] }) } }] });
  const formatted = await organizeGoalsBrief(brief);
  expect(formatted).toBe(`## Content goals\n\n${brief.replace("My audience", "## Audience and voice\n\nMy audience")}`);
  expect(formatted.replace(/^## .+\n\n/gm, "")).toBe(brief);
});

it("preserves sections in an already organized Markdown file", async () => {
  aiChat.mockClear();
  const brief = "## Audience\n\nCompany owners.\n\n## Tone\n\nSpeak directly.";
  expect(await organizeGoalsBrief(brief)).toBe(brief);
  expect(aiChat).not.toHaveBeenCalled();
});
