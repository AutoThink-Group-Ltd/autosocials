import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleDialogHost, useScheduleDialog } from "./ScheduleDialogHost";
import { readScheduleDraft, writeScheduleDraft } from "./scheduleDraft";
const state = vi.hoisted(() => ({ user: "user", workspace: "workspace" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: state.user } }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ currentWorkspace: { id: state.workspace } }) }));
vi.mock("./WorkspaceCreationScheduleDialog", () => ({ WorkspaceCreationScheduleDialog: ({ mode, command, onModeChange }: { mode: string; command: {keys:string[]} | null; onModeChange: (value:"pane"|"dialog") => void }) => <div role="region" aria-label="Schedule">{mode}:{command?.keys.join(",")}<button onClick={() => onModeChange(mode === "pane" ? "dialog" : "pane")}>Switch display</button></div> }));
function Page({ name }: { name: string }) {
  const { openSchedule, addToSchedule, scheduleSelection, openSchedulePane } = useScheduleDialog();
  return <>
    <button onClick={() => openSchedule(["tile"])}>{name}</button>
    <button onClick={() => addToSchedule({ videoIds: ["video-1"] })}>Add video</button>
    <button onClick={() => scheduleSelection({ carouselIds: ["deck"], videoIds: ["video-2"] })}>Schedule selected posts</button>
    <button onClick={openSchedulePane}>Browse schedule</button>
  </>;
}
describe("shared schedule host", () => {
  beforeEach(() => { for (const name of ["localStorage", "sessionStorage"]) { const values = new Map<string, string>(); Object.defineProperty(window, name, { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } }); } state.user = "user"; state.workspace = "workspace"; });
  it("keeps the scheduler open through navigation and isolates another workspace", () => {
    const { rerender } = render(<ScheduleDialogHost><Page name="Home" /></ScheduleDialogHost>);
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(screen.getByRole("region", { name: "Schedule" })).toHaveTextContent("dialog:tile:tile");
    rerender(<ScheduleDialogHost><Page name="Publish" /></ScheduleDialogHost>);
    expect(screen.getByRole("region", { name: "Schedule" })).toBeInTheDocument();
    state.workspace = "other"; rerender(<ScheduleDialogHost><Page name="Other" /></ScheduleDialogHost>);
    expect(screen.queryByRole("region", { name: "Schedule" })).not.toBeInTheDocument();
  });
  it("opens the live pane from an add action and switches presentation", () => {
    render(<ScheduleDialogHost><Page name="Home" /></ScheduleDialogHost>);
    fireEvent.click(screen.getByRole("button", {name:"Add video"}));
    expect(screen.getByRole("region", {name:"Schedule"})).toHaveTextContent("pane:video:video-1");
    fireEvent.click(screen.getByRole("button", {name:"Switch display"}));
    expect(screen.getByRole("region", {name:"Schedule"})).toHaveTextContent("dialog:video:video-1");
  });
  it("opens exactly the selected posts in a separate draft and preserves the browsing basket", () => {
    const draft = { selected: ["tile:older"], destinations: [], day: "2030-12-01", clock: "09:00", startNow: false, items: null, assumptions: "", uncertain: false, requestId: "request", pendingRequest: null };
    writeScheduleDraft("user", "workspace", draft);
    render(<ScheduleDialogHost><Page name="Home" /></ScheduleDialogHost>);
    fireEvent.click(screen.getByRole("button", { name: "Schedule selected posts" }));
    expect(screen.getByRole("region", { name: "Schedule" })).toHaveTextContent("pane:video:video-2,carousel:deck");
    expect(sessionStorage.getItem("as:schedule-open:v1:user:workspace")).toBe("pane|workspace:selection:carousel:deck,video:video-2");
    expect(readScheduleDraft("user", "workspace")?.selected).toEqual(["tile:older"]);
    fireEvent.click(screen.getByRole("button", { name: "Browse schedule" }));
    expect(screen.getByRole("region", { name: "Schedule" })).toHaveTextContent("pane:");
    expect(screen.getByRole("region", { name: "Schedule" })).not.toHaveTextContent("carousel:deck");
    expect(readScheduleDraft("user", "workspace")?.selected).toEqual(["tile:older"]);
  });

  it("reopens a saved dialog after a reload in the same tab", async () => {
    expect(writeScheduleDraft("user", "workspace", { selected: [], destinations: [], day: "2026-11-20", clock: "09:00", startNow: false, items: null, assumptions: "", uncertain: false, requestId: "request", pendingRequest: null })).toBe(true);
    window.sessionStorage.setItem("as:schedule-open:v1:user:workspace", "1");
    render(<ScheduleDialogHost><Page name="Home" /></ScheduleDialogHost>);
    expect(await screen.findByRole("region", {name:"Schedule"})).toHaveTextContent("dialog:");
  });
});
