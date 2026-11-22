import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ previews: new Map(), previewHook: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/studio.functions", () => ({ getFilePreviews: vi.fn(), listPickableFiles: vi.fn(), respondToConfirm: vi.fn() }));
vi.mock("@/lib/creative.functions", () => ({ startRender: vi.fn() }));
vi.mock("@/features/brand/BrandedVideo", () => ({ BrandedVideo: ({ src, name }: { src: string; name: string }) => <video aria-label={name} src={src} controls /> }));
vi.mock("@/workspace/live-view/blocks/usePreviews", async () => {
  const { createContext, useContext } = await import("react");
  const StudioCtx = createContext({ previews: new Map(), loading: false, open: (_ids: string[], _id: string) => {} });
  return { StudioCtx, useStudio: () => useContext(StudioCtx), usePreviewMap: (ws: string, ids: string[]) => { mocks.previewHook(ws, ids); return { previews: new Map(ids.flatMap((id) => mocks.previews.has(id) ? [[id, mocks.previews.get(id)]] : [])), loading: false }; } };
});
import { AssetLibraryGallery } from "./AssetLibraryGallery";
const files = [{ id: "photo", name: "Actual product.png", kind: "image" }, { id: "video", name: "App demonstration.mp4", kind: "video" }, { id: "audio", name: "Narration.wav", kind: "audio" }, { id: "doc", name: "Brand guidance.md", kind: "doc" }];
beforeEach(() => {
  vi.clearAllMocks(); mocks.previews = new Map(files.map((file) => [file.id, { ...file, label: file.kind, summary: null, folder: null, text: file.kind === "doc" ? "# Brand guidance\nUse verified product claims." : null, url: `https://private.example/${file.id}?signed=token`, thumbnail: file.kind === "video" ? "https://private.example/video-poster?signed=token" : null, playback: null, download: `https://private.example/${file.id}?signed=token` }]));
});
afterEach(cleanup);
describe("owned asset gallery", () => {
  it("shows authenticated thumbnail previews and keeps preview separate from selection", () => {
    const toggle = vi.fn(); render(<AssetLibraryGallery ws="workspace-a" files={files} selectedIds={[]} onToggle={toggle} />);
    expect(screen.getByRole("img", { name: "Actual product.png" })).toHaveAttribute("src", "https://private.example/photo?signed=token");
    fireEvent.click(screen.getByRole("button", { name: /Actual product.png/ }));
    expect(screen.getByRole("dialog", { name: "Actual product.png" })).toBeInTheDocument(); expect(toggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Actual product.png" })); expect(toggle).toHaveBeenCalledWith("photo", true);
  });
  it("reuses fullscreen video/audio playback from signed private URLs and readable documents", () => {
    render(<AssetLibraryGallery ws="workspace-a" files={files} selectedIds={[]} onToggle={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /App demonstration.mp4/ }));
    expect(screen.getByLabelText("App demonstration.mp4", { selector: "video" })).toHaveAttribute("src", "https://private.example/video?signed=token");
    fireEvent.click(screen.getByRole("button", { name: "Next", exact: true }));
    expect(document.querySelector('audio')).toHaveAttribute("src", "https://private.example/audio?signed=token");
    fireEvent.click(screen.getByRole("button", { name: "Next", exact: true }));
    expect(screen.getByRole("dialog", { name: "Brand guidance.md" })).toHaveTextContent("Use verified product claims.");
    fireEvent.keyDown(window, { key: "Escape" }); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps selected assets checked and blocks only new selections at the limit", () => {
    const selectedIds = ["photo", ...Array.from({ length: 19 }, (_, i) => `saved-${i}`)];
    render(<AssetLibraryGallery ws="workspace-a" files={files} selectedIds={selectedIds} onToggle={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Actual product.png" })).toBeChecked(); expect(screen.getByRole("checkbox", { name: "Actual product.png" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "App demonstration.mp4" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /App demonstration.mp4/ })).toBeEnabled();
  });
  it("batches visible previews, supports search/filter, and retains off-page selections", () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ id: `image-${i}`, name: `Photo ${i}.png`, kind: "image" }));
    render(<AssetLibraryGallery ws="workspace-a" files={many} selectedIds={["image-60"]} onToggle={vi.fn()} />);
    expect(mocks.previewHook.mock.calls.at(-1)?.[1]).toHaveLength(24); expect(screen.getAllByRole("checkbox")).toHaveLength(24);
    expect(screen.getByRole("checkbox", { name: "Photo 60.png" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Next asset page" })); expect(mocks.previewHook.mock.calls.at(-1)?.[1][0]).toBe("image-23");
    fireEvent.change(screen.getByRole("combobox", { name: "Filter brand assets" }), { target: { value: "selected" } });
    expect(screen.getByRole("checkbox", { name: "Photo 60.png" })).toBeChecked();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search brand assets" }), { target: { value: "no match" } }); expect(screen.getByText(/No assets match/)).toBeInTheDocument();
  });
});
