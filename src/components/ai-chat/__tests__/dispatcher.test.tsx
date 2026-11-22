import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useActionDispatcher } from "../actions/useActionDispatcher";
import { BlockRenderer } from "../BlockRenderer";
import { parseRichResponse } from "../types";

function Harness({
  onSafe,
  onSend,
}: {
  onSafe: () => void;
  onSend: () => void;
}) {
  const { onAction, ConfirmDialog, register } = useActionDispatcher({ disablePersistence: true });
  register("lists.save", { label: "Save list", handler: () => onSafe() });
  register("outreach.send", {
    label: "Send DMs",
    requiresConfirmation: true,
    handler: () => onSend(),
  });

  const r = parseRichResponse({
    v: 1,
    blocks: [
      {
        type: "actions",
        actions: [
          { label: "Save", action: "lists.save", variant: "primary", requiresConfirmation: false },
          { label: "Send", action: "outreach.send", variant: "destructive", requiresConfirmation: true },
        ],
      },
    ],
  });
  if (!r.ok) throw new Error("fixture invalid");

  return (
    <>
      <BlockRenderer response={r.response} onAction={onAction} />
      <ConfirmDialog />
    </>
  );
}

describe("useActionDispatcher", () => {
  it("runs safe actions immediately without confirmation", () => {
    const safe = vi.fn();
    const send = vi.fn();
    render(<Harness onSafe={safe} onSend={send} />);
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(safe).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("requires confirmation for flagged actions and runs only after confirm", async () => {
    const safe = vi.fn();
    const send = vi.fn();
    render(<Harness onSafe={safe} onSend={send} />);
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));
    expect(send).not.toHaveBeenCalled();
    // Dialog title appears
    expect(await screen.findByText(/Confirm: Send DMs/i)).toBeDefined();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Yes, do it/i }));
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not run handler when user cancels", async () => {
    const safe = vi.fn();
    const send = vi.fn();
    render(<Harness onSafe={safe} onSend={send} />);
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("notifies when no handler is registered", () => {
    const notify = vi.fn();
    function Local() {
      const { onAction, ConfirmDialog } = useActionDispatcher({ notify, disablePersistence: true });
      const r = parseRichResponse({
        v: 1,
        blocks: [{ type: "actions", actions: [{ label: "X", action: "missing.handler", variant: "primary", requiresConfirmation: false }] }],
      });
      if (!r.ok) throw new Error("fixture");
      return (<><BlockRenderer response={r.response} onAction={onAction} /><ConfirmDialog /></>);
    }
    render(<Local />);
    fireEvent.click(screen.getByRole("button", { name: /X/i }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ tone: "error" }));
  });
});