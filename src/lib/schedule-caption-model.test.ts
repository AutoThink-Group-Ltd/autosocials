import { describe, expect, it, vi } from "vitest";
import { writeScheduleCaptions } from "./schedule-caption-model";

describe("schedule caption model", () => {
  it("requests Astra with high reasoning", async () => {
    const chat = vi.fn().mockResolvedValue({ choices: [] });
    expect((await writeScheduleCaptions(chat, { messages: [] })).fallback).toBe(false);
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-6-astra", reasoning_effort: "high" }));
  });
  it("falls back only when the account cannot access the model", async () => {
    const chat = vi.fn().mockRejectedValueOnce(new Error("AI gateway: 404")).mockResolvedValueOnce({ choices: [] });
    expect((await writeScheduleCaptions(chat, {})).fallback).toBe(true);
    expect(chat).toHaveBeenLastCalledWith({ model: "gpt-5.4-mini" });
    await expect(writeScheduleCaptions(vi.fn().mockRejectedValue(new Error("AI gateway: 500")), {})).rejects.toThrow("500");
  });
});
