import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), recommend: vi.fn(), upload: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/asset-creation.functions", () => ({ getAssetCreation: mocks.get, saveAssetCreation: mocks.save, recommendAssetCreation: mocks.recommend }));
vi.mock("@/workspace/uploads/uploadStore", () => ({ startUpload: mocks.upload }));
vi.mock("./AssetSourceOptions", () => ({ AssetSourceOptions: () => null }));
vi.mock("./AssetLibraryGallery", () => ({ AssetLibraryGallery: ({ files, selectedIds, onToggle }: { files: Array<{ id: string; name: string }>; selectedIds: string[]; onToggle: (id: string, selected: boolean) => void }) => <div>{files.map((file) => <input type="checkbox" key={file.id} aria-label={file.name} checked={selectedIds.includes(file.id)} onChange={(event) => onToggle(file.id, event.target.checked)} />)}</div> }));
import { AssetRequirements } from "./AssetRequirements";
const image = "33333333-3333-4333-8333-333333333333";
const ready = { version: 1, recipe_id: "reaction-demo", style_id: "reference-story", file_ids: [image], status: "ready_to_create", deferred: false, missing_inputs: [], updated_at: "2026-11-05T00:00:00Z" };
function mount() {
  const onReady = vi.fn(), onLater = vi.fn(); const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><AssetRequirements ws="11111111-1111-4111-8111-111111111111" batchId="22222222-2222-4222-8222-222222222222" recipeId="reaction-demo" idea="Show the actual app" settings={{ duration: 15, size: "1080x1920", captions: "clean", voice: "Kore", note: "End on a trial" }} onReady={onReady} onLater={onLater} onAlternative={vi.fn()} /></QueryClientProvider>);
  return { ...result, onReady, onLater };
}
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue({ business: "Our app", idea: "Show the actual app", files: [{ id: image, name: "Current dashboard screenshot.png", kind: "image" }], state: null }); mocks.recommend.mockResolvedValue({ file_ids: [] }); mocks.save.mockResolvedValue({ state: ready, brief: "Collection brief" }); mocks.upload.mockResolvedValue({ files: [], errors: ["Unsafe ZIP entry rejected"] }); });
afterEach(cleanup);
describe("professional asset requests", () => {
  it("reads available assets without automatically saving, uploading or generating", async () => {
    mount(); await screen.findByText("Could you provide these?"); expect(mocks.get).toHaveBeenCalledTimes(1); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copy developer request" })).toBeInTheDocument();
    expect(screen.getByText(/Please produce a short demo video/)).toHaveTextContent("Use demo data only");
  });
  it("selects Sam's relevant suggestions without saving until asked", async () => {
    mocks.recommend.mockResolvedValue({ file_ids: [image] });
    mount(); const checkbox = await screen.findByLabelText("Current dashboard screenshot.png");
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(checkbox); expect(checkbox).not.toBeChecked();
  });
  it("saves explicit selected media and exact options before becoming ready", async () => {
    const { onReady } = mount(); fireEvent.click(await screen.findByLabelText("Current dashboard screenshot.png"));
    fireEvent.click(screen.getByRole("button", { name: "Save asset choices" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0].data).toMatchObject({ file_ids: [image], duration: 15, captions: "clean", voice: "Kore", note: "End on a trial", deferred: false });
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(ready));
  });
  it("saves upload-later and returns without creating anything", async () => {
    mocks.save.mockResolvedValue({ state: { ...ready, deferred: true, status: "waiting_for_assets", file_ids: [], missing_inputs: ["App demo"] }, brief: "Collect screenshots" });
    const { onLater, onReady } = mount(); fireEvent.click(await screen.findByRole("button", { name: /I’ll upload later/ }));
    await waitFor(() => expect(onLater).toHaveBeenCalledTimes(1)); expect(mocks.save.mock.calls[0][0].data.deferred).toBe(true); expect(onReady).toHaveBeenLastCalledWith(null);
  });
  it("reports rejected archives accurately rather than claiming upload success", async () => {
    const { container } = mount(); await screen.findByText("Could you provide these?");
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["bad"], "unsafe.zip")] } });
    await screen.findByRole("alert"); expect(screen.getByRole("alert")).toHaveTextContent("Unsafe ZIP entry rejected"); expect(screen.getByRole("status")).toHaveTextContent("0 files imported"); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("restores waiting media choices from server state without resubmitting", async () => {
    mocks.get.mockResolvedValue({ business: "Our app", idea: "Show the actual app", files: [{ id: image, name: "Current dashboard screenshot.png", kind: "image" }], state: { ...ready, deferred: true, status: "waiting_for_assets" } });
    const { onReady } = mount(); const checkbox = await screen.findByLabelText("Current dashboard screenshot.png"); await waitFor(() => expect(checkbox).toBeChecked()); expect(onReady).toHaveBeenLastCalledWith(null); expect(mocks.save).not.toHaveBeenCalled();
  });
});
