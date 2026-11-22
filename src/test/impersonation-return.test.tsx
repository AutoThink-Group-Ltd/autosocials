import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ impersonation: null as unknown, returnToSelf: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/impersonation.functions", () => ({ listSwitchableUsers: vi.fn(), startImpersonation: vi.fn(), endImpersonation: vi.fn() }));
vi.mock("@/features/admin/impersonation", () => ({ readImpersonation: () => state.impersonation, returnToSelf: state.returnToSelf }));
import { ImpersonationBar } from "@/features/admin/UserSwitcher";
afterEach(() => { cleanup(); vi.clearAllMocks(); state.impersonation = null; });
describe("admin session return", () => {
  it("does not offer session restoration to an ordinary user", () => {
    render(<ImpersonationBar />);
    expect(screen.queryByRole("button", { name: "Back to Admin" })).toBeNull();
  });
  it("offers restoration from an impersonated account and invokes the existing session restore", () => {
    state.impersonation = { targetName: "Agency owner", eventId: "event" };
    render(<ImpersonationBar />);
    fireEvent.click(screen.getByRole("button", { name: "Back to Admin" }));
    expect(state.returnToSelf).toHaveBeenCalledOnce();
  });
});
