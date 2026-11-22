import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("./PipelineTrash", async () => {
  const React = await import("react");
  const actual = await vi.importActual<typeof import("./PipelineTrash")>("./PipelineTrash");
  return { ...actual, usePipelineTrash: () => { const [ids, setIds] = React.useState<string[]>([]); return { ids, isLoading: false, isError: false, isPending: false, refetch: vi.fn(), setTrashed: async (id: string, trashed: boolean) => setIds(previous => trashed ? [...previous, id] : previous.filter(value => value !== id)) }; } };
});
import { ProductionProgress } from "./ProductionProgress";

const batch = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tileId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const items = [{ title: "Film", format: "video" as const }, { title: "Tile", format: "tiles" as const }, { title: "Post", format: "written" as const }];
describe("production progress", () => {
  it("shows every available preview directly and links to its exact asset", () => {
    render(<ProductionProgress workspaceId="workspace" items={items} results={[{ kind: "video", id: "1", status: "done", previewUrl: "https://example.com/video" }, { kind: "tile", id: "2", status: "ready", previewUrl: "data:image/png;base64,abc" }, { kind: "written", id: "3", status: "ready", text: "A finished post." }]} checking={false} notice="" error={null} onCheck={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByLabelText("Preview Film")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Preview Tile" })).toBeInTheDocument();
    expect(screen.getByText("A finished post.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", {name:"Open this asset"}).map(link => link.getAttribute("href"))).toEqual(["/app/create?stage=ready&item=video%3A1", "/app/create?stage=ready&item=tile%3A2", "/app/create?stage=ready&item=written%3A3"]);
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });
  it("hides an individual production item and points recovery to settings", async () => {
    render(<ProductionProgress workspaceId="workspace" trashScope={{kind:"batch",id:batch}} items={items} results={[{kind:"video",id:"1",status:"queued"},{kind:"tile",id:tileId,status:"ready",previewUrl:"data:image/png;base64,abc"},{kind:"written",id:"3",status:"ready",text:"A post"}]} checking={false} notice="" error={null} onCheck={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", {name:"Delete asset Tile"}));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Settings > Deleted Items/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", {name:"Delete asset"}));
    await waitFor(() => expect(screen.queryByRole("heading", {name:"Tile"})).not.toBeInTheDocument());
    expect(screen.getByRole("heading", {name:"Post"})).toBeInTheDocument();
    expect(screen.queryByRole("button", {name:"View Trash"})).not.toBeInTheDocument();
  });
  it("shows an unverified video and keeps status check and safe retry available", () => {
    const check = vi.fn(), retry = vi.fn();
    render(<ProductionProgress workspaceId="workspace" items={[items[0]!]} results={[{kind:"video",id:"1",status:"reconciliation_required",message:"Export review was unavailable.",previewUrl:"https://example.com/video"}]} checking={false} notice="" error={null} onCheck={check} onRetry={retry} onBack={vi.fn()} />);
    expect(screen.getByLabelText("Preview Film")).toBeInTheDocument();
    expect(screen.getByText("Export review was unavailable.")).toBeInTheDocument();
    expect(screen.queryByRole("link", {name:"Open this asset"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name:"Check production status"})); fireEvent.click(screen.getByRole("button", {name:"Retry work that didn’t start"}));
    expect(check).toHaveBeenCalledOnce(); expect(retry).toHaveBeenCalledOnce();
  });
});
