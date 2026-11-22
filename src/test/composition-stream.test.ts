import { describe, it, expect, vi, beforeEach } from "vitest";
const mocked = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/openai-quota.server", () => ({ fetchOpenAI: mocked.fetch }));
import { approvedCopyProblems, streamResponses } from "@/lib/composition.server";

beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "mock-only-key"); vi.clearAllMocks(); });
const events = (...values: object[]) => new Response(values.map(value => `data: ${JSON.stringify(value)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
describe("composition provider completion", () => {
  it("requires a successful terminal event before using generated text", async () => {
    mocked.fetch.mockResolvedValue(events({ type: "response.output_text.done", text: '{"html":"draft"}' }, { type: "response.completed" }));
    expect(await streamResponses([])).toBe('{"html":"draft"}');
    mocked.fetch.mockResolvedValue(events({ type: "response.output_text.done", text: '{"html":"partial"}' }));
    await expect(streamResponses([])).rejects.toThrow("without confirmed completion");
  });
  it("throws a sanitized failure even after receiving text", async () => {
    mocked.fetch.mockResolvedValue(events({ type: "response.output_text.delta", delta: "partial" }, { type: "response.failed", response: { error: { message: "Sensitive provider text" } } }));
    await expect(streamResponses([])).rejects.toThrow("Design failed before the provider confirmed completion.");
  });
});


it("checks the same explicit copy shown in the storyboard before rendering", () => {
  const storyboard = "### Scene 1: Opening (0s to 4s)\n- On screen: **Sales & support.**\n- Show a product shot.";
  expect(approvedCopyProblems("<p>Sales &amp; support.</p>", storyboard)).toEqual([]);
  expect(approvedCopyProblems("<p>Sales and support</p><script>const line = 'Sales & support.';</script>", storyboard)).toEqual([
    "Scene 1 is missing its approved on-screen copy: Sales & support.",
  ]);
});
