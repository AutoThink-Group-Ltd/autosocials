import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CreationContextCards } from "./CreationContextCards";
import type { CreationContextMode } from "@/lib/creation-context-mode";
afterEach(cleanup);

function Example({ start }: { start: (mode: CreationContextMode) => void }) {
  const [brief, setBrief] = useState("");
  const [open, setOpen] = useState(false);
  const [useDna, setUseDna] = useState(true);
  return <CreationContextCards brief={brief} onBriefChange={setBrief} ideaOpen={open} onIdeaOpenChange={setOpen} useDna={useDna} onUseDnaChange={setUseDna} onGenerate={start} submitLabel="Draft" />;
}

it("starts from saved context without asking for a brief", () => {
  const start = vi.fn();
  render(<Example start={start} />);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Generate from Goals/ }));
  expect(start).toHaveBeenCalledExactlyOnceWith("goals");
});

it("uses DNA for a new idea by default and lets the user turn it off", () => {
  const start = vi.fn();
  render(<Example start={start} />);
  fireEvent.click(screen.getByRole("button", { name: /New Idea/ }));
  expect(screen.getByRole("button", { name: "Draft" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: /Use saved Goals and DNA/ })).toBeChecked();
  fireEvent.change(screen.getByRole("textbox", { name: "Your idea" }), { target: { value: "An unrelated brand story" } });
  fireEvent.click(screen.getByRole("button", { name: "Draft" }));
  expect(start).toHaveBeenLastCalledWith("idea");
  fireEvent.click(screen.getByRole("checkbox", { name: /Use saved Goals and DNA/ }));
  fireEvent.click(screen.getByRole("button", { name: "Draft" }));
  expect(start).toHaveBeenLastCalledWith("standalone");
});
